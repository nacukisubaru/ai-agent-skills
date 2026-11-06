#!/usr/bin/env node
/**
 * shot.mjs — скриншоты для PDF-инструкций: настоящий десктопный экран + пометки.
 *
 * Почему не Playwright/playwright-mcp: в этом окружении браузер MCP живёт в окне
 * фиксированного размера. `page.setViewportSize()` меняет только layout viewport,
 * а поверхность композитора остаётся прежней, и Playwright дорисовывает низ кадра
 * белым — получается «обрезанный» скриншот. Здесь Chrome запускается сразу с нужным
 * размером окна, поэтому кадр всегда целый.
 *
 * Запуск:
 *   node shot.mjs tasks.json --out ./img --window 1600x1250
 *
 * Доступы админа скрипт читает сам: сначала переменные окружения SITE_ADMIN_LOGIN /
 * SITE_ADMIN_EMAIL / SITE_ADMIN_PASSWORD / SITE_BASE_URL, затем файлы
 * `.github/.env.local`, `.github/.env.local`, `.env.local`, `.env` в текущем
 * каталоге (первое найденное значение выигрывает). Имена переменных и особенности
 * проекта — `.github/project-features.md`. Переменные окружения имеют приоритет
 * над файлами, поэтому разовый запуск можно переопределить в строке команды.
 * Логин принимается и как LOGIN, и как email: мост сам подставит LOGIN.
 *
 * tasks.json:
 * {
 *   "base": "http://localhost:8080",
 *   "login": { "url": "/bitrix/?login=yes", "userField": "USER_LOGIN", "passField": "USER_PASSWORD" },
 *   "tasks": [
 *     { "name": "01-step-name",
 *       "url": "/путь/страницы/шага",
 *       "waitFor": "<селектор, доказывающий, что страница нужная>",
 *       "settle": 800,
 *       "actions": [ { "click": "<селектор>" }, { "wait": "<селектор>" }, { "sleep": 300 } ],
 *       "scrollTo": null,
 *       "marks": [ { "n": 1, "sel": "<селектор>", "expect": "<слово из элемента>" },
 *                  { "sel": "<селектор ключевого поля>", "style": "key", "expect": "<слово>" } ],
 *       "arrows": [ { "from": 1, "to": 2 } ] }
 *   ]
 * }
 *
 * mark.style: "key" — жёлтая рамка без номера (тот самый элемент, ради которого шаг),
 * по умолчанию — красная рамка + номер.
 * arrows: стрелка между двумя уже размеченными элементами; координаты не задаются —
 * концы считаются по getBoundingClientRect() этих элементов.
 *
 * Инвариант: координаты пометок не задаются руками. Рамку, номер и стрелку рисует тот
 * же evaluate(), который измерил getBoundingClientRect(). Промах возможен только при
 * неверном селекторе — и такой селектор отсекается проверкой expect.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const CHROME =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('usage: shot.mjs tasks.json --out <dir> [--window 1600x1250]');
  process.exit(2);
}

const tasksPath = resolve(argv[0]);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

// Local credentials live outside the repo (see .github/project-features.md).
// Real environment variables still win over the files.
const ENV_FILES = ['.github/.env.local', '.env.local', '.env'];

function loadEnvFiles(root) {
  const loaded = [];
  for (const rel of ENV_FILES) {
    const file = resolve(root, rel);
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].replace(/^(['"])(.*)\1$/, '$2').trim();
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
    loaded.push(file);
  }
  return loaded;
}

const envSources = loadEnvFiles(process.cwd());

const outDir = resolve(flag('--out', dirname(tasksPath)));
const [winW, winH] = (flag('--window', '1600x1250') || '').split('x').map(Number);
mkdirSync(outDir, { recursive: true });

const spec = JSON.parse(readFileSync(tasksPath, 'utf8'));
const base = (spec.base || process.env.SITE_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

const profile = resolve(outDir, '.chrome-profile');
rmSync(profile, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ CDP client ---

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      msg.error ? p.reject(new Error(`${msg.error.message} (${msg.error.code})`)) : p.resolve(msg.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async eval(expression, awaitPromise = true) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result.value;
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

// ------------------------------------------------------------------- annotate ---

const DRAW = (payload) => `(async () => {
  const { marks, scrollTo, arrows } = ${JSON.stringify(payload)};
  const PAD = 10, VW = innerWidth, VH = innerHeight, errors = [];
  const RED = '#d61f2d', KEY = '#ffe147';

  const scrollable = (node) => {
    if (!node || node.nodeType !== 1) return false;
    const cs = getComputedStyle(node);
    if (!/(auto|scroll)/.test(cs.overflowY)) return false;
    return node.scrollHeight > node.clientHeight + 4;
  };
  const scrollToCenter = async (el) => {
    for (let pass = 0; pass < 4; pass += 1) {
      const r = el.getBoundingClientRect();
      const delta = r.top + r.height / 2 - innerHeight / 2;
      if (Math.abs(delta) < 4) return;
      let node = el.parentElement;
      let scroller = null;
      while (node && node !== document.documentElement) {
        if (scrollable(node)) { scroller = node; break; }
        node = node.parentElement;
      }
      if (scroller) scroller.scrollTop += delta;
      else window.scrollBy(0, delta);
      await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
    }
  };

  if (scrollTo) {
    const target = document.querySelector(scrollTo);
    if (!target) return { errors: ['scrollTo: нет элемента ' + scrollTo] };
    target.scrollIntoView({ block: 'center', inline: 'nearest' });
    await scrollToCenter(target);
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  document.getElementById('__shot_overlay')?.remove();
  const layer = document.createElement('div');
  layer.id = '__shot_overlay';
  layer.style.cssText = 'position:fixed;inset:0;margin:0;border:0;padding:0;background:transparent;' +
    'overflow:visible;z-index:2147483647;pointer-events:none';
  // Top layer: an open <dialog> or popover paints above any z-index, so a plain fixed
  // layer would hide the marks behind the modal. As a manual popover the layer joins
  // the top layer and is placed after (above) the dialog.
  layer.setAttribute('popover', 'manual');
  document.body.appendChild(layer);
  const layerCss = document.createElement('style');
  layerCss.textContent = '#__shot_overlay::backdrop{display:none!important}';
  document.head.appendChild(layerCss);
  try { layer.showPopover(); } catch (e) { /* browsers without Popover API: keep plain layer */ }

  const out = [];
  const label = (mark) => (mark.n != null ? 'шаг ' + mark.n : 'key');
  for (const mark of marks) {
    const key = mark.style === 'key';
    const tag = label(mark);
    if (mark.n == null && !key) { errors.push('пометка без n и без style:"key": ' + mark.sel); continue; }
    let nodes = Array.from(document.querySelectorAll(mark.sel));
    if (mark.text) {
      const needle = String(mark.text).replace(/\\s+/g, ' ').trim().toLowerCase();
      nodes = nodes.filter((n) => String(n.innerText ?? n.value ?? '').replace(/\\s+/g, ' ').trim().toLowerCase().includes(needle));
    }
    if (nodes.length !== 1 && Number.isInteger(mark.index)) {
      if (!nodes[mark.index]) { errors.push(tag + ': «' + mark.sel + '» — нет элемента с индексом ' + mark.index + ' (всего ' + nodes.length + ')'); continue; }
      nodes = [nodes[mark.index]];
    }
    if (nodes.length !== 1) { errors.push(tag + ': «' + mark.sel + '» — элементов ' + nodes.length + ', нужен 1'); continue; }
    const el = nodes[0];
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) { errors.push(tag + ': «' + mark.sel + '» невидим'); continue; }
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) { errors.push(tag + ': «' + mark.sel + '» нулевой размер'); continue; }
    if (r.top < 0 || r.left < 0 || r.bottom > VH || r.right > VW) {
      errors.push(tag + ': «' + mark.sel + '» не влезает в кадр — ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ' при ' + VW + 'x' + VH);
      continue;
    }
    const hay = [el.innerText, el.value, el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('title')]
      .filter(Boolean).join(' ').replace(/\\s+/g, ' ');
    if (mark.expect && !hay.toLowerCase().includes(String(mark.expect).toLowerCase())) {
      errors.push(tag + ': в «' + mark.sel + '» нет текста «' + mark.expect + '». Есть: «' + hay.slice(0, 140) + '»');
      continue;
    }
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), VW - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 0), VH - 1);
    const hit = document.elementFromPoint(cx, cy);
    if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
      errors.push(tag + ': «' + mark.sel + '» перекрыт <' + hit.tagName.toLowerCase() + '>');
      continue;
    }

    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:' + (r.left - 4) + 'px;top:' + (r.top - 4) + 'px;width:' + (r.width + 8) + 'px;height:' + (r.height + 8) + 'px;' +
      'border:3px solid ' + (key ? KEY : RED) + ';border-radius:6px;' +
      (key ? 'box-shadow:0 0 0 2px rgba(255,255,255,.9)' : 'box-shadow:0 0 0 3px rgba(255,255,255,.9),0 0 0 6px rgba(214,31,45,.25)');
    layer.appendChild(box);

    if (!key) {
      const R = 19;
      const bx = Math.min(Math.max(r.left - R + 6, PAD), VW - R * 2 - PAD);
      const by = Math.min(Math.max(r.top - R + 6, PAD), VH - R * 2 - PAD);
      const badge = document.createElement('div');
      badge.textContent = String(mark.n);
      badge.style.cssText = 'position:fixed;left:' + bx + 'px;top:' + by + 'px;width:' + R * 2 + 'px;height:' + R * 2 + 'px;' +
        'border-radius:50%;background:' + RED + ';color:#fff;border:3px solid #fff;display:flex;align-items:center;' +
        'justify-content:center;font:700 22px/1 -apple-system,Arial,sans-serif';
      layer.appendChild(badge);
    }

    out.push({ n: mark.n ?? null, sel: mark.sel, style: key ? 'key' : 'frame', rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
  }

  // --- стрелки: концы считаются по прямоугольникам уже проверенных пометок ---
  const byN = new Map(out.filter((m) => m.n != null).map((m) => [String(m.n), m]));
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', String(VW));
  svg.setAttribute('height', String(VH));
  svg.style.cssText = 'position:absolute;left:0;top:0;width:' + VW + 'px;height:' + VH + 'px;overflow:visible';
  layer.insertBefore(svg, layer.firstChild);

  const edge = (rect, towards) => {
    const cx = rect[0] + rect[2] / 2, cy = rect[1] + rect[3] / 2;
    const dx = towards.x - cx, dy = towards.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    const sx = dx ? rect[2] / 2 / Math.abs(dx) : Infinity;
    const sy = dy ? rect[3] / 2 / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s };
  };

  for (const arrow of arrows || []) {
    const a = byN.get(String(arrow.from));
    const b = byN.get(String(arrow.to));
    const tag = 'стрелка ' + arrow.from + '→' + arrow.to;
    if (!a || !b) { errors.push(tag + ': нет пометки ' + (!a ? arrow.from : arrow.to)); continue; }
    const ac = { x: a.rect[0] + a.rect[2] / 2, y: a.rect[1] + a.rect[3] / 2 };
    const bc = { x: b.rect[0] + b.rect[2] / 2, y: b.rect[1] + b.rect[3] / 2 };
    const s0 = edge(a.rect, bc), e0 = edge(b.rect, ac);
    const len = Math.hypot(e0.x - s0.x, e0.y - s0.y);
    if (len < 32) { errors.push(tag + ': элементы почти совпадают, стрелка не нужна'); continue; }
    const ux = (e0.x - s0.x) / len, uy = (e0.y - s0.y) / len;
    // рамка стоит в 4px снаружи элемента: стрелка начинается и заканчивается на рамке
    const s = { x: s0.x + ux * 4, y: s0.y + uy * 4 };
    const tip = { x: e0.x - ux * 4, y: e0.y - uy * 4 };
    if ([s.x, s.y, tip.x, tip.y].some((v, i) => v < 0 || v > (i % 2 ? VH : VW))) {
      errors.push(tag + ': выходит за кадр');
      continue;
    }
    const head = Math.min(28, Math.max(16, len * 0.16));
    const base = { x: tip.x - ux * head, y: tip.y - uy * head };
    const nx = -uy, ny = ux, hw = head * 0.5;
    const poly = [
      [tip.x, tip.y],
      [base.x + nx * hw, base.y + ny * hw],
      [base.x - nx * hw, base.y - ny * hw],
    ];

    const path = (pts, color, width) => {
      const p = document.createElementNS(svgNS, 'polyline');
      p.setAttribute('points', pts.map((q) => q.x.toFixed(1) + ',' + q.y.toFixed(1)).join(' '));
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', color);
      p.setAttribute('stroke-width', String(width));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
      return p;
    };
    const tri = (pts, color, grow) => {
      const cxh = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
      const cyh = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      const g = pts.map((q) => [cxh + (q[0] - cxh) * grow, cyh + (q[1] - cyh) * grow]);
      const el = document.createElementNS(svgNS, 'polygon');
      el.setAttribute('points', g.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' '));
      el.setAttribute('fill', color);
      svg.appendChild(el);
    };

    path([s, base], 'rgba(255,255,255,.9)', 15);
    tri(poly, 'rgba(255,255,255,.9)', 1.25);
    path([s, base], RED, 9);
    tri(poly, RED, 1);
    out.push({ arrow: arrow.from + '->' + arrow.to, from: s0, to: e0 });
  }

  return { errors, out, viewport: [VW, VH] };
})()`;

// ----------------------------------------------------------------------- login ---

const BRIDGE_PHP = `<?php
require $_SERVER['DOCUMENT_ROOT'] . '/bitrix/modules/main/include/prolog_before.php';
global $USER;
header('Content-Type: text/plain; charset=utf-8');
if ($USER->IsAuthorized()) {
    echo 'OK ' . (int)$USER->GetID();
    return;
}

// Bitrix Login() takes LOGIN, not email: resolve LOGIN by EMAIL first.
function shot_resolve_login(string $value): string
{
    if (strpos($value, '@') === false) {
        return $value;
    }
    $row = CUser::GetList('id', 'asc', ['EMAIL' => $value], ['FIELDS' => ['ID', 'LOGIN', 'EMAIL']])->Fetch();
    return $row ? (string)$row['LOGIN'] : $value;
}

$login = (string)($_POST['l'] ?? '');
$pass = (string)($_POST['p'] ?? '');
$ok = $USER->Login(shot_resolve_login($login), $pass, 'Y');
echo $ok ? 'OK ' . (int)$USER->GetID() : 'FAIL ' . strip_tags((string)$USER->LAST_ERROR);
`;

/**
 * Вход в админку.
 *
 * Форма входа Bitrix закрывается капчей после нескольких неудачных попыток, поэтому
 * используется серверный мост: временный PHP-файл вызывает $USER->Login() и удаляется
 * сразу после входа. Пароль берётся из окружения и в файл не попадает.
 */
async function loginAdmin(cdp, { base, user, pass, login }) {
  const bridge = login.bridge;
  if (bridge) {
    const file = resolve(process.cwd(), bridge.path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, BRIDGE_PHP);
    try {
      await goto(cdp, base + (bridge.probe || '/'));
      const body = `new URLSearchParams({ l: ${JSON.stringify(user)}, p: ${JSON.stringify(pass)} }).toString()`;
      const out = await cdp.eval(
        `fetch(${JSON.stringify(bridge.url)}, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ${body} }).then(r => r.text())`,
      );
      if (process.env.SHOT_DEBUG) console.log(`  bridge: ${String(out).slice(0, 160)}`);
      if (!String(out).startsWith('OK')) throw new Error(`мост авторизации ответил: ${String(out).slice(0, 200)}`);
    } finally {
      rmSync(file, { force: true });
    }
  }

  await goto(cdp, base + (login.check || '/bitrix/admin/index.php'));

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ok = await cdp.eval(`!!document.querySelector('.adm-header-search, #bx-panel, .adm-detail-tabs-block')`, false);
    if (ok) return;
    await sleep(300);
  }

  if (process.env.SHOT_DEBUG) {
    const dump = await cdp.eval(`location.href + ' || ' + document.title`, false);
    console.log(`  login dump: ${dump}`);
  }
  throw new Error('вход в админку не удался: откройте /bitrix вручную и проверьте доступы');
}

// ----------------------------------------------------------------------- main ---

async function waitReady(cdp, selector, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await cdp.eval(
      `document.readyState === 'complete' && ${selector ? `!!document.querySelector(${JSON.stringify(selector)})` : 'true'}`,
      false,
    );
    if (ready) return true;
    await sleep(150);
  }
  throw new Error(`не дождались ${selector || 'readyState=complete'}`);
}

async function goto(cdp, url) {
  await cdp.send('Page.navigate', { url });
  await waitReady(cdp, null, 25000);
  const where = await cdp.eval(`location.href + ' | ' + document.title`, false);
  if (process.env.SHOT_DEBUG) console.log(`  → ${where}`);
}

async function runAction(cdp, action) {
  if (action.sleep) return sleep(action.sleep);
  if (action.wait) return waitReady(cdp, action.wait, action.timeout || 15000);
  if (action.goto) return goto(cdp, action.goto.startsWith('http') ? action.goto : base + action.goto);
  if (action.click) {
    const ok = await cdp.eval(`(() => { const e = document.querySelector(${JSON.stringify(action.click)}); if (!e) return false; e.scrollIntoView({block:'center'}); e.click(); return true; })()`, false);
    if (!ok) throw new Error(`click: нет элемента ${action.click}`);
    await sleep(action.settle || 1200);
    return waitReady(cdp, null, 20000);
  }
  if (action.fill) {
    const { sel, value } = action.fill;
    const ok = await cdp.eval(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const proto = Object.getPrototypeOf(e); Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(String(value))}); e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`,
      false,
    );
    if (!ok) throw new Error(`fill: нет элемента ${sel}`);
    await sleep(150);
    return undefined;
  }
  if (action.select) {
    const { sel, value } = action.select;
    const ok = await cdp.eval(
      `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.value = ${JSON.stringify(String(value))}; e.dispatchEvent(new Event('change', {bubbles:true})); return true; })()`,
      false,
    );
    if (!ok) throw new Error(`select: нет элемента ${sel}`);
    await sleep(150);
    return undefined;
  }
  if (action.js) return cdp.eval(action.js);
  throw new Error(`неизвестное действие: ${JSON.stringify(action)}`);
}

async function main() {
  if (!existsSync(CHROME)) {
    throw new Error(`Chrome не найден: ${CHROME}. Укажите CHROME_BIN.`);
  }

  const chrome = spawn(
    CHROME,
    [
      '--headless=new',
      '--hide-scrollbars',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      `--window-size=${winW},${winH}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );

  const portFile = resolve(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i += 1) await sleep(100);
  if (!existsSync(portFile)) {
    chrome.kill('SIGKILL');
    throw new Error('Chrome не отдал DevToolsActivePort');
  }
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const pageTarget = targets.find((t) => t.type === 'page');
  if (!pageTarget) {
    chrome.kill('SIGKILL');
    throw new Error('в Chrome нет страницы');
  }

  const cdp = new CDP(pageTarget.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const results = [];

  try {
    // Логин: только через админку. На публичной части вход с правами админа запрещён.
    // Доступы берутся из окружения (.github/.env.local), см. bitrix-login.
    const login = spec.login || {};
    const adminUser = process.env.SITE_ADMIN_LOGIN || process.env.SITE_ADMIN_EMAIL;
    const user = adminUser || login.user;
    const pass = process.env.SITE_ADMIN_PASSWORD || login.pass;
    const needsLogin = Boolean(spec.login || adminUser);
    if (user && pass) {
      await loginAdmin(cdp, { base, user, pass, login });
    } else if (needsLogin) {
      throw new Error(
        'нет доступов для входа. Заполните .github/.env.local (SITE_ADMIN_LOGIN или SITE_ADMIN_EMAIL + SITE_ADMIN_PASSWORD)\n' +
          `  прочитанные env-файлы: ${envSources.length ? envSources.join(', ') : 'нет'}\n` +
          '  имена переменных: .github/project-features.md; если доступов нет и там — спросите пользователя',
      );
    }

    for (const task of spec.tasks) {
      const line = (msg) => console.log(`[${task.name}] ${msg}`);

      if (task.url) await goto(cdp, task.url.startsWith('http') ? task.url : base + task.url);
      if (task.waitFor) await waitReady(cdp, task.waitFor);
      await sleep(task.settle ?? 700);

      for (const action of task.actions || []) await runAction(cdp, action);
      if (task.afterWaitFor) await waitReady(cdp, task.afterWaitFor);
      if (task.afterSettle) await sleep(task.afterSettle);

      const drawn = await cdp.eval(DRAW({ marks: task.marks || [], scrollTo: task.scrollTo || null, arrows: task.arrows || [] }));
      if (drawn.errors.length) {
        await cdp.eval(`document.getElementById('__shot_overlay')?.remove()`, false);
        throw new Error(`\n${task.name}: пометки не поставлены, снимок не сделан:\n  ` + drawn.errors.join('\n  '));
      }

      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      await cdp.eval(`document.getElementById('__shot_overlay')?.remove()`, false);

      const file = resolve(outDir, `${task.name}.png`);
      writeFileSync(file, Buffer.from(shot.data, 'base64'));

      const [vw, vh] = drawn.viewport;
      const markNames = drawn.out.filter((m) => m.rect).map((m) => (m.style === 'key' ? 'key' : m.n)).join(',') || '—';
      const arrowNames = drawn.out.filter((m) => m.arrow).map((m) => m.arrow).join(',');
      line(`${file}  ${vw}x${vh}  marks: ${markNames}${arrowNames ? '  arrows: ' + arrowNames : ''}`);
      results.push({ name: task.name, file, viewport: [vw, vh], marks: drawn.out.filter((m) => m.rect), arrows: drawn.out.filter((m) => m.arrow) });
    }
  } finally {
    cdp.close();
    chrome.kill('SIGTERM');
    await sleep(300);
    chrome.kill('SIGKILL');
  }

  writeFileSync(resolve(outDir, 'marks.json'), JSON.stringify({ viewport: results[0]?.viewport, shots: results }, null, 2));
  console.log(`\nГотово: ${results.length} снимков, marks.json записан.`);
}

main().catch((e) => {
  console.error('\nОШИБКА:', e.message);
  process.exit(1);
});

/* capture-step.js — «формула» съёмки одного скриншота для PDF-инструкции.
 *
 * Как использовать: скопировать ЭТОТ ФАЙЛ ЦЕЛИКОМ в один вызов playwright-mcp
 * `runPlaywrightCode` и заменить только объект SPEC. Код ниже не менять.
 *
 * В SPEC нет ни одного адреса и ни одного пути из прошлых задач: всё, что относится
 * к конкретной инструкции, заполняется заново под текущий шаг.
 *
 * Инвариант: координаты пометок не задаются руками. Рамку и номер рисует тот же
 * evaluate(), который измерил getBoundingClientRect(). Поэтому промах невозможен
 * by construction — «стрелка не туда» получается только при неверном селекторе,
 * и такой селектор отсекается проверкой expect.
 *
 * Любая непройденная проверка = исключение. Снимок не делается, файл не пишется.
 */

const SPEC = {
  // 1. КУДА: адрес страницы ИМЕННО ЭТОГО шага
  url: '<URL страницы шага>',
  // 2. КУДА ПИСАТЬ: абсолютный путь к снимку в папке текущей инструкции
  //    <repo>/.github/docs/instructions/<slug>/img/<NN-имя>.png
  shot: '<абсолютный путь к снимку>',
  // 3. ХОЛСТ: всегда десктоп 1600×1200, без мобильной эмуляции
  viewport: { width: 1600, height: 1200 },
  // 4. ЧЕГО ЖДАТЬ: селектор, доказывающий, что страница нужная
  anchor: 'body',
  settle: 1200,
  // 5. ПЕРЕЗАГРУЖАТЬ ЛИ страницу: false — снимать текущее состояние
  //    (отчёт после нажатия кнопки: перезагрузка съест сообщение)
  reload: true,
  // 6. ЧТО ПОКАЗАТЬ: селектор, который надо ввести в кадр (null — страница сверху)
  scrollTo: null,
  // 7. ЧТО ПОМЕТИТЬ: только элементы, о которых говорится в тексте шага.
  //    n — красная рамка + номер шага; style:'key' — жёлтая рамка без номера
  //    для того самого элемента, ради которого шаг.
  marks: [],
  // 8. СТРЕЛКИ: между двумя уже размеченными элементами по их номерам.
  //    Координаты не задаются — концы считаются по прямоугольникам элементов.
  arrows: [],
  // 9. ДОПОЛНИТЕЛЬНЫЕ ДЕЙСТВИЯ до съёмки (открыть таб, модалку, заполнить поле)
  prep: null,
};

// ---------------------------------------------------------------- не менять ---
await page.setViewportSize(SPEC.viewport);
if (SPEC.reload !== false) {
  await page.goto(SPEC.url, { waitUntil: 'load' });
}
if (SPEC.anchor) await page.waitForSelector(SPEC.anchor, { timeout: 20000 });
await page.waitForTimeout(SPEC.settle ?? 1000);
if (SPEC.prep) await SPEC.prep(page);

const expectText = (mark) => String(mark.expect || '').trim();

const drawn = await page.evaluate(
  async ({ marks, arrows, scrollTo }) => {
    const PAD = 10;
    const VW = window.innerWidth;
    const VH = window.innerHeight;
    const errors = [];
    const RED = '#d61f2d';
    const KEY = '#ffe147';

    if (scrollTo) {
      const el = document.querySelector(scrollTo);
      if (!el) return { errors: [`scrollTo: нет элемента ${scrollTo}`] };
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    document.getElementById('__shot_overlay')?.remove();
    const layer = document.createElement('div');
    layer.id = '__shot_overlay';
    layer.style.cssText =
      'position:fixed;inset:0;z-index:2147483647;pointer-events:none;font:700 20px/1 -apple-system,Arial,sans-serif';
    document.body.appendChild(layer);

    const out = [];

    for (const mark of marks) {
      const sel = mark.sel;
      const isKey = mark.style === 'key';
      const tag = mark.n != null ? mark.n : 'key';
      if (mark.n == null && !isKey) {
        errors.push(`${sel}: пометка без n и без style:"key"`);
        continue;
      }
      const nodes = document.querySelectorAll(sel);
      if (nodes.length !== 1) {
        errors.push(`${tag}: селектор «${sel}» дал ${nodes.length} элементов, нужен ровно 1`);
        continue;
      }
      const el = nodes[0];

      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        errors.push(`${tag}: «${sel}» невидим (display/visibility/opacity)`);
        continue;
      }

      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) {
        errors.push(`${tag}: «${sel}» имеет размер ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
        continue;
      }
      if (r.top < 0 || r.left < 0 || r.bottom > VH || r.right > VW) {
        errors.push(
          `${tag}: «${sel}» не влезает в кадр ` +
            `(${r.left.toFixed(0)},${r.top.toFixed(0)})-(${r.right.toFixed(0)},${r.bottom.toFixed(0)}) ` +
            `при ${VW}×${VH}`,
        );
        continue;
      }

      // Семантическая проверка: в элементе действительно тот текст, о котором говорит шаг.
      const haystack = [
        el.innerText,
        el.value,
        el.getAttribute('aria-label'),
        el.getAttribute('placeholder'),
        el.getAttribute('title'),
        el.getAttribute('alt'),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ');
      const expect = String(mark.expect || '').trim();
      if (expect && !haystack.toLowerCase().includes(expect.toLowerCase())) {
        errors.push(`${tag}: в «${sel}» нет текста «${expect}». Найдено: «${haystack.slice(0, 120)}»`);
        continue;
      }

      // Элемент не перекрыт другим слоем (модалка, меню, панель).
      const cx = Math.min(Math.max(r.left + r.width / 2, 0), VW - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 0), VH - 1);
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
        errors.push(
          `${tag}: «${sel}» перекрыт элементом <${hit.tagName.toLowerCase()} class="${String(hit.className).slice(0, 40)}">`,
        );
        continue;
      }

      // Рамка: ровно по измеренному прямоугольнику.
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;left:${r.left - 4}px;top:${r.top - 4}px;` +
        `width:${r.width + 8}px;height:${r.height + 8}px;border:3px solid ${isKey ? KEY : RED};border-radius:6px;` +
        (isKey
          ? 'box-shadow:0 0 0 2px rgba(255,255,255,.9)'
          : 'box-shadow:0 0 0 3px rgba(255,255,255,.9),0 0 0 6px rgba(214,31,45,.25)');
      layer.appendChild(box);

      if (!isKey) {
        // Номер: у левого верхнего угла рамки, всегда внутри кадра.
        const R = 19;
        let bx = r.left - R + 6;
        let by = r.top - R + 6;
        bx = Math.min(Math.max(bx, PAD), VW - R * 2 - PAD);
        by = Math.min(Math.max(by, PAD), VH - R * 2 - PAD);
        const badge = document.createElement('div');
        badge.textContent = String(mark.n);
        badge.style.cssText = `position:fixed;left:${bx}px;top:${by}px;width:${R * 2}px;height:${R * 2}px;` +
          `border-radius:50%;background:${RED};color:#fff;border:3px solid #fff;` +
          'display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1';
        layer.appendChild(badge);
      }

      out.push({
        n: mark.n ?? null,
        sel,
        style: isKey ? 'key' : 'frame',
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      });
    }

    // --- стрелки: концы считаются по прямоугольникам уже проверенных пометок ---
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(VW));
    svg.setAttribute('height', String(VH));
    svg.style.cssText = `position:absolute;left:0;top:0;width:${VW}px;height:${VH}px;overflow:visible`;
    layer.insertBefore(svg, layer.firstChild);

    const byN = new Map(out.filter((m) => m.n != null).map((m) => [String(m.n), m]));
    const edge = (rect, towards) => {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const dx = towards.x - cx;
      const dy = towards.y - cy;
      if (!dx && !dy) return { x: cx, y: cy };
      const sx = dx ? rect.w / 2 / Math.abs(dx) : Infinity;
      const sy = dy ? rect.h / 2 / Math.abs(dy) : Infinity;
      const s = Math.min(sx, sy);
      return { x: cx + dx * s, y: cy + dy * s };
    };

    for (const arrow of arrows || []) {
      const a = byN.get(String(arrow.from));
      const b = byN.get(String(arrow.to));
      const tag = `стрелка ${arrow.from}→${arrow.to}`;
      if (!a || !b) {
        errors.push(`${tag}: нет пометки ${!a ? arrow.from : arrow.to}`);
        continue;
      }
      const ac = { x: a.rect.x + a.rect.w / 2, y: a.rect.y + a.rect.h / 2 };
      const bc = { x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 };
      const s0 = edge(a.rect, bc);
      const e0 = edge(b.rect, ac);
      const len = Math.hypot(e0.x - s0.x, e0.y - s0.y);
      if (len < 32) {
        errors.push(`${tag}: элементы почти совпадают, стрелка не нужна`);
        continue;
      }
      const ux = (e0.x - s0.x) / len;
      const uy = (e0.y - s0.y) / len;
      // рамка стоит в 4px снаружи элемента: стрелка начинается и заканчивается на рамке
      const s = { x: s0.x + ux * 4, y: s0.y + uy * 4 };
      const tip = { x: e0.x - ux * 4, y: e0.y - uy * 4 };
      if ([s.x, s.y, tip.x, tip.y].some((v, i) => v < 0 || v > (i % 2 ? VH : VW))) {
        errors.push(`${tag}: выходит за кадр`);
        continue;
      }
      const head = Math.min(28, Math.max(16, len * 0.16));
      const base = { x: tip.x - ux * head, y: tip.y - uy * head };
      const nx = -uy;
      const ny = ux;
      const hw = head * 0.5;
      const poly = [
        [tip.x, tip.y],
        [base.x + nx * hw, base.y + ny * hw],
        [base.x - nx * hw, base.y - ny * hw],
      ];

      const line = (pts, color, width) => {
        const p = document.createElementNS(svgNS, 'polyline');
        p.setAttribute('points', pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', color);
        p.setAttribute('stroke-width', String(width));
        p.setAttribute('stroke-linecap', 'round');
        p.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(p);
      };
      const triangle = (color, grow) => {
        const mx = (poly[0][0] + poly[1][0] + poly[2][0]) / 3;
        const my = (poly[0][1] + poly[1][1] + poly[2][1]) / 3;
        const el = document.createElementNS(svgNS, 'polygon');
        el.setAttribute(
          'points',
          poly.map((q) => `${(mx + (q[0] - mx) * grow).toFixed(1)},${(my + (q[1] - my) * grow).toFixed(1)}`).join(' '),
        );
        el.setAttribute('fill', color);
        svg.appendChild(el);
      };

      line([s, base], 'rgba(255,255,255,.9)', 15);
      triangle('rgba(255,255,255,.9)', 1.25);
      line([s, base], RED, 9);
      triangle(RED, 1);
      out.push({ arrow: `${arrow.from}->${arrow.to}`, from: s0, to: e0 });
    }

    return { errors, marks: out.filter((m) => m.rect), arrows: out.filter((m) => m.arrow), viewport: { w: VW, h: VH } };
  },
  {
    marks: (SPEC.marks || []).map((m) => ({ n: m.n, sel: m.sel, style: m.style, expect: expectText(m) })),
    arrows: SPEC.arrows || [],
    scrollTo: SPEC.scrollTo,
  },
);

if (drawn.errors?.length) {
  await page.evaluate(() => document.getElementById('__shot_overlay')?.remove());
  throw new Error('ПОМЕТКИ НЕ ПОСТАВЛЕНЫ, снимок не сделан:\n' + drawn.errors.join('\n'));
}

const shot = await page.screenshot({ path: SPEC.shot, fullPage: false });
await page.evaluate(() => document.getElementById('__shot_overlay')?.remove());

return {
  shot: SPEC.shot,
  bytes: shot.length,
  viewport: drawn.viewport,
  marks: drawn.marks,
  arrows: drawn.arrows,
};

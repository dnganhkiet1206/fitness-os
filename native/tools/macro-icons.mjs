/**
 * The four macro icons, drawn big enough to judge.
 *
 *   node tools/macro-icons.mjs   →  /tmp/macro-icons.html
 *
 * They are used at fourteen points, which is the size at which a drawing
 * either reads or does not and no amount of squinting at a screenshot tells you
 * which. The first pass looked fine in the file and came out as a spanner and a
 * thermometer on the device — so they get looked at at 96, and at 14 beside it,
 * on the same page.
 *
 * It reads the paths out of `macro-icons.tsx` rather than restating them.
 * A preview built from a copy of the artwork is a preview of the copy.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('src/components/ascnd/macro-icons.tsx', 'utf8');

/** each exported icon, and the source between it and the next one */
const NAMES = ['ProteinIcon', 'CarbIcon', 'FatIcon', 'FiberIcon'];
const bodies = {};
for (let i = 0; i < NAMES.length; i++) {
  const from = src.indexOf(`export function ${NAMES[i]}`);
  const to = i + 1 < NAMES.length ? src.indexOf(`export function ${NAMES[i + 1]}`) : src.indexOf('export const MACRO_ICON');
  if (from < 0 || to < 0) throw new Error(`không thấy ${NAMES[i]} trong macro-icons.tsx`);
  bodies[NAMES[i]] = src.slice(from, to);
}

/**
 * Turn one component's JSX into SVG markup.
 *
 * Only what these files actually use — `<Path>`, `<Circle>` and the handful of
 * props on them. Anything else throws rather than being skipped: an element
 * silently dropped from a preview is the one you then cannot see is missing.
 */
function toSvg(body, color, cut, size) {
  const out = [];
  const re = /<(Path|Circle)\b([\s\S]*?)\/>/g;
  let m;
  while ((m = re.exec(body))) {
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const get = (name) => {
      const lit = new RegExp(`${name}=\\{?["'\`]([^"'\`]*)["'\`]\\}?`).exec(attrs);
      if (lit) return lit[1];
      const num = new RegExp(`${name}=\\{([\\d.]+)\\}`).exec(attrs);
      if (num) return num[1];
      const ident = new RegExp(`${name}=\\{(color|cut)\\}`).exec(attrs);
      if (ident) return ident[1] === 'color' ? color : cut;
      return null;
    };
    // A `d` still holding a template placeholder is artwork this tool cannot
    // draw, and drawing it anyway means the browser silently discards the path
    // and the preview shows a shape with a piece missing. That happened to the
    // wheat, and it cost a round of redrawing artwork that was already correct.
    const d = get('d');
    if (d && d.includes('${')) {
      throw new Error(`path còn chỗ nội suy: ${d.slice(0, 50)} — viết thẳng ra trong macro-icons.tsx`);
    }
    const pairs = [
      ['d', d],
      ['cx', get('cx')],
      ['cy', get('cy')],
      ['r', get('r')],
      ['fill', get('fill')],
      ['stroke', get('stroke')],
      ['stroke-width', get('strokeWidth')],
      ['stroke-linecap', get('strokeLinecap')],
      ['opacity', get('opacity')],
    ].filter(([, v]) => v != null);
    out.push(`<${tag} ${pairs.map(([k, v]) => `${k}="${v}"`).join(' ')} />`);
  }
  if (out.length === 0) throw new Error('không đọc được hình nào — regex JSX đã lệch');
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24">${out.join('')}</svg>`;
}

const TINT = {
  ProteinIcon: '#f59e0b',
  CarbIcon: '#3e86ea',
  FatIcon: '#f17b27',
  FiberIcon: '#3ecf8e',
};
const CUT = '#0b0b0d';

const cells = NAMES.map(
  (n) => `<figure>
    <div class="big">${toSvg(bodies[n], TINT[n], CUT, 96)}</div>
    <div class="row">
      ${toSvg(bodies[n], TINT[n], CUT, 14)}
      ${toSvg(bodies[n], '#8b8b93', CUT, 14)}
      <span>${n.replace('Icon', '')}</span>
    </div>
  </figure>`,
).join('');

writeFileSync(
  '/tmp/macro-icons.html',
  `<body style="margin:0;background:${CUT};color:#ededed;font:14px -apple-system,system-ui,sans-serif">
  <div style="display:flex;gap:28px;padding:28px">${cells}</div>
  <style>
    figure{margin:0;display:flex;flex-direction:column;gap:14px;align-items:center}
    .big{background:#141418;border-radius:16px;padding:14px;line-height:0}
    .row{display:flex;align-items:center;gap:8px;color:#8b8b93}
  </style>
  </body>`,
);
console.log(`vẽ ${NAMES.length} icon → /tmp/macro-icons.html`);

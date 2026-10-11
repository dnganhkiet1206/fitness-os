// SVG markup (của react-dom/server hay tự viết) ⇄ cây phần tử kiểu KoaRender.Element
// { t, p, m?, k? }. Chỉ đủ cho tập thẻ của cảnh studio.
const TAG = {
  svg: 'Svg', g: 'G', path: 'Path', rect: 'Rect', circle: 'Circle', ellipse: 'Ellipse', line: 'Line', defs: 'Defs',
  clippath: 'ClipPath', lineargradient: 'LinearGradient', radialgradient: 'RadialGradient', stop: 'Stop', text: 'Text',
};
const BACK = Object.fromEntries(Object.entries(TAG).map(([k, v]) => [v, { clippath: 'clipPath', lineargradient: 'linearGradient', radialgradient: 'radialGradient' }[k] ?? k]));
const camel = (s) => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = { strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin', stopColor: 'stop-color',
  stopOpacity: 'stop-opacity', fillOpacity: 'fill-opacity', strokeOpacity: 'stroke-opacity', textAnchor: 'text-anchor',
  fontSize: 'font-size', fontWeight: 'font-weight', letterSpacing: 'letter-spacing', clipPath: 'clip-path', fillRule: 'fill-rule' };
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function transform(s) {
  let m = [1, 0, 0, 1, 0, 0];
  for (const [, fn, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args.split(/[\s,]+/).filter(Boolean).map(Number);
    if (fn === 'translate') m = mul(m, [1, 0, 0, 1, a[0], a[1] ?? 0]);
    else if (fn === 'scale') m = mul(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0]);
    else if (fn === 'matrix') m = mul(m, a);
    else if (fn === 'rotate') {
      const r = (a[0] * Math.PI) / 180, c = Math.cos(r), sn = Math.sin(r);
      const cx = a[1] ?? 0, cy = a[2] ?? 0;
      m = mul(m, mul(mul([1, 0, 0, 1, cx, cy], [c, sn, -sn, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]));
    } else throw new Error('transform ' + fn);
  }
  return m;
}

function parse(markup) {
  const root = { t: 'root', p: {}, k: [] };
  const stack = [root];
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z0-9:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  for (const m of markup.matchAll(re)) {
    if (m[5] !== undefined) {
      const txt = unesc(m[5]);
      if (txt.trim() && stack.at(-1).t === 'Text') stack.at(-1).p.text = (stack.at(-1).p.text ?? '') + txt;
      continue;
    }
    const [, close, name, attrs, self] = m;
    const t = TAG[name.toLowerCase()];
    if (!t) throw new Error('tag ' + name);
    if (close) { stack.pop(); continue; }
    const e = { t, p: {} };
    for (const [, k, v] of attrs.matchAll(/([a-zA-Z0-9:-]+)="([^"]*)"/g)) {
      const key = camel(k), val = unesc(v);
      if (key === 'xmlns') continue;
      if (key === 'transform') { e.m = transform(val); continue; }
      e.p[key] = /^-?\d*\.?\d+(e-?\d+)?$/.test(val) ? Number(val) : val;
    }
    (stack.at(-1).k ??= []).push(e);
    if (!self) stack.push(e);
  }
  return root.k;
}

const num = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);
function emit(e) {
  const tag = BACK[e.t];
  const attrs = Object.entries(e.p).filter(([k]) => k !== 'text').map(([k, v]) => `${kebab[k] ?? k}="${String(num(v)).replace(/"/g, '&quot;')}"`);
  if (e.m) attrs.push(`transform="matrix(${e.m.map(num).join(' ')})"`);
  const inner = (e.k ?? []).map(emit).join('') + (e.p.text ? String(e.p.text).replace(/&/g, '&amp;').replace(/</g, '&lt;') : '');
  return `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</${tag}>`;
}
module.exports = { parse, emit, transform, mul };

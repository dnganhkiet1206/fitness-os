// Phần chung của các bộ sinh cảnh (studio S1, phòng thử đồ S2): dựng component
// RN thành cây phần tử, so hai lần dựng để đặt token, đổi màu canh thành token.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { parse } = require('./svgtree.cjs');

/** màu canh của skin `__tok` → token */
const TOKCOL = { '#a00001': '$wall0', '#a00002': '$wall1', '#a00003': '$glow' };
const TOK_SKIN = { wall: ['#a00001', '#a00002'], glow: '#a00003' };

function render(el) {
  const svg = renderToStaticMarkup(React.createElement('svg', null, el));
  return parse(svg)[0].k ?? [];
}

/** hai lần dựng cùng cấu trúc; `name(path, key, a, b)` đặt token cho chỗ khác nhau */
function diff(a, b, name, where = '') {
  if (a.length !== b.length) throw new Error('cấu trúc khác ở ' + where);
  return a.map((x, i) => {
    const y = b[i];
    if (x.t !== y.t) throw new Error('thẻ khác ở ' + where);
    const p = { ...x.p };
    for (const k of Object.keys(p)) if (p[k] !== y.p[k]) p[k] = name(`${where}/${i}`, k, x.p[k], y.p[k]);
    const o = { ...x, p };
    if (x.k) o.k = diff(x.k, y.k ?? [], name, `${where}/${i}`);
    return o;
  });
}
function colours(tree) {
  return JSON.parse(JSON.stringify(tree).replace(/#a0000[123]/gi, (c) => TOKCOL[c.toLowerCase()]));
}
const energyTok = (w, k, a, b) => {
  if (typeof a !== 'number' || typeof b !== 'number') throw new Error(`energy đổi ${k} không phải số ở ${w}: ${a} → ${b}`);
  return `$e:${a}:${b}`;
};

/** ảnh xem trước bằng Chromium có sẵn */
function screenshot(base, svg, w, h) {
  const fs = require('fs');
  fs.writeFileSync(base + '.html', `<html><body style="margin:0;background:#070708">${svg}</body></html>`);
  require('child_process').execFileSync('/opt/pw-browsers/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${w},${h + 100}`, '--force-device-scale-factor=2', `--screenshot=${base}.png`, 'file://' + base + '.html'], { stdio: 'ignore', env: { ...process.env, TMPDIR: '' } });
}

module.exports = { render, diff, colours, energyTok, TOK_SKIN, screenshot };

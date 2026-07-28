/**
 * Look for shapes that were only ever meant to be invisible.
 *
 * The export contains fillers — `head_top_fur` has a plain rectangle in the
 * head's own colour, there to hide where the tufts are rooted. They cost
 * nothing while every fill is identical, and `koa-light.ts` breaks that: shade
 * such a rectangle by its own centre and it becomes a grey patch across the
 * forehead. It gives them their host's shade instead, and this checks that it
 * worked, across every pose and expression.
 *
 * Containment is decided by the browser's own `getBoundingClientRect`, not by
 * `koa-light`'s path arithmetic, so the check is independent of the thing it
 * is checking.
 *
 *   node tools/koa-import/patches.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = mkdtempSync(path.join(tmpdir(), 'koa-p-'));
const e = path.join(dir, 'e.ts');
writeFileSync(e, `export { NODES } from '@/components/ascnd/koa/koa-scene';
export { koaFlags, KOA_EXPRESSIONS, KOA_POSES } from '@/components/ascnd/koa/koa-flags';
export { litProps } from '@/components/ascnd/koa/koa-light';`);
execFileSync('npx', ['esbuild', e, '--bundle', '--format=esm', '--tsconfig=tsconfig.json', `--outfile=${path.join(dir,'k.js')}`], { stdio: 'ignore' });
const M = await import(pathToFileURL(path.join(dir, 'k.js')));
const { NODES, koaFlags, litProps } = M;

const I = [1,0,0,1,0,0];
const mul = (m,n)=>[m[0]*n[0]+m[2]*n[1],m[1]*n[0]+m[3]*n[1],m[0]*n[2]+m[2]*n[3],m[1]*n[2]+m[3]*n[3],m[0]*n[4]+m[2]*n[5]+m[4],m[1]*n[4]+m[3]*n[5]+m[5]];
function opMat(op){if(op[0]==='r'){const r=op[1]*Math.PI/180,c=Math.cos(r),s=Math.sin(r),m=[c,s,-s,c,0,0];
 return op.length===4?mul(mul([1,0,0,1,op[2],op[3]],m),[1,0,0,1,-op[2],-op[3]]):m;}
 if(op[0]==='t')return[1,0,0,1,op[1],op[2]];return[op[1],0,0,op[2],0,0];}
function opsMat(ops,ox=0,oy=0){if(!ops||!ops.length)return null;let m=I;for(const o of ops)m=mul(m,opMat(o));
 return ox||oy?mul(mul([1,0,0,1,ox,oy],m),[1,0,0,1,-ox,-oy]):m;}
function render(n,flags){
  if(n.if&&!flags[n.if])return'';
  const kids=(n.kids||[]).map(k=>render(k,flags)).join('');
  if(n.t==='defs')return`<defs>${kids}</defs>`;
  if(n.t==='clipPath')return`<clipPath id="${n.id}">${kids}</clipPath>`;
  const raw=n.a||{}; const a=litProps(n,{...raw});
  const extra = raw.fill && /^#/.test(String(raw.fill)) ? ` data-raw="${raw.fill}" data-lit="${a.fill}"` : '';
  const attr=Object.entries(a).map(([k,v])=>`${k}="${v}"`).join(' ');
  const isShape=n.t!=='g';
  const body=isShape?`<${n.t} ${attr}${extra}/>`:kids;
  const m=opsMat([...(n.tr?[['t',n.tr[0],n.tr[1]]]:[]),...(n.tf||[])],n.o?n.o[0]:0,n.o?n.o[1]:0);
  const g=isShape?'':attr;
  if(m)return`<g ${g} transform="matrix(${m.join(' ')})">${body}</g>`;
  return g?`<g ${g}>${body}</g>`:body;
}
const COLLECT = `(() => {
  const els = [...document.querySelectorAll('[data-raw]')].filter(el => !el.closest('defs') && !el.closest('clipPath'));
  const b = els.map(el => { const r = el.getBoundingClientRect();
    return { raw: el.dataset.raw, lit: el.dataset.lit, x0: r.x, y0: r.y, x1: r.right, y1: r.bottom }; });
  const out = [];
  for (const i of b) for (const o of b) {
    if (i === o || i.raw !== o.raw) continue;
    const ai = (i.x1-i.x0)*(i.y1-i.y0), ao = (o.x1-o.x0)*(o.y1-o.y0);
    if (ao <= ai) continue;
    if (o.x0 <= i.x0+1 && o.y0 <= i.y0+1 && o.x1 >= i.x1-1 && o.y1 >= i.y1-1 && i.lit !== o.lit)
      out.push(i.raw + ' ' + i.lit + ' trong ' + o.lit);
  }
  return [...new Set(out)];
})()`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
let bad = 0, n = 0;
for (const ex of M.KOA_EXPRESSIONS) for (const po of M.KOA_POSES) {
  const flags = koaFlags(ex, po, undefined);
  const svg = `<svg viewBox="0 0 240 300" width="240" height="300">${NODES.map(x=>render(x,flags)).join('')}</svg>`;
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  const hits = await page.evaluate(COLLECT);
  n++;
  if (hits.length) { bad += hits.length; console.log(`${ex}/${po}:`, hits.join(' | ')); }
}
await browser.close();
console.log(`${n} tổ hợp — ${bad} mảng vá lộ ra`);
process.exit(bad ? 1 : 0);

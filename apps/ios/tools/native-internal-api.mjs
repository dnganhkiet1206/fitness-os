#!/usr/bin/env node
/**
 * Target app không gọi API `internal` của các package (#527, A).
 *
 * ── vì sao có bước này ──
 *
 * Package test (`@testable import`) thấy được mọi thứ `internal`, target app
 * thì không. Một lời gọi `MealDiary.jsNumber(...)` (7787d4b1, A) hay
 * `ReadinessEngine.jsString(...)` (303de22b, E) qua được core-linux và chỉ đỏ
 * ở bước `xcodebuild` của app-macos — sau ~10 phút, và chỉ trên macOS. Bước
 * này bắt đúng dạng ấy trong vài giây, trên máy nào cũng chạy được.
 *
 * ── luật ──
 *
 * 1. Lập bảng từ nguồn các module app import (`ASCNDCore`, `ASCNDDesignSystem`,
 *    `ASCNDLiveActivity`, `ASCNDBackend`, `ASCNDStore`): mỗi kiểu (theo đường
 *    dẫn đầy đủ `A.B`) có những thành viên `static` / `class` nào KHÔNG
 *    `public` / `open`; kiểu cấp đầu nào không `public` / `open`. Thành viên
 *    trong `public extension` mặc định là public. Một tên có bản public ở bất
 *    kỳ đâu (nạp chồng) thì không tính — chỉ báo chỗ chắc chắn hỏng.
 * 2. Quét `apps/ios/ASCND` + `apps/ios/ASCNDWidgets` (bỏ chú thích, GIỮ chuỗi
 *    vì lời gọi hay nằm trong nội suy `"\(…)"`): `Kiểu.tên` khớp bảng là đỏ.
 *    Tên app tự khai báo (kiểu cùng tên, hay `extension Kiểu { static … }`)
 *    là của app — không báo.
 *
 * Vùng mù: thành viên THỂ HIỆN (`form.n(…)`), `init` internal, và kiểu internal
 * chỉ dùng làm chú thích kiểu (`: JS`). Các dạng ấy vẫn chỉ app-macos bắt.
 *
 *   node apps/ios/tools/native-internal-api.mjs
 *   node apps/ios/tools/native-internal-api.mjs --self-test
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const MODULES = [
  'apps/ios/Packages/ASCNDKit/Sources/ASCNDCore',
  'apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem',
  'apps/ios/Packages/ASCNDKit/Sources/ASCNDLiveActivity',
  'apps/ios/Packages/ASCNDBackend/Sources/ASCNDBackend',
  'apps/ios/Packages/ASCNDStore/Sources/ASCNDStore',
];
const APPS = ['apps/ios/ASCND', 'apps/ios/ASCNDWidgets'];
const FIXTURES = join(ROOT, 'apps/ios/tools/fixtures/internal-api');

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : n.endsWith('.swift') ? [p] : [];
  });

/** Bỏ chú thích (dòng + khối), không đụng `//` nằm trong chuỗi. */
function stripComments(src) {
  let out = '', i = 0, inStr = false;
  while (i < src.length) {
    const ch = src[i], nx = src[i + 1];
    if (inStr) {
      out += ch;
      if (ch === '\\') { out += nx ?? ''; i += 2; continue; }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; i++; continue; }
    if (ch === '/' && nx === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && nx === '*') {
      const end = src.indexOf('*/', i + 2);
      const body = src.slice(i, end < 0 ? src.length : end + 2);
      out += body.replace(/[^\n]/g, ' ');
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Thay nội dung chuỗi bằng khoảng trắng (để đếm ngoặc), giữ `\(…)`. */
function blankStrings(line) {
  let out = '', inStr = false, interp = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr && interp === 0) {
      if (ch === '\\' && line[i + 1] === '(') { out += '\\('; i++; interp = 1; continue; }
      if (ch === '\\') { out += '  '; i++; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      out += ' ';
      continue;
    }
    if (inStr && interp > 0) {
      if (ch === '(') interp++;
      if (ch === ')') { interp--; if (interp === 0) { out += ch; continue; } }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  return out;
}

const TYPE_RE = /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*((?:(?:public|open|internal|private|fileprivate|package|final|indirect|nonisolated)\s+)*)(enum|struct|class|actor|protocol|extension)\s+([A-Za-z_][\w.]*)/;
const MEMBER_RE = /^\s*(?:@[\w.]+(?:\([^)]*\))?\s+)*((?:(?:public|open|internal|private|fileprivate|package|static|class|final|nonisolated|override|mutating|lazy|dynamic|(?:private|fileprivate|internal|public|package)\(set\))\s+)*)(func|let|var)\s+([A-Za-z_]\w*)/;

/**
 * Bảng của một tập tệp: `members[path][name] = 'public' | 'internal'`,
 * `types[name] = 'public' | 'internal'` (kiểu cấp đầu), `declared` = đường dẫn
 * mọi kiểu khai báo, `topLevel` = tên kiểu cấp đầu.
 */
function index(files) {
  const members = new Map(), types = new Map(), declared = new Set(), topLevel = new Set();
  const mark = (map, key, access) => {
    if (map.get(key) !== 'public') map.set(key, access);
  };
  for (const { src } of files) {
    const stack = []; // { type: path | null, pub: bool, ext: bool, proto: bool }
    let pending = null;
    for (const raw of stripComments(src).split('\n')) {
      // Mỗi đoạn giữa hai ngoặc nhọn xét riêng — `enum JS { static func … }`
      // trên một dòng vẫn ghi được thành viên vào đúng kiểu.
      for (const seg of blankStrings(raw).split(/(?=[{}])|(?<=[{}])/)) {
        if (seg === '{') {
          stack.push(pending ?? { type: null, pub: false, ext: false, proto: false });
          pending = null;
          continue;
        }
        if (seg === '}') {
          stack.pop();
          continue;
        }
        const top = stack.length ? stack[stack.length - 1] : null;
        const t = TYPE_RE.exec(seg);
        if (t) {
          const mods = t[1], kind = t[2], name = t[3];
          const outer = top && top.type ? top.type + '.' : '';
          const path = kind === 'extension' ? name : outer + name;
          pending = { type: path, pub: /\b(public|open)\b/.test(mods), ext: kind === 'extension', proto: kind === 'protocol' };
          if (kind !== 'extension') {
            declared.add(path);
            if (!top) {
              topLevel.add(name);
              mark(types, name, pending.pub ? 'public' : 'internal');
            }
          }
        } else if (top && top.type && !top.proto) {
          const m = MEMBER_RE.exec(seg);
          if (m && /\b(static|class)\b/.test(m[1])) {
            const mods = m[1].replace(/\b\w+\(set\)/g, '');
            const explicit = /\b(public|open)\b/.test(mods);
            const hidden = /\b(private|fileprivate|internal|package)\b/.test(mods);
            const access = explicit || (top.ext && top.pub && !hidden) ? 'public' : 'internal';
            if (!members.has(top.type)) members.set(top.type, new Map());
            mark(members.get(top.type), m[3], access);
          }
        }
      }
    }
  }
  return { members, types, declared, topLevel };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Chỗ app gọi API không public của module. */
function check(moduleIdx, appFiles) {
  const own = index(appFiles);
  const found = [];
  const rules = [];
  for (const [path, names] of moduleIdx.members) {
    const first = path.split('.')[0];
    for (const [name, access] of names) {
      if (access !== 'internal') continue;
      if (own.members.get(path)?.has(name)) continue;
      // Kiểu cấp đầu cùng tên do app khai báo che kiểu của module trong app.
      if (own.topLevel.has(first)) continue;
      rules.push({ re: new RegExp(`(?<![\\w.])${esc(path)}\\.${esc(name)}\\b`), what: `${path}.${name} (internal)` });
    }
  }
  for (const [name, access] of moduleIdx.types) {
    if (access !== 'internal' || own.topLevel.has(name)) continue;
    rules.push({ re: new RegExp(`(?<![\\w.])${esc(name)}\\.[A-Za-z_]`), what: `kiểu ${name} (internal)` });
  }
  for (const { src, rel } of appFiles) {
    stripComments(src).split('\n').forEach((line, i) => {
      for (const r of rules) if (r.re.test(line)) found.push(`${rel}:${i + 1}: ${r.what}`);
    });
  }
  return found;
}

const load = (paths) => paths.map((p) => ({ src: readFileSync(p, 'utf8'), rel: relative(ROOT, p) }));

if (process.argv.includes('--self-test')) {
  const mod = index(load(walk(join(FIXTURES, 'module'))));
  let bad = 0;
  for (const name of readdirSync(join(FIXTURES, 'app')).sort()) {
    const found = check(mod, load([join(FIXTURES, 'app', name)]));
    const wantRed = name.startsWith('bad-');
    const ok = wantRed ? found.length > 0 : found.length === 0;
    console.log(`${ok ? 'ok  ' : 'SAI '} ${name}: ${found.length ? found.map((f) => f.split(': ').pop()).join('; ') : 'xanh'}`);
    if (!ok) bad++;
  }
  if (bad) {
    console.log(`native-internal-api --self-test: ĐỎ (${bad} fixture sai kỳ vọng)`);
    process.exit(1);
  }
  console.log('native-internal-api --self-test: XANH');
} else {
  const mod = index(load(MODULES.flatMap((d) => walk(join(ROOT, d)))));
  const appFiles = load(APPS.flatMap((d) => walk(join(ROOT, d))));
  const found = check(mod, appFiles);
  if (found.length) {
    console.log('native-internal-api: ĐỎ — target app gọi API không public của package (app-macos sẽ không biên dịch):');
    for (const f of found) console.log('  ' + f);
    process.exit(1);
  }
  let n = 0;
  for (const m of mod.members.values()) for (const a of m.values()) if (a === 'internal') n++;
  console.log(`native-internal-api: XANH (${appFiles.length} tệp app, ${n} thành viên static không public + ${[...mod.types.values()].filter((a) => a === 'internal').length} kiểu internal trong bảng)`);
}

#!/usr/bin/env node
/**
 * Nội dung 3D của app (`apps/ios/ASCND/Resources/ExerciseDemos`) đúng hợp đồng (20/11/2026).
 *
 * Kiệt 20/11: tách nội dung trong chế độ hướng dẫn 3D thành các tệp độc lập, để sửa một thứ
 * không phải xuất / render lại cả bài, và để sau này thêm nhiều nội dung cho người dùng.
 * Mỗi bài: `<bài>_demo.json` (lõi) + các khối `<bài>_tips.json`, `<bài>_tempo.json`,
 * `<bài>_mistakes.json`; `demo3d_index.json` giữ thứ tự và mã băm từng tệp. Sinh bởi
 * `artifacts/exercise-visual-system/pipeline/export_app_demos.py`; hình dạng từng tệp có JSON
 * Schema ở `artifacts/exercise-visual-system/schemas/` (bộ xuất kiểm bằng `jsonschema` khi có).
 *
 * Cổng này kiểm phần schema không bắt được, không cần gói ngoài:
 * - mục lục: mọi tệp có thật, mã băm khớp nội dung (sửa tay mà quên xuất lại thì đỏ),
 *   không có khối mồ côi;
 * - lõi: tệp 3D và poster có trong bundle, khối khai báo có thật, `schema` app đọc được;
 * - mẹo / lỗi sai: đủ en / es / vi, không chữ rỗng, số bước như nhau giữa các ngôn ngữ, mã không
 *   trùng, không trùng mã với chữ khung của app, chữ không còn nằm song song trong
 *   Localizable.xcstrings (một nguồn duy nhất);
 * - nhịp: pha hợp lệ, tăng dần, không chồng nhau, nằm trong clip, rep nào cũng có pha;
 * - lỗi sai: tệp chuyển động sai có trong bundle.
 *
 *   node apps/ios/tools/demo3d-content.mjs
 *   node apps/ios/tools/demo3d-content.mjs --self-test   # từng dạng lỗi phải đỏ, bản thật phải xanh
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const DIR = join(ROOT, 'apps/ios/ASCND/Resources/ExerciseDemos');
const XCSTRINGS = join(ROOT, 'apps/ios/ASCND/Resources/Localizable.xcstrings');
const LANGS = ['en', 'es', 'vi'];
const APP_SCHEMA = 1; // ExerciseDemoContent.schema
const MODULES = ['tips', 'tempo', 'mistakes'];
const KINDS = new Set(['ready', 'concentric', 'eccentric', 'top_hold', 'bottom_hold', 'rest']);
const ID = /^[a-z0-9_]+$/;
const OWNED = /^[a-z0-9_]+_(demo|tips|tempo|mistakes)\.json$/;
// Chữ khung của app dùng chung tiền tố với chữ từng mẹo / lỗi sai: mã nội dung không được trùng.
const RESERVED_TIP = new Set(['how', 'why', 'unverified']);
const RESERVED_MISTAKE = new Set(['badge', 'fixLabel', 'hide', 'short', 'show']);

const digest = (text) => createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);
const isText = (s) => typeof s === 'string' && s.trim().length > 0;
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);

/** Lỗi của thư mục `dir` (rỗng = đạt). `strings` = khoá của Localizable.xcstrings. */
export function check(dir, strings) {
  const errors = [];
  const bad = (file, msg) => errors.push(`${file}: ${msg}`);
  const read = (name) => {
    const path = join(dir, `${name}.json`);
    if (!existsSync(path)) return null;
    const text = readFileSync(path, 'utf8');
    try {
      return { text, data: JSON.parse(text) };
    } catch (e) {
      bad(`${name}.json`, `không đọc được JSON (${e.message})`);
      return null;
    }
  };
  const has = (name, ext) => existsSync(join(dir, `${name}.${ext}`));

  const index = read('demo3d_index');
  if (!index) return [`demo3d_index.json: thiếu`];
  const { schema, demos, files } = index.data;
  if (schema !== 2) bad('demo3d_index.json', `schema ${schema}, cần 2`);
  if (!Array.isArray(demos) || demos.length === 0) return [...errors, 'demo3d_index.json: không có bài nào'];
  if (new Set(demos).size !== demos.length) bad('demo3d_index.json', 'bài trùng trong `demos`');
  const listed = files && typeof files === 'object' ? files : {};

  // Mã băm khớp nội dung; mọi tệp của bộ xuất đều có trong mục lục.
  for (const [name, hash] of Object.entries(listed)) {
    const f = read(name);
    if (!f) bad('demo3d_index.json', `liệt kê ${name}.json nhưng không có tệp`);
    else if (digest(f.text) !== hash) bad(`${name}.json`, 'nội dung khác mã băm trong mục lục — chạy lại export_app_demos.py');
  }
  for (const file of readdirSync(dir).filter((f) => OWNED.test(f))) {
    if (!(file.replace(/\.json$/, '') in listed)) bad(file, 'tệp mồ côi: không có trong mục lục');
  }

  for (const id of demos) {
    if (!ID.test(id)) bad('demo3d_index.json', `mã bài lạ "${id}"`);
    const core = read(`${id}_demo`);
    if (!core) {
      bad(`${id}_demo.json`, 'thiếu');
      continue;
    }
    const d = core.data;
    const at = `${id}_demo.json`;
    if (d.schema !== APP_SCHEMA) bad(at, `schema ${d.schema}, app đọc ${APP_SCHEMA}`);
    if (d.id !== id) bad(at, `id "${d.id}" khác tên tệp`);
    if (!Array.isArray(d.aliases) || !d.aliases.length || !d.aliases.every(isText)) bad(at, 'thiếu tên gọi (aliases)');
    const model = d.motion ?? d.usdz;
    if (!isText(model) || !has(model, 'usdz')) bad(at, `tệp 3D ${model}.usdz không có trong bundle`);
    if (!isText(d.poster) || !has(d.poster, 'jpg')) bad(at, `poster ${d.poster}.jpg không có trong bundle`);
    const modules = d.modules ?? {};
    for (const [kind, name] of Object.entries(modules)) {
      if (!MODULES.includes(kind)) bad(at, `khối lạ "${kind}"`);
      else if (name !== `${id}_${kind}`) bad(at, `khối ${kind} trỏ "${name}", cần "${id}_${kind}"`);
      else if (!(name in listed)) bad(at, `khối ${kind}: ${name}.json không có trong mục lục`);
    }
    for (const kind of MODULES) {
      if (!modules[kind] && `${id}_${kind}` in listed) bad(at, `có ${id}_${kind}.json mà lõi không khai báo`);
    }
    const mod = (kind) => (modules[kind] ? read(modules[kind]) : null);

    const tips = mod('tips');
    if (tips) checkTips(tips.data, id, strings, (m) => bad(`${id}_tips.json`, m));
    const tempo = mod('tempo');
    if (tempo) checkTempo(tempo.data, id, (m) => bad(`${id}_tempo.json`, m));
    const mistakes = mod('mistakes');
    if (mistakes) checkMistakes(mistakes.data, id, strings, has, (m) => bad(`${id}_mistakes.json`, m));
  }
  return errors;
}

function header(data, id, bad) {
  if (data.schema !== APP_SCHEMA) bad(`schema ${data.schema}, app đọc ${APP_SCHEMA} (app sẽ ẩn khối này)`);
  if (data.exercise !== id) bad(`exercise "${data.exercise}" khác bài "${id}"`);
}

/** Đủ ba ngôn ngữ, mỗi trường chữ không rỗng; mảng (các bước) cùng độ dài ở mọi ngôn ngữ. */
function checkText(text, fields, where, bad) {
  if (!text || typeof text !== 'object') return bad(`${where}: thiếu chữ`);
  const langs = Object.keys(text).sort();
  if (langs.join() !== [...LANGS].sort().join()) bad(`${where}: ngôn ngữ ${langs.join('/')} — cần ${LANGS.join('/')}`);
  const steps = new Set();
  for (const lang of LANGS) {
    const t = text[lang];
    if (!t) continue;
    for (const f of fields) {
      const v = t[f];
      if (Array.isArray(v)) {
        if (!v.length || !v.every(isText)) bad(`${where}/${lang}: "${f}" rỗng`);
        steps.add(v.length);
      } else if (!isText(v)) bad(`${where}/${lang}: thiếu "${f}"`);
    }
  }
  if (steps.size > 1) bad(`${where}: số bước khác nhau giữa các ngôn ngữ`);
}

function checkTips(data, id, strings, bad) {
  header(data, id, bad);
  if (!Array.isArray(data.tips) || !data.tips.length) return bad('không có mẹo');
  const ids = new Set();
  for (const t of data.tips) {
    if (!ID.test(t.id ?? '')) bad(`mã mẹo lạ "${t.id}"`);
    if (ids.has(t.id)) bad(`mẹo "${t.id}" trùng`);
    ids.add(t.id);
    if (RESERVED_TIP.has(t.id)) bad(`mẹo "${t.id}" trùng chữ khung eg.demo3d.tip.${t.id} của app`);
    if (!isVec3(t.anchor)) bad(`mẹo "${t.id}": anchor phải là 3 số`);
    if ((t.joint == null) !== (t.offset == null)) bad(`mẹo "${t.id}": joint và offset đi cùng nhau`);
    if (t.offset != null && !isVec3(t.offset)) bad(`mẹo "${t.id}": offset phải là 3 số`);
    checkText(t.text, ['title', 'body', 'how', 'why', 'avoid'], `mẹo "${t.id}"`, bad);
    if (strings.has(`eg.demo3d.tip.${t.id}`)) bad(`chữ mẹo "${t.id}" còn trong Localizable.xcstrings — một nguồn thôi`);
  }
}

function checkTempo(data, id, bad) {
  header(data, id, bad);
  const { duration_ms: dur, reps, phases } = data;
  if (!(dur > 0)) bad('duration_ms phải > 0');
  if (!Number.isInteger(reps) || reps < 1) bad('reps phải ≥ 1');
  if (!Array.isArray(phases) || !phases.length) return bad('không có pha');
  let last = -Infinity;
  const repsSeen = new Set();
  for (const [i, p] of phases.entries()) {
    const where = `pha ${i}`;
    if (!KINDS.has(p.kind)) bad(`${where}: kiểu "${p.kind}" lạ`);
    if (!(p.start_ms < p.end_ms)) bad(`${where}: bắt đầu ${p.start_ms} không trước kết thúc ${p.end_ms}`);
    if (p.start_ms < last) bad(`${where}: chồng lên / lùi so với pha trước`);
    if (p.end_ms > dur + 1) bad(`${where}: vượt quá clip (${p.end_ms} > ${dur})`);
    if (!(p.rep >= 1 && p.rep <= reps)) bad(`${where}: rep ${p.rep} ngoài 1…${reps}`);
    repsSeen.add(p.rep);
    last = p.end_ms;
  }
  for (let r = 1; r <= reps; r++) if (!repsSeen.has(r)) bad(`rep ${r} không có pha nào`);
}

function checkMistakes(data, id, strings, has, bad) {
  header(data, id, bad);
  if (!Array.isArray(data.mistakes) || !data.mistakes.length) return bad('không có lỗi sai');
  const ids = new Set();
  for (const m of data.mistakes) {
    if (!ID.test(m.id ?? '')) bad(`mã lỗi sai lạ "${m.id}"`);
    if (ids.has(m.id)) bad(`lỗi sai "${m.id}" trùng`);
    ids.add(m.id);
    if (RESERVED_MISTAKE.has(m.id)) bad(`lỗi sai "${m.id}" trùng chữ khung của app`);
    if (!isText(m.motion) || !has(m.motion, 'usdz')) bad(`lỗi sai "${m.id}": ${m.motion}.usdz không có trong bundle`);
    if (!Array.isArray(m.joints) || !m.joints.length || !m.joints.every(isText)) bad(`lỗi sai "${m.id}": thiếu khớp làm sai`);
    checkText(m.text, ['title', 'body', 'fix'], `lỗi sai "${m.id}"`, bad);
    if (strings.has(`eg.demo3d.mistake.${m.id}`)) bad(`chữ lỗi sai "${m.id}" còn trong Localizable.xcstrings — một nguồn thôi`);
  }
}

function stringKeys() {
  return new Set(Object.keys(JSON.parse(readFileSync(XCSTRINGS, 'utf8')).strings));
}

// ---------------------------------------------------------------------------------------------
// --self-test: bản thật (chép sang thư mục tạm, tệp 3D thay bằng tệp rỗng cùng tên) phải xanh;
// mỗi dạng lỗi dưới đây phải đỏ, đúng câu báo.

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'demo3d-'));
  for (const f of readdirSync(DIR)) {
    if (f.endsWith('.json')) copyFileSync(join(DIR, f), join(dir, f));
    else writeFileSync(join(dir, f), ''); // chỉ cần tên có mặt
  }
  return dir;
}

const json = (dir, name) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const dump = (data) => JSON.stringify(data, null, 2) + '\n';
/** Ghi lại một tệp và cập nhật mã băm (lỗi nằm trong nội dung, không phải ở mục lục). */
function rewrite(dir, name, data, { rehash = true } = {}) {
  writeFileSync(join(dir, `${name}.json`), dump(data));
  if (!rehash) return;
  const index = json(dir, 'demo3d_index');
  index.files[name] = digest(dump(data));
  writeFileSync(join(dir, 'demo3d_index.json'), dump(index));
}
function firstWith(dir, kind) {
  const index = json(dir, 'demo3d_index');
  for (const id of index.demos) if (json(dir, `${id}_demo`).modules?.[kind]) return id;
  throw new Error(`không bài nào có khối ${kind}`);
}

const CASES = [
  ['mẹo thiếu tiếng Việt', 'ngôn ngữ', (dir) => {
    const id = firstWith(dir, 'tips'); const f = json(dir, `${id}_tips`);
    delete f.tips[0].text.vi; rewrite(dir, `${id}_tips`, f);
  }],
  ['mẹo chữ rỗng', 'thiếu "why"', (dir) => {
    const id = firstWith(dir, 'tips'); const f = json(dir, `${id}_tips`);
    f.tips[0].text.es.why = '  '; rewrite(dir, `${id}_tips`, f);
  }],
  ['số bước lệch giữa ngôn ngữ', 'số bước khác nhau', (dir) => {
    const id = firstWith(dir, 'tips'); const f = json(dir, `${id}_tips`);
    f.tips[0].text.vi.how.push('bước thừa'); rewrite(dir, `${id}_tips`, f);
  }],
  ['mẹo trùng mã', 'trùng', (dir) => {
    const id = firstWith(dir, 'tips'); const f = json(dir, `${id}_tips`);
    f.tips.push(f.tips[0]); rewrite(dir, `${id}_tips`, f);
  }],
  ['mẹo trùng chữ khung', 'chữ khung', (dir) => {
    const id = firstWith(dir, 'tips'); const f = json(dir, `${id}_tips`);
    f.tips[0].id = 'why'; rewrite(dir, `${id}_tips`, f);
  }],
  ['nhịp lùi', 'lùi', (dir) => {
    const id = firstWith(dir, 'tempo'); const f = json(dir, `${id}_tempo`);
    [f.phases[0], f.phases[1]] = [f.phases[1], f.phases[0]]; rewrite(dir, `${id}_tempo`, f);
  }],
  ['nhịp vượt clip', 'vượt quá clip', (dir) => {
    const id = firstWith(dir, 'tempo'); const f = json(dir, `${id}_tempo`);
    f.phases.at(-1).end_ms = f.duration_ms + 5000; rewrite(dir, `${id}_tempo`, f);
  }],
  ['lỗi sai thiếu clip', 'không có trong bundle', (dir) => {
    const id = firstWith(dir, 'mistakes'); const f = json(dir, `${id}_mistakes`);
    f.mistakes[0].motion = 'khong_co_motion'; rewrite(dir, `${id}_mistakes`, f);
  }],
  ['schema mới hơn app', 'app đọc 1', (dir) => {
    const id = firstWith(dir, 'tips'); const f = json(dir, `${id}_tips`);
    f.schema = 2; rewrite(dir, `${id}_tips`, f);
  }],
  ['sửa tay quên xuất lại', 'mã băm', (dir) => {
    const id = firstWith(dir, 'tempo'); const f = json(dir, `${id}_tempo`);
    f.phases[0].breath = 'hold'; rewrite(dir, `${id}_tempo`, f, { rehash: false });
  }],
  ['khối mồ côi', 'mồ côi', (dir) => {
    writeFileSync(join(dir, 'bai_moi_tips.json'), '{}\n');
  }],
  ['lõi khai báo khối không có tệp', 'không có trong mục lục', (dir) => {
    const id = firstWith(dir, 'tempo'); const d = json(dir, `${id}_demo`);
    d.modules.tips = `${id}_tips`; rewrite(dir, `${id}_demo`, d);
  }],
  ['thiếu tệp 3D', '.usdz không có trong bundle', (dir) => {
    const id = firstWith(dir, 'tempo'); const d = json(dir, `${id}_demo`);
    rmSync(join(dir, `${d.motion ?? d.usdz}.usdz`));
  }],
];

function selfTest() {
  const strings = stringKeys();
  let failed = 0;
  const clean = fixture();
  const base = check(clean, strings);
  rmSync(clean, { recursive: true });
  if (base.length) {
    console.error('✗ bản thật (đã chép) phải xanh:\n  ' + base.join('\n  '));
    failed++;
  } else console.log('✓ bản thật xanh');
  for (const [name, expect, mutate] of CASES) {
    const dir = fixture();
    mutate(dir);
    const errs = check(dir, strings);
    rmSync(dir, { recursive: true });
    if (errs.some((e) => e.includes(expect))) console.log(`✓ ${name} → đỏ`);
    else {
      console.error(`✗ ${name}: cần báo "${expect}", được: ${errs.join(' | ') || '(xanh)'}`);
      failed++;
    }
  }
  // Chữ còn song song trong xcstrings: dùng một khoá giả lập.
  const dir = fixture();
  const id = firstWith(dir, 'tips');
  const tipId = json(dir, `${id}_tips`).tips[0].id;
  const errs = check(dir, new Set([...strings, `eg.demo3d.tip.${tipId}`]));
  rmSync(dir, { recursive: true });
  if (errs.some((e) => e.includes('một nguồn thôi'))) console.log('✓ chữ còn trong xcstrings → đỏ');
  else {
    console.error('✗ chữ còn trong xcstrings phải đỏ');
    failed++;
  }
  if (failed) process.exit(1);
  console.log(`demo3d-content --self-test: ${CASES.length + 2} ca đúng`);
}

if (process.argv.includes('--self-test')) selfTest();
else {
  const errors = check(DIR, stringKeys());
  if (errors.length) {
    console.error(`demo3d-content: ${errors.length} lỗi\n  ` + errors.join('\n  '));
    process.exit(1);
  }
  const index = JSON.parse(readFileSync(join(DIR, 'demo3d_index.json'), 'utf8'));
  console.log(`demo3d-content: ${index.demos.length} bài, ${Object.keys(index.files).length} tệp, đúng hợp đồng`);
}

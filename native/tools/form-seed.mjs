/**
 * Màn có ô nhập điền form từ dữ liệu truy vấn qua `useFormSeed`, không qua
 * `useEffect(…, [data])` (#166).
 *
 * ── lỗi ──
 *
 * `edit-profile.tsx` điền form trong `useEffect(() => { setX(profile.x); … },
 * [profile])`: hễ `profile` đổi tham chiếu là MỌI ô người ta đang gõ dở bị
 * thay bằng giá trị server. Từ #160 app trở lại từ nền là một lượt tải lại
 * (`focusManager` nghe `AppState`), và đồng bộ Health ghi cân nặng rồi làm hồ
 * sơ cũ đi — hai đường làm `profile` đổi trong lúc form đang mở. Cùng hình
 * dạng ở `food-editor.tsx` (tám ô, theo `[existing]`). Cả hai nay qua
 * `useFormSeed`: điền lại chỉ khi chưa ai sửa gì; kịch bản live (#166) đo cả
 * hai chiều.
 *
 * ── luật ──
 *
 * Trong `src/app` và `src/components`, tệp nào có `TextInput` thì không được
 * có một `useEffect` mà mảng phụ thuộc chứa một biến lấy từ `{ data: X }` của
 * một hook truy vấn VÀ thân gọi từ hai hàm `setY(` trở lên. Đó là chữ ký của
 * "điền form theo dữ liệu". Một chỗ cố ý khác thì ghi `điền theo dữ liệu có
 * chủ ý (#166)` kèm lý do ngay trong thân effect.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Bóc chú thích, giữ nguyên độ dài (#164). */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, (c, p) => p + ' '.repeat(c.length - p.length));

/** Thân và phụ thuộc của mọi `useEffect(() => { … }, [ … ])`, cắt bằng đếm ngoặc. */
function effects(code) {
  const out = [];
  for (const m of code.matchAll(/\buseEffect\(\s*\(\)\s*=>\s*\{/g)) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < code.length; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}' && --depth === 0) break;
    }
    const body = code.slice(m.index + m[0].length, i);
    const deps = code.slice(i + 1).match(/^\s*,\s*\[([^\]]*)\]/)?.[1];
    if (deps != null) out.push({ at: m.index, body, deps });
  }
  return out;
}

export function offenders(src) {
  if (!/\bTextInput\b/.test(src)) return [];
  const code = strip(src);
  const dataVars = new Set([...code.matchAll(/\bdata\s*:\s*(\w+)/g)].map((m) => m[1]));
  const out = [];
  for (const { at, body, deps } of effects(code)) {
    const dep = deps.split(',').map((d) => d.trim()).find((d) => dataVars.has(d));
    if (!dep) continue;
    const setters = new Set([...body.matchAll(/\bset[A-Z]\w*\(/g)].map((m) => m[0]));
    if (setters.size < 2) continue;
    if (/điền theo dữ liệu có chủ ý \(#166\)/.test(src.slice(at, at + body.length + 40))) continue;
    out.push({ line: code.slice(0, at).split('\n').length, dep, setters: setters.size });
  }
  return out;
}

const problems = [];

/* ── tự kiểm ── */
{
  const bad = `const { data: profile } = useProfile();\nuseEffect(() => {\n  if (!profile) return;\n  setName(profile.name);\n  setAge(profile.age);\n}, [profile]);\n<TextInput />`;
  const cases = [
    [bad, 1, 'điền theo [data]'],
    [bad.replace('<TextInput />', ''), 0, 'không có ô nhập'],
    [bad.replace('  setAge(profile.age);\n', ''), 0, 'một setter (không phải điền form)'],
    [bad.replace('}, [profile]);', '}, [visible]);'), 0, 'phụ thuộc không phải dữ liệu truy vấn'],
    [bad.replace('  if (!profile) return;', '  // điền theo dữ liệu có chủ ý (#166): lý do\n  if (!profile) return;'), 0, 'miễn trừ có lý do'],
    [`const { data: x } = useX();\nuseFormSeed(x, { a }, (x) => { setA(x.a); setB(x.b); return {}; });\n<TextInput />`, 0, 'useFormSeed'],
  ];
  for (const [src, want, label] of cases) {
    const got = offenders(src).length;
    if (got !== want) problems.push(`tự kiểm (${label}): ra ${got}, phải ${want}`);
  }
}

/* ── trên mã thật ── */
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
});
let forms = 0;
for (const abs of [...walk(path.join(NATIVE, 'src/app')), ...walk(path.join(NATIVE, 'src/components'))]) {
  const src = readFileSync(abs, 'utf8');
  if (/\bTextInput\b/.test(src)) forms++;
  for (const { line, dep, setters } of offenders(src)) {
    problems.push(
      `${path.relative(NATIVE, abs)}:${line}: useEffect điền ${setters} ô theo [${dep}] — dữ liệu tải lại là ghi đè thứ người ta ` +
        'đang gõ dở; dùng useFormSeed (src/hooks/use-form-seed.ts)',
    );
  }
}
if (forms < 10) problems.push(`tự kiểm: chỉ ${forms} tệp có TextInput — bộ quét đã mù?`);

if (problems.length) {
  console.error(`điền form HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `điền form OK — ${forms} tệp có ô nhập, không tệp nào điền form theo dữ liệu truy vấn bằng useEffect(…, [data]); ` +
    'edit-profile và food-editor qua useFormSeed (điền lại chỉ khi chưa ai sửa gì — #166). Tự kiểm 6 ca',
);

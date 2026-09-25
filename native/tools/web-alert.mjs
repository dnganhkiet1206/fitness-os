/**
 * Hộp hỏi lại trên bản web (#83).
 *
 * react-native-web cài `Alert.alert` là một hàm RỖNG, nên mọi hộp hỏi lại của
 * app im lặng trên trình duyệt. #71 đo được: đổi nhịp tim ở `/log-biometrics`
 * thì nút Lưu ra 0 toast, 0 lệnh ghi. `src/lib/web-alert.ts` thay nó bằng hộp
 * thoại của trình duyệt theo luật ở `src/lib/web-dialog.ts`. Luật này canh ba
 * điều:
 *
 *   1. TĨNH — `_layout.tsx` gọi `installWebAlert()`; mọi `Alert` trong `src/`
 *      import từ 'react-native' (từ chỗ khác thì phép gán ở gốc không tới);
 *      và mọi hộp HAI nút có đúng một nút `style: 'cancel'`, vì luật ở
 *      `web-dialog.ts` đọc "một việc + Huỷ" là `confirm()`, còn hai nút không
 *      nút nào là Huỷ sẽ thành một menu phải gõ số.
 *   2. CHẠY THẬT `browserAlert` (biên dịch chính tệp ấy) với một `window` giả:
 *      báo tin, xác nhận Đồng ý/Huỷ, menu chọn số/bỏ trống/gõ sai.
 *   3. Thử ngược từng vế.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = 'src/lib/web-dialog.ts';
const LAYOUT = 'src/app/_layout.tsx';
const problems = [];

function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

/** Mỗi lời gọi `Alert.alert(…)` trọn vẹn (khớp ngoặc), kèm dòng. */
export function alertCalls(src) {
  const out = [];
  for (const m of src.matchAll(/Alert\.alert\(/g)) {
    let i = m.index + m[0].length;
    let depth = 1;
    while (depth && i < src.length) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') depth--;
      i++;
    }
    out.push({ line: src.slice(0, m.index).split('\n').length, call: src.slice(m.index, i) });
  }
  return out;
}

/** Vế 1 trên một tập tệp `{ rel: src }`. */
export function staticProblems(files) {
  const out = [];
  const layout = files[LAYOUT] ?? '';
  if (!/^\s*installWebAlert\(\);/m.test(layout)) out.push(`${LAYOUT} không gọi installWebAlert() — trên web mọi hộp hỏi lại im lặng`);
  for (const [rel, src] of Object.entries(files)) {
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
      if (/\bAlert\b/.test(m[1].replace(/\bAlertButton\b|\bAlertOptions\b/g, '')) && m[2] !== 'react-native') {
        out.push(`${rel}: Alert import từ '${m[2]}' — phép gán ở gốc (web-alert.ts) chỉ tới Alert của 'react-native'`);
      }
    }
    for (const { line, call } of alertCalls(src)) {
      const buttons = (call.match(/\btext:/g) ?? []).length;
      const cancels = (call.match(/style:\s*'cancel'/g) ?? []).length;
      if (buttons === 2 && cancels !== 1) {
        out.push(`${rel}:${line}: hộp hai nút mà ${cancels} nút style 'cancel' — trên web nó thành menu phải gõ số thay vì Đồng ý/Huỷ`);
      }
    }
  }
  return out;
}

/** Vế 2: chạy `browserAlert` thật trên các ca; trả danh sách sai. */
export function runtimeProblems(browserAlert) {
  const out = [];
  const fakeWin = (answer) => {
    const seen = [];
    return {
      seen,
      alert: (m) => seen.push(['alert', m]),
      confirm: (m) => (seen.push(['confirm', m]), answer),
      prompt: (m) => (seen.push(['prompt', m]), answer),
    };
  };
  const btn = (text, hits, style) => ({ text, style, onPress: () => hits.push(text) });
  const expect = (label, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) out.push(`${label}: ra ${JSON.stringify(got)}, phải ${JSON.stringify(want)}`);
  };

  {
    const w = fakeWin(null);
    browserAlert(w, 'Đã lưu', 'Xong rồi.');
    expect('báo tin không nút', w.seen, [['alert', 'Đã lưu\n\nXong rồi.']]);
  }
  {
    const w = fakeWin(null);
    const hits = [];
    browserAlert(w, 'Lỗi', undefined, [btn('OK', hits)]);
    expect('báo tin một nút: hộp alert rồi chạy nút ấy', [w.seen.map((x) => x[0]), hits], [['alert'], ['OK']]);
  }
  for (const [answer, want] of [[true, ['Xoá']], [false, ['Huỷ']]]) {
    const w = fakeWin(answer);
    const hits = [];
    browserAlert(w, 'Xoá bài?', 'Không hoàn tác được.', [btn('Huỷ', hits, 'cancel'), btn('Xoá', hits, 'destructive')]);
    expect(`xác nhận, trả lời ${answer}`, hits, want);
    if (!/→ Xoá/.test(w.seen[0]?.[1] ?? '')) out.push(`xác nhận: câu hỏi phải nói "OK" là làm gì ("→ Xoá"), ra ${JSON.stringify(w.seen[0]?.[1])}`);
  }
  for (const [answer, want] of [['2', ['Trưa']], [' 1 ', ['Sáng']], ['', ['Huỷ']], [null, ['Huỷ']], ['9', ['Huỷ']], ['x', ['Huỷ']]]) {
    const w = fakeWin(answer);
    const hits = [];
    browserAlert(w, 'Thêm vào bữa nào?', undefined, [btn('Sáng', hits), btn('Trưa', hits), btn('Tối', hits), btn('Huỷ', hits, 'cancel')]);
    expect(`menu, gõ ${JSON.stringify(answer)}`, hits, want);
    if (w.seen[0]?.[0] !== 'prompt' || !/1\. Sáng\n2\. Trưa\n3\. Tối/.test(w.seen[0][1])) {
      out.push(`menu: phải là prompt() với danh sách đánh số, ra ${JSON.stringify(w.seen[0])}`);
    }
  }
  return out;
}

function loadBrowserAlert(src) {
  const out = mkdtempSync(path.join(tmpdir(), 'web-alert-'));
  try {
    writeFileSync(path.join(out, 'web-dialog.ts'), src);
    try {
      execFileSync('npx', ['tsc', 'web-dialog.ts', '--ignoreConfig', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'], { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* emit is what matters */ }
    return createRequire(import.meta.url)(path.join(out, 'web-dialog.js')).browserAlert;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const files = Object.fromEntries(walk(path.join(NATIVE, 'src')).map((p) => [path.relative(NATIVE, p), readFileSync(p, 'utf8')]));
problems.push(...staticProblems(files));
const libSrc = files[LIB];
const browserAlert = libSrc ? loadBrowserAlert(libSrc) : null;
if (typeof browserAlert !== 'function') problems.push(`tự kiểm hỏng: không nạp được browserAlert từ ${LIB} — đừng tin kết quả`);
else problems.push(...runtimeProblems(browserAlert));

/* ── thử ngược ── */
{
  if (staticProblems({ ...files, [LAYOUT]: files[LAYOUT].replace(/^\s*installWebAlert\(\);/m, '') }).length === 0) {
    problems.push('thử ngược hỏng: bỏ installWebAlert() khỏi _layout mà luật vẫn xanh');
  }
  if (staticProblems({ ...files, 'src/x.tsx': "import { Alert } from 'react-native-web';\n" }).length === 0) {
    problems.push('thử ngược hỏng: import Alert từ react-native-web mà luật vẫn xanh');
  }
  if (staticProblems({ ...files, 'src/x.tsx': "Alert.alert('a', 'b', [{ text: 'Không' }, { text: 'Có', onPress: f }]);\n" }).length === 0) {
    problems.push('thử ngược hỏng: hộp hai nút không có nút Huỷ mà luật vẫn xanh');
  }
  const swapped = loadBrowserAlert(libSrc.replace('actions[0].onPress?.();\n    else cancel?.onPress?.();', 'cancel?.onPress?.();\n    else actions[0].onPress?.();'));
  if (typeof swapped !== 'function' || runtimeProblems(swapped).length === 0) problems.push('thử ngược hỏng: đảo Đồng ý/Huỷ trong browserAlert mà luật vẫn xanh');
  const offByOne = loadBrowserAlert(libSrc.replace('Number(picked.trim()) - 1', 'Number(picked.trim())'));
  if (typeof offByOne !== 'function' || runtimeProblems(offByOne).length === 0) problems.push('thử ngược hỏng: menu lệch một số mà luật vẫn xanh');
}

if (problems.length) {
  console.log('hộp hỏi lại trên web lệch:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
const calls = Object.values(files).reduce((n, s) => n + alertCalls(s).length, 0);
console.log(
  `hộp hỏi lại trên web OK — _layout gọi installWebAlert(), nên ${calls} lời gọi Alert.alert trong src/ không còn im lặng ` +
    'trên trình duyệt; mọi Alert import từ react-native; mọi hộp hai nút có đúng một nút Huỷ. browserAlert THẬT: báo tin → ' +
    'alert(), một việc + Huỷ → confirm() nói rõ "OK" là làm gì, nhiều việc → prompt() đánh số (gõ sai, bỏ trống, đóng hộp đều là ' +
    'Huỷ). Thử ngược: bỏ lời gọi, import sai chỗ, hộp không Huỷ, đảo Đồng ý/Huỷ, menu lệch một số — mỗi cái đỏ',
);

/**
 * Gói ghim CHÍNH XÁC phải được CÀI chính xác — và pod phải theo gói đã cài.
 *
 * ── vì sao tệp này tồn tại: một lỗi mất bốn ngày và ba báo cáo sự cố ──
 *
 * A9 là `SIGABRT` trong `JSScheduler::scheduleOnJS`, và bản sửa là nâng
 * `react-native-worklets` từ `0.10.0` lên `0.10.1` (commit `089fbd5`, 09/09).
 * Ba báo cáo từ máy thật sau đó — 05/09, 12/09, 13/09 — đều mang đúng chữ ký
 * ấy, và suốt bốn ngày không ai trả lời được câu "máy đang chạy bản nào".
 *
 * Trả lời được rồi thì nó tầm thường đến khó chịu: `package.json` ghim
 * `0.10.1`, còn `node_modules` trên máy ấy là `0.10.0`. Kéo code về mà không
 * `npm install`, thế thôi. Và KHÔNG CÓ GÌ nói ra điều đó:
 *
 *   · `tsc` xanh — nó đọc kiểu, không đọc số phiên bản.
 *   · App khởi động êm — `checkCppVersion` của worklets so major với minor rồi
 *     BỎ QUA patch, mà đây đúng là một bước patch.
 *   · `ios/Podfile.lock` ghi `RNWorklets (0.10.0)` — đúng, vì podspec lấy
 *     phiên bản từ `package.json` của GÓI ĐÃ CÀI, chứ không từ chỗ ghim.
 *
 * Ba lớp đều im lặng, nên lỗi chỉ hiện ra ở đầu kia: một tệp `.ips`.
 *
 * ── hai phép kiểm, và vì sao phải là HAI ──
 *
 * **A. Ghim so với ĐÃ CÀI.** Bắt được "kéo code rồi mà chưa cài".
 *
 * **B. Đã cài so với POD.** Bắt được lỗi tiếp theo trong cùng chuỗi: cài rồi
 * mà chưa `pod install`, nên nhị phân vẫn mang C++ cũ. Chỉ so những pod mà
 * podspec của chúng đặt `s.version = package["version"]` — đọc THẲNG từ
 * podspec, nên một pod tự đánh số kiểu khác (`ExpoModulesWorklets` chẳng hạn)
 * không bị so nhầm.
 *
 * `ios/` do CNG sinh ra và bị gitignore, nên trong container nó vắng. Vắng thì
 * bước này NÓI RA là đã bỏ qua phần B, chứ không im lặng tính là xanh — một
 * phép kiểm không chạy mà báo xanh đúng là cái bẫy đã dựng nên mục này.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(readFileSync(f, 'utf8'));

const pkg = read(path.join(NATIVE, 'package.json'));
const problems = [];

/* ── A. ghim chính xác ⇄ đã cài ───────────────────────────────────────── */
const exactPins = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, v]) =>
  /^\d+\.\d+\.\d+/.test(v),
);

if (exactPins.length === 0) {
  problems.push(
    'không tìm thấy gói nào ghim chính xác trong package.json — bộ dò hỏng, vì repo này CÓ ghim ' +
      'chính xác mấy gói native quan trọng nhất',
  );
}

for (const [name, pin] of exactPins) {
  const p = path.join(NATIVE, 'node_modules', name, 'package.json');
  if (!existsSync(p)) {
    problems.push(`\`${name}\` ghim ${pin} nhưng KHÔNG có trong node_modules — chạy \`npm install\``);
    continue;
  }
  const got = read(p).version;
  if (got !== pin) {
    problems.push(
      `\`${name}\`: package.json ghim **${pin}**, node_modules đang là **${got}**. Kéo code về mà chưa ` +
        '`npm install`. Đây đúng là lỗi đã làm A9 sống thêm bốn ngày',
    );
  }
}

/* ── B. đã cài ⇄ pod trong ios/Podfile.lock ───────────────────────────── */
const LOCK = path.join(NATIVE, 'ios', 'Podfile.lock');
let podNote;

if (!existsSync(LOCK)) {
  podNote =
    'phần POD BỎ QUA ở lần chạy này vì `ios/Podfile.lock` không có (CNG sinh ra `ios/` và nó bị ' +
    'gitignore, nên container không có). Trên máy dựng thật thì phần ấy CÓ chạy';
} else {
  const lock = readFileSync(LOCK, 'utf8');
  /* pod nào trỏ vào node_modules/<gói> */
  const ext = /^\s{2}([\w.-]+):\n\s{4}:path: "(\.\.\/node_modules\/[^"]+)"/gm;
  const mapped = [...lock.matchAll(ext)].map(([, pod, rel]) => [pod, rel.replace('../node_modules/', '')]);
  let compared = 0;
  for (const [pod, dep] of mapped) {
    const depDir = path.join(NATIVE, 'node_modules', dep);
    if (!existsSync(path.join(depDir, 'package.json'))) continue;
    /* chỉ so khi podspec LẤY phiên bản từ package.json */
    const specs = readdirSync(depDir).filter((f) => f.endsWith('.podspec'));
    const derived = specs.some((f) =>
      /s\.version\s*=\s*\w*package\w*\[["']version["']\]/.test(readFileSync(path.join(depDir, f), 'utf8')),
    );
    if (!derived) continue;
    const installed = read(path.join(depDir, 'package.json')).version;
    const inLock = new RegExp(`^\\s{2}- ${pod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(([^)]+)\\)`, 'm').exec(
      lock,
    )?.[1];
    if (!inLock) continue;
    compared += 1;
    if (inLock !== installed) {
      problems.push(
        `pod \`${pod}\` đang là **${inLock}** còn \`${dep}\` đã cài là **${installed}** — chưa \`pod install\`, ` +
          'nên nhị phân vẫn mang mã native CŨ dù JS đã mới. Chạy `npm run prebuild:free` rồi dựng lại',
      );
    }
  }
  podNote = `phần POD so ${compared} pod lấy phiên bản từ package.json của gói`;
}

if (problems.length) {
  console.error('ghim gói native CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  `ghim gói native OK — ${exactPins.length} gói ghim CHÍNH XÁC trong package.json đều được cài đúng số ấy ` +
    'trong node_modules, và danh sách ghim được đọc ra khỏi chính package.json chứ không gõ tay. Đây là bước ' +
    'lẽ ra đã cắt bốn ngày khỏi A9: `package.json` ghim worklets 0.10.1 còn máy dựng cài 0.10.0, và không lớp ' +
    'nào nói ra — `tsc` đọc kiểu chứ không đọc phiên bản, `checkCppVersion` của worklets so major với minor ' +
    'rồi BỎ QUA patch (mà đây là bước patch), còn Podfile.lock ghi đúng 0.10.0 vì podspec lấy số từ gói ĐÃ ' +
    `CÀI chứ không từ chỗ ghim. Lỗi chỉ hiện ra ở đầu kia, trong ba tệp .ips. ${podNote}`,
);

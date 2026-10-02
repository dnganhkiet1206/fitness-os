/**
 * Mọi key i18n phải có prefix chủ sở hữu (nPg/nRc/nCx), hoặc nằm trong
 * allowlist dùng chung tường minh (`tools/i18n-shared-keys.json`).
 *
 * ── vì sao luật này tồn tại ──
 *
 * Ba người cùng viết trên một nhánh, một từ điển: không prefix thì key của
 * A đè key của B mà không ai hay — cùng tên `title`, hai màn hai nghĩa, và
 * TypeScript không thấy vì cả hai đều là string. Quy ước team (#6): A viết
 * `nPg…`, B viết `nRc…`, C viết `nCx…`.
 *
 * ── vì sao có allowlist ──
 *
 * Phần lớn key hiện tại ra đời trước quy ước — 1270 key dùng chung. Xoá hay
 * đổi tên hết chúng là một dự án riêng, không phải việc của cổng. Nên cổng
 * chốt HIỆN TRẠNG: key mới (chưa từng có) mà không prefix thì đỏ, và người
 * viết phải chọn — đặt prefix chủ sở hữu, hoặc thêm key vào
 * `i18n-shared-keys.json` (hiện trong diff, để người review thấy quyết định
 * "dùng chung" ấy).
 *
 * Cổng cũng giữ hai điều kiện xung quanh:
 *   - từ điển `vi` và `en` của mỗi file phải cùng tập key — thiếu bản dịch
 *     là một lỗi riêng, thấy ở đây luôn;
 *   - allowlist không được có key thừa (không còn trong từ điển nào) — list
 *     chết là list không ai dám xoá, rồi ai cũng thêm bừa.
 *
 * Phạm vi: `src/lib/i18n.ts` (t/via `t()`) và `src/lib/native-strings.ts`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const OWNER = /^n(Pg|Rc|Cx)/;
const shared = new Set(JSON.parse(readFileSync(path.join(NATIVE, 'tools/i18n-shared-keys.json'), 'utf8')));

const { t } = await import(pathToFileURL(path.join(NATIVE, 'src/lib/i18n.ts')).href);
const { nativeStrings } = await import(
  pathToFileURL(path.join(NATIVE, 'src/lib/native-strings.ts')).href
);

const dicts = [
  ['src/lib/i18n.ts', { vi: t('vi'), en: t('en') }],
  ['src/lib/native-strings.ts', nativeStrings],
];
const seen = new Set();
let owned = 0;
let total = 0;
for (const [file, langs] of dicts) {
  const vk = Object.keys(langs.vi);
  const ek = Object.keys(langs.en);
  for (const k of vk) if (!ek.includes(k)) problems.push(`${file}: key ${k} có ở vi mà thiếu ở en`);
  for (const k of ek) if (!vk.includes(k)) problems.push(`${file}: key ${k} có ở en mà thiếu ở vi`);
  for (const k of new Set([...vk, ...ek])) {
    total++;
    seen.add(k);
    if (OWNER.test(k)) {
      owned++;
      continue;
    }
    if (!shared.has(k)) {
      problems.push(
        `${file}: key mới ${k} không có prefix chủ sở hữu (nPg/nRc/nCx) — thêm prefix, hoặc thêm vào tools/i18n-shared-keys.json nếu thật sự dùng chung`,
      );
    }
  }
}
for (const k of shared) {
  if (!seen.has(k)) problems.push(`allowlist thừa: ${k} không còn trong từ điển nào — xoá khỏi tools/i18n-shared-keys.json`);
}
if (total < 1000) problems.push(`tự kiểm: chỉ ${total} key — bộ quét đã mù?`);

if (problems.length) {
  console.error(`namespace i18n HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `namespace i18n OK — ${total} key: ${owned} có prefix chủ sở hữu, ${shared.size} dùng chung có tên trong allowlist, vi/en khớp nhau`,
);

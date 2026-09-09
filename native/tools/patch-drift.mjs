/**
 * Mỗi tệp trong `patches/` phải mang đúng số phiên bản đang cài.
 *
 * ── vì sao bước này tồn tại ──
 *
 * A12 mất một vòng chẩn đoán vì đúng một dòng:
 *
 *     Patch file created for expo-modules-jsi@57.0.3
 *     applied to expo-modules-jsi@57.1.0
 *
 * Dòng ấy in ra NGAY TRƯỚC hai lỗi biên dịch trong cùng gói đó, nên nó đọc như
 * nguyên nhân. Nó không phải: patch cũ đụng một tệp Swift khác, còn hai lỗi nằm
 * ở một header C++ mà patch chưa bao giờ chạm tới. Phải tải hai bản tarball về
 * và `diff` mới loại được nó.
 *
 * Cái giá thật của một patch lệch phiên bản không phải là nó hỏng — patch-package
 * vẫn in `✔` — mà là nó đứng cạnh mọi lỗi khác trong gói ấy và trông như thủ phạm.
 *
 * ── và vì sao luật là "khớp phiên bản", không phải "patch phải áp được" ──
 *
 * patch-package đã tự kiểm chuyện áp được rồi, ở mỗi lần `npm ci`. Thứ nó KHÔNG
 * kiểm là tên tệp còn nói thật hay không sau khi cây phụ thuộc dịch chuyển —
 * và ở đây nó dịch vì một bản PATCH của `expo-modules-core` đổi ràng buộc
 * `expo-modules-jsi` qua một MINOR.
 *
 * Bước này đọc `node_modules/<gói>/package.json`, tức phiên bản THẬT đang nằm
 * trên đĩa, chứ không đọc lockfile: lockfile nói ý định, node_modules nói cái
 * sẽ được biên dịch.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PATCHES = path.join(NATIVE, 'patches');
const problems = [];
const want = (ok, msg) => { if (!ok) problems.push(msg); };

if (!existsSync(PATCHES)) {
  console.log('trôi patch OK — không có thư mục `patches/`, không có gì để lệch.');
  process.exit(0);
}

const files = readdirSync(PATCHES).filter((f) => f.endsWith('.patch')).sort();

/* Một luật quét ra 0 mục tiêu là một luật xanh vĩnh viễn. Repo này ĐANG có
   patch, nên số 0 nghĩa là phép nhận diện hỏng chứ không phải tin vui. */
want(files.length > 0, 'thư mục `patches/` không có tệp `.patch` nào — nếu patch đã bị bỏ thì xoá cả bước này');

const checked = [];

for (const f of files) {
  /* `<gói>+<phiên bản>.patch`, và gói có scope thì dấu `+` phân tách phần cuối:
     `@scope+name+1.2.3.patch`. Nên tách từ PHẢI sang. */
  const stem = f.slice(0, -'.patch'.length);
  const cut = stem.lastIndexOf('+');
  if (cut < 1) {
    problems.push(`${f}: tên không theo dạng \`<gói>+<phiên bản>.patch\`, không đối chiếu được`);
    continue;
  }
  const pkg = stem.slice(0, cut).replace(/\+/g, '/');
  const want_ = stem.slice(cut + 1);

  const manifest = path.join(NATIVE, 'node_modules', pkg, 'package.json');
  if (!existsSync(manifest)) {
    problems.push(
      `${f}: vá \`${pkg}\` nhưng gói đó KHÔNG có trong node_modules. `
      + 'Một patch cho thứ không tồn tại không bao giờ chạy, và không bao giờ ai biết',
    );
    continue;
  }

  const got = JSON.parse(readFileSync(manifest, 'utf8')).version;
  checked.push(`${pkg}@${got}`);

  want(got === want_,
    `${f}: tệp nói \`${want_}\` nhưng trên đĩa là \`${got}\`. patch-package vẫn in \`✔\` và vẫn cảnh báo — `
    + 'và cảnh báo ấy sẽ đứng cạnh mọi lỗi biên dịch khác trong gói này và trông như thủ phạm (xem A12). '
    + `Chạy \`npx patch-package ${pkg}\` để sinh lại tên đúng, SAU KHI đã đọc xem nội dung patch còn cần không`);

  /* Patch rỗng nghĩa là thượng nguồn đã nhận bản sửa — giữ nó lại chỉ để lại
     một cảnh báo cho lần chẩn đoán sau. Patch cũ của A12 đúng là như vậy. */
  const body = readFileSync(path.join(PATCHES, f), 'utf8');
  want(/^[-+][^-+]/m.test(body),
    `${f}: không có dòng thêm/bớt nào — patch rỗng. Nếu thượng nguồn đã nhận bản sửa thì xoá tệp này`);
}

if (problems.length) {
  console.error('trôi patch CÓ LỖI:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `trôi patch OK — ${files.length} patch, và mỗi tệp mang đúng phiên bản ĐANG NẰM TRÊN ĐĨA `
  + `(${checked.join(', ')}), đọc từ node_modules chứ không từ lockfile: lockfile nói ý định, node_modules `
  + 'nói cái sẽ được biên dịch. patch-package tự lo chuyện áp được; thứ nó KHÔNG lo là tên tệp còn nói thật '
  + 'sau khi cây phụ thuộc dịch — và ở A12 nó dịch vì một bản PATCH của expo-modules-core đổi ràng buộc '
  + 'expo-modules-jsi qua một MINOR. Cái giá của một patch lệch không phải là nó hỏng (nó vẫn `✔`) mà là '
  + 'cảnh báo của nó đứng cạnh mọi lỗi khác trong gói ấy và trông như thủ phạm. Không patch nào rỗng.',
);

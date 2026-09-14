/**
 * Trong `src/` không được có tệp `.js` nào.
 *
 * ── lỗi đã sửa ──
 *
 * `tools/sleep-length.mjs` biên dịch `src/lib` vào một thư mục tạm để chạy
 * `asleepMinutes` thật. Bản đầu của nó khai `paths` cho bí danh `@/`, nên
 * `tsc` đi theo `@/integrations/supabase/client` ra NGOÀI `src/lib`; mà
 * `rootDir` lại là `src/lib`, nên mấy tệp ngoài ấy không ánh xạ được vào
 * `outDir` và `tsc` phát thẳng `.js` cạnh tệp nguồn.
 *
 * Bốn tệp sinh tự động lọt vào cây nguồn và vào một commit — và thứ tạo ra
 * chúng lại chính là một bước gác. Nguyên nhân đã bịt tại chỗ, nhưng nguyên
 * nhân là một dòng cấu hình, còn cái LỚP tai nạn này thì bất kỳ bước gác nào
 * biên dịch TypeScript cũng dựng lại được. Nên có luật riêng cho cái lớp.
 *
 * Cả `src/` là TypeScript. Một tệp `.js` ở đó không có cách nào là cố ý: hoặc
 * là rác của trình biên dịch, hoặc là một tệp lẽ ra phải là `.ts`.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

const stray = [];
let seen = 0;
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f);
    else {
      seen += 1;
      /* `.d.ts` KHÔNG nằm trong danh sách: `src/css-modules.d.ts` là tệp khai
         báo viết tay hợp lệ, và bản đầu của luật này đỏ ở đúng nó. Danh sách
         chỉ gồm thứ trình biên dịch phát ra mà `src/` không bao giờ có. */
      if (/\.(js|jsx|mjs|cjs|js\.map)$/.test(e)) stray.push(path.relative(NATIVE, f));
    }
  }
})(SRC);

if (seen === 0) {
  console.error('src sạch CÓ LỖI:\n\n  • không duyệt được tệp nào trong src — bộ dò hỏng');
  process.exit(1);
}

if (stray.length) {
  console.error('src sạch CÓ LỖI:\n');
  for (const f of stray) {
    console.error(
      `  • ${f} — \`src/\` là TypeScript, nên một tệp như thế này hoặc là rác trình biên dịch ` +
        'hoặc là một tệp lẽ ra phải là `.ts`. Nếu nó vừa xuất hiện sau khi chạy một bước gác thì ' +
        'bước ấy đang phát `.js` vào cây nguồn — xem `tools/sleep-length.mjs` để biết chỗ sai là gì',
    );
  }
  process.exit(1);
}

console.log(
  `src sạch OK — ${seen} tệp trong src, không tệp nào là \`.js\`, \`.jsx\`, \`.mjs\`, \`.cjs\` hay \`.js.map\`. ` +
    'Luật này có vì một bước gác của chính repo đã phát bốn tệp `.js` vào cây nguồn rồi để chúng lọt vào ' +
    'một commit: `sleep-length.mjs` khai `paths` cho bí danh `@/`, nên `tsc` đi theo import ra ngoài ' +
    '`src/lib`, mà `rootDir` lại là `src/lib` nên mấy tệp ngoài ấy không ánh xạ được vào `outDir`. Nguyên ' +
    'nhân đã bịt tại chỗ; bước này gác cái LỚP, vì bất kỳ bước gác nào biên dịch TypeScript cũng dựng lại được nó',
);

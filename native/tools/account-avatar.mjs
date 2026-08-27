/**
 * Avatar ở góc trên: chữ cái đầu đúng, và có nhánh cho lúc không có chữ nào.
 *
 * ── ca quan trọng nhất không phải một ca ở rìa ──
 *
 * `profiles.name` khai là `TEXT NOT NULL DEFAULT ''`. Nghĩa là **mọi tài khoản
 * mới đều có tên rỗng** cho tới khi người ta tự vào điền — nên "không có gì để
 * vẽ" là trạng thái MẶC ĐỊNH, không phải ngoại lệ. Một hàm trả `""` ở đây cho
 * ra một vòng tròn trống ở góc màn hình đầu tiên người dùng mới nhìn thấy, và
 * không có lỗi nào báo.
 *
 * Luật này đọc NGƯỢC cái default ấy ra khỏi migration thay vì tin trí nhớ, rồi
 * đòi hàm phải trả `null` — một câu trả lời chỗ gọi buộc phải xử lý.
 *
 * ── và vì sao CHẠY hàm thật ──
 *
 * Chữ cái đầu là chuyện của chuỗi, và chuỗi là chỗ mọi giả định đều sai: dấu
 * tiếng Việt, emoji ở đầu tên, khoảng trắng thừa, tên một chữ, tên không thuộc
 * Latin. Một regex dò mã nguồn không nói được `"Đặng Anh Kiệt"` ra gì. Nên tệp
 * này dịch `lib/initials.ts` rồi gọi nó với đúng những chuỗi ấy.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const SRC = 'src/lib/initials.ts';
const AVATAR = 'src/components/ascnd/account-avatar.tsx';
const TODAY = 'src/app/(tabs)/index.tsx';
const OUT = path.join(NATIVE, 'node_modules', '.cache', 'account-avatar');

/* ── dịch hàm thật ────────────────────────────────────────────────────────── */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
execFileSync(
  'npx',
  ['tsc', SRC, '--ignoreConfig', '--outDir', OUT, '--rootDir', 'src', '--module', 'commonjs',
    '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { initialsFor } = await import(`file://${path.join(OUT, 'lib/initials.js')}`);

const problems = [];

/**
 * Hợp đồng, nói bằng đầu vào và đầu ra.
 *
 * `null` khác `""` và khác `" "` — cả ba đều "rỗng" với mắt người và chỉ một
 * trong ba làm chỗ gọi phải rẽ nhánh.
 */
const CASES = [
  /* Ca mặc định của cơ sở dữ liệu, và ca của mọi tài khoản mới. */
  [['', null], null, 'tên rỗng + không email → không có gì để vẽ'],
  [[null, null], null, 'không hồ sơ → không có gì để vẽ'],
  [['', 'kiet@gmail.com'], 'K', 'tên rỗng thì rơi xuống email'],
  /* Tên Việt: họ trước, tên riêng sau — chữ đầu và chữ CUỐI. */
  [['Đặng Anh Kiệt', null], 'ĐK', 'tên Việt ba chữ giữ họ và tên riêng'],
  [['đặng anh kiệt', null], 'ĐK', 'chữ thường vẫn ra chữ hoa có dấu'],
  [['Anna Nguyen', 'x@y.z'], 'AN', 'tên hai chữ, và TÊN thắng email'],
  [['Kiệt', null], 'K', 'tên một chữ ra một chữ, không nhân đôi'],
  [['  Anna   Nguyen  ', null], 'AN', 'khoảng trắng thừa không đẻ ra chữ rỗng'],
  /* Ô người dùng tự gõ, nên nó nhận được mọi thứ. */
  [['🔥 Kiệt', null], 'K', 'emoji không phải chữ cái, và không được thành chữ đầu'],
  [['🔥', null], null, 'chỉ có emoji thì không có gì để vẽ'],
  [['...', 'zoe@x.com'], 'Z', 'toàn dấu câu thì rơi xuống email'],
  /* 田中 = họ, 太郎 = tên riêng → chữ ĐẦU của mỗi từ, đúng luật đang áp cho
     mọi ngôn ngữ. Bảng này thoạt đầu kỳ vọng "田郎" — chữ đầu của từ đầu cộng
     chữ CUỐI của từ cuối — và đó là một luật thứ hai không ai viết ra; máy dò
     đỏ trên chính chỗ tôi gõ sai kỳ vọng. */
  [['田中 太郎', null], '田太', 'tên không thuộc Latin vẫn có chữ đầu của mỗi từ'],
  [[null, 'kiet.dang@x.com'], 'K', 'email chỉ cho MỘT chữ, không bịa ra họ tên'],
  [[null, '@x.com'], null, 'email không có phần tên thì không vẽ chữ'],
];

for (const [args, want, what] of CASES) {
  const got = initialsFor(...args);
  if (got !== want) {
    problems.push(
      `${SRC}: initialsFor(${args.map((a) => JSON.stringify(a)).join(', ')}) = ${JSON.stringify(got)}, ` +
        `phải là ${JSON.stringify(want)} — ${what}`,
    );
  }
}

/* ── cái default của DB phải ĐÚNG là thứ luật này đang giả định ──────────── */
/*
  Cả lập luận trên đứng trên một câu: `name` mặc định là chuỗi rỗng. Đọc ngược
  nó ra khỏi migration, vì nếu ngày nào đó default đổi thành NULL thì ca đầu
  bảng vẫn xanh trong khi thứ chảy vào hàm đã là một giá trị khác.
*/
const MIG = path.join(ROOT, 'supabase', 'migrations');
const schema = readdirSync(MIG)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(path.join(MIG, f), 'utf8'))
  .join('\n');
const decl = /CREATE TABLE public\.profiles \(([\s\S]*?)\n\);/.exec(schema);
if (!decl) {
  problems.push('không đọc được bảng profiles trong migration');
} else {
  if (!/name TEXT NOT NULL DEFAULT ''/.test(decl[1])) {
    problems.push(
      "profiles.name không còn là `TEXT NOT NULL DEFAULT ''` — cả luật này dựng trên giả định rằng tài " +
        'khoản mới có tên RỖNG chứ không phải NULL, và hai thứ đó đi vào hàm theo hai đường khác nhau',
    );
  }
  if (/avatar/i.test(decl[1])) {
    problems.push(
      'profiles đã có cột ảnh — avatar nên vẽ ẢNH thật, và nhánh chữ cái đầu tụt xuống làm dự phòng thay ' +
        'vì là đường duy nhất',
    );
  }
}

/* ── và cái mặt phải còn hai nhánh ───────────────────────────────────────── */
const avatar = read(AVATAR);
if (!/borderRadius: radius\.full/.test(avatar)) {
  problems.push(
    `${AVATAR}: mặt avatar không còn bo tròn hẳn — hình TRÒN là cách iOS nói "đây là một người"; bo cùng ` +
      'bán kính với các nút kia thì nó đọc ra là một nút nữa có chữ bên trong',
  );
}
if (!/<Icon icon=\{User\}/.test(avatar)) {
  problems.push(
    `${AVATAR}: mất nhánh hình người — tài khoản mới có tên rỗng, nên không có nhánh này thì màn hình đầu ` +
      'tiên của họ là một vòng tròn trống ở góc',
  );
}
if (!/maxFontSizeMultiplier/.test(avatar)) {
  problems.push(
    `${AVATAR}: chữ cái đầu không có trần phóng chữ — nó nằm TRONG một hình có đường kính cứng, nên ở cỡ ` +
      'trợ năng lớn nhất hai chữ tràn ra ngoài vòng tròn',
  );
}
/* Không màu: luật "màu dành cho GIÁ TRỊ, không dành cho LỐI ĐI" đã được ghi ở
   index.tsx khi các viên chip bỏ màu. Avatar là một lối đi. */
if (/colors\.(primary|metric\w+|success|danger|warning)/.test(avatar)) {
  problems.push(
    `${AVATAR}: avatar mang màu nhấn — màu dành cho GIÁ TRỊ, không dành cho LỐI ĐI, và cả hàng nút góc trên ` +
      'đã về đơn sắc để nó mờ đi như một khối khi cuộn',
  );
}

/* ── dây nối: header dùng nó, và không còn cái bánh răng ─────────────────── */
const today = read(TODAY);
if (!/<AccountAvatar name=\{profile\?\.name\} email=\{user\?\.email\} \/>/.test(today)) {
  problems.push(`${TODAY}: header không dựng AccountAvatar với cả tên lẫn email`);
}
if (/<Icon icon=\{Settings\}/.test(today)) {
  problems.push(`${TODAY}: vẫn còn icon bánh răng ở header — avatar là thứ thay nó, không phải thứ thêm vào`);
}

rmSync(OUT, { recursive: true, force: true });

if (problems.length) {
  console.log('avatar tài khoản sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `avatar tài khoản OK — CHẠY THẬT initialsFor qua ${CASES.length} ca: tên Việt ba chữ giữ họ và tên riêng ` +
    '("Đặng Anh Kiệt" → "ĐK", không phải "ĐA"), chữ thường ra chữ hoa CÓ DẤU, tên một chữ không bị nhân đôi, ' +
    'tên không thuộc Latin vẫn có chữ đầu, và emoji hay dấu câu ở đầu tên không bao giờ thành chữ cái. Ca ' +
    "quan trọng nhất không nằm ở rìa mà là MẶC ĐỊNH: `profiles.name` khai `NOT NULL DEFAULT ''` — con số ấy " +
    'được đọc ngược ra khỏi migration chứ không tin trí nhớ — nên mọi tài khoản mới có tên rỗng, và hàm trả ' +
    '`null` chứ không trả `""`, tức một câu trả lời chỗ gọi BUỘC phải rẽ nhánh. Email là lưới cuối và chỉ ' +
    'cho MỘT chữ, không bịa ra họ tên; tên luôn thắng email. Cái mặt giữ đủ ba chốt: bo tròn hẳn (hình tròn ' +
    'là cách iOS nói "đây là một người"), có nhánh hình người, và chữ mang trần phóng vì nó nằm trong một ' +
    'hình có đường kính cứng. Không màu nhấn — màu dành cho GIÁ TRỊ, không dành cho LỐI ĐI. Và cái bánh ' +
    'răng đã đi hẳn chứ không nằm đâu đó cạnh avatar',
);

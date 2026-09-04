/**
 * Rãnh chưa chạy của một vòng tròn phải NHÌN THẤY ĐƯỢC, ở cả hai bản.
 *
 * ── lỗi nó bắt ──
 *
 * Người dùng đang dựng giao diện sáng và gửi ảnh khoanh đúng phần rãnh của hai
 * vòng ở đầu màn Hôm nay: chúng chìm hẳn vào nền. Đo ra:
 *
 *     tối   #17171c so với #070708  →  1,13:1
 *     sáng  #e6e0d4 so với #f7f4ef  →  1,20:1
 *
 * Không phải "kín đáo" — là không có. Và bản sáng mắc đúng cùng một lỗi, thứ
 * chỉ lộ ra khi có người nhìn hai bản cạnh nhau.
 *
 * ── vì sao lỗi này sống được lâu ──
 *
 * `activity-rings.tsx` đã tìm ra nó MỘT LẦN, đo được 1,01:1, ghi
 * "indistinguishable, not subtle", rồi sửa bằng một hằng số CỤC BỘ. Ba vòng của
 * tệp đó khỏi; mọi vòng khác trong app ở lại trên giá trị vô hình. Một kết luận
 * đúng cất sai chỗ thì nó chỉ chữa được đúng tệp chứa nó.
 *
 * Nên luật này có hai vế: con số phải đủ tương phản, VÀ không ai được viết cứng
 * lại một rãnh mới bên ngoài bảng màu.
 *
 * ── vì sao sàn là 1,5 chứ không phải 4,5 ──
 *
 * Rãnh không phải chữ và không phải một control; nó là cái nền mà vòng đã chạy
 * đè lên. Ở 4,5:1 nó sẽ tranh chỗ với chính vòng tiến trình. `activity-rings`
 * ghi đúng cái ngưỡng cần: "đủ để tìm thấy, còn xa mới tranh được với một vòng
 * đã chạy ở 7:1 trở lên".
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE = 'src/constants/palette.ts';
const FLOOR = 1.5;
const problems = [];

const src = readFileSync(path.join(NATIVE, PALETTE), 'utf8');

/* Hai bảng, cắt theo chỗ khai của chúng — không dò tên token trên cả tệp, vì
   `ringTrack` xuất hiện hai lần và một regex toàn cục sẽ lấy nhầm cái đầu cho
   cả hai. */
const cut = (from, to) => {
  const a = src.indexOf(from);
  const b = to ? src.indexOf(to) : src.length;
  return a === -1 ? '' : src.slice(a, b === -1 ? src.length : b);
};
const blocks = {
  tối: cut('export const darkPalette', 'export type PaletteKey'),
  sáng: cut('export const lightPalette', 'export const palettes'),
};

const tok = (block, name) => {
  const m = new RegExp(`\\n\\s*${name}: '(#[0-9a-fA-F]{3,8})'`).exec(block);
  return m?.[1];
};

const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const L = (hex) => {
  const h = hex.replace('#', '');
  const n = (h.length === 3 ? h.split('').map((x) => x + x) : h.match(/../g)).slice(0, 3).map((x) => parseInt(x, 16));
  return 0.2126 * lin(n[0]) + 0.7152 * lin(n[1]) + 0.0722 * lin(n[2]);
};
const ratio = (a, b) => {
  const [hi, lo] = L(a) > L(b) ? [L(a), L(b)] : [L(b), L(a)];
  return (hi + 0.05) / (lo + 0.05);
};

/* ── 1. đủ tương phản, Ở CẢ HAI BẢN ── */
const seen = [];
for (const [name, block] of Object.entries(blocks)) {
  if (!block) { problems.push(`${PALETTE}: không cắt được bảng ${name} — luật này đang không kiểm gì`); continue; }
  const track = tok(block, 'ringTrack');
  const bg = tok(block, 'background');
  if (!track || !bg) { problems.push(`${PALETTE}: bảng ${name} thiếu ringTrack hoặc background`); continue; }
  const r = ratio(track, bg);
  seen.push(`${name} ${track} trên ${bg} = ${r.toFixed(2)}:1`);
  if (r < FLOOR) {
    problems.push(
      `${PALETTE}: bản ${name} có ringTrack ${track} chỉ hơn nền ${bg} ${r.toFixed(2)}:1, dưới sàn ${FLOOR} — ` +
        'một vòng ở 0% khi đó không còn gì để nhìn, và người dùng đọc ra là thẻ hỏng chứ không phải số bằng 0',
    );
  }
}

/* ── 2. không ai viết cứng một rãnh mới ──
   Rãnh vòng tròn luôn là `fill="none"` cộng một `stroke`. Một `stroke` viết
   cứng ở đó là một màu không đi theo bản sáng được. Hình có `fill` thật —
   chấm tròn, hạt, nhân vật — không thuộc luật này. */
for (const f of globSync('src/**/*.tsx', { cwd: NATIVE }).sort()) {
  const code = readFileSync(path.join(NATIVE, f), 'utf8');
  for (const m of code.matchAll(/<Circle\b[^>]*>/gs)) {
    const tag = m[0];
    if (!/fill=["{']?none/.test(tag)) continue;
    const lit = /stroke=["{]\s*['"`]?(#[0-9a-fA-F]{3,8})/.exec(tag);
    if (!lit) continue;
    const line = code.slice(0, m.index).split('\n').length;
    problems.push(
      `${f}:${line}: rãnh vòng tròn viết cứng màu ${lit[1]} — nó không đi theo bản sáng, và đó đúng là ` +
        `cách giá trị vô hình cũ sống sót ở bốn vòng khác nhau. Đọc \`ringTrack\` từ bảng màu`,
    );
  }
}

if (problems.length) {
  console.error('rãnh vòng tròn sai:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(
  `rãnh vòng tròn OK — ${seen.join(' · ')}; cả hai vượt sàn ${FLOOR}:1, và không vòng nào trong ` +
    'src/ còn viết cứng màu rãnh. Giá trị cũ đo được 1,13:1 (tối) và 1,20:1 (sáng) — không phải kín ' +
    'đáo mà là không có; `activity-rings.tsx` từng tìm ra đúng điều đó, đo 1,01:1, rồi sửa bằng một ' +
    'hằng số cục bộ nên ba vòng của nó khỏi còn mọi vòng khác ở lại trên giá trị vô hình',
);

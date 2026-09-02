/**
 * Chữ phải có màu.
 *
 * ── lỗi nó bắt ──
 *
 * `awards.tsx` có style `tierTitle` với `fontSize`, `fontWeight`,
 * `textTransform`, `letterSpacing` — và không có `color`. Trước đó màu đến từ
 * một dòng inline `{ color: tc.color }` theo hạng; khi màn đổi sang nhóm theo
 * MIỀN, dòng inline ấy bị bỏ vì không còn nghĩa, và không ai cấp màu thay thế.
 *
 * Chữ rơi về màu mặc định của hệ thống: đen trên nền đen. Tiêu đề mục biến mất
 * hoàn toàn khỏi màn hình.
 *
 * ── vì sao không cửa nào bắt được ──
 *
 * `tsc` xanh: thiếu `color` là `TextStyle` hợp lệ.
 * Guard xanh: không luật nào nói "mỗi Text phải có màu".
 * Ảnh chụp: bắt được, nhưng chỉ khi có người nhìn đúng chỗ — và trong phiên
 * này người dùng là người phát hiện, sau hai lượt dựng mười phút.
 *
 * Đây là họ lỗi "đổi một vế của một cặp rồi quên vế kia", cùng họ với
 * `alignItems: 'baseline'` ở thẻ cân nặng và `minWidth` ở ô nhập cân nặng.
 *
 * ── nó KHÔNG bắt gì ──
 *
 * Style nhận màu inline tại chỗ dùng — `style={[styles.mark, { color: x }]}` —
 * là hợp lệ và phổ biến (huy chương đổi màu theo trạng thái mở/chưa mở). Nên
 * luật chỉ báo khi style vừa thiếu `color` VỪA không có chỗ dùng nào truyền
 * màu vào. Một luật bắt cả hai trường hợp sẽ bị tắt trong một tuần.
 */
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Thuộc tính chỉ có nghĩa với chữ. `lineHeight` cố ý KHÔNG nằm đây: nó dùng
   được cho cả View trong vài bố cục, nên nó không chứng minh đây là style chữ. */
const TEXTY = ['fontSize', 'fontWeight', 'letterSpacing', 'textTransform', 'fontFamily', 'textAlign'];

const files = globSync('src/**/*.tsx', { cwd: NATIVE }).map((f) => path.join(NATIVE, f));
const bad = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const i = src.indexOf('StyleSheet.create');
  if (i === -1) continue;
  const tail = src.slice(i);

  /* Khối `tên: { … }` một cấp. Bỏ qua khối lồng — chúng hiếm, và một luật
     đoán sai còn tệ hơn một luật bỏ sót. */
  for (const m of tail.matchAll(/(\w+):\s*\{([^{}]*)\}/g)) {
    const [, name, body] = m;
    if (!TEXTY.some((k) => body.includes(k))) continue;
    if (/(^|\s)color:/.test(body)) continue;
    /*
      Có chỗ nào truyền màu vào style này không?

      Phải khớp CẢ MẢNG `[ … ]`, không phải "từ tên style tới dấu ] gần nhất".
      Bản đầu viết `styles.NAME[^\\]]*color:` và nó vớ được một `color:` cách
      đó hàng trăm dòng — nên guard báo xanh cho chính cái lỗi nó sinh ra để
      bắt. Phép phá hoại lộ ra điều đó; nếu không thử phá thì tệp này đã được
      commit như một cái lưới không có đáy.
    */
    if (new RegExp(`\\[[^\\[\\]]*styles\\.${name}[^\\[\\]]*\\bcolor:`).test(src)) continue;

    /*
      Chỉ báo khi style được dùng MỘT MÌNH.

      Bản đầu báo mọi style chữ thiếu `color`, và nó ra chín chỗ — tất cả đều
      là báo nhầm. Hai kiểu:

        style={[styles.colLabel, styles.colName]}   ← anh em mang màu
        <Text style={styles.iconEmoji}>🔥</Text>    ← emoji tự có màu

      Kiểu thứ nhất là cách viết bổ nghĩa hoàn toàn bình thường: một style nền
      mang màu, một style thêm chỉ chỉnh cỡ hoặc căn lề. Bắt nó nghĩa là luật
      này sẽ bị tắt trong một tuần.

      Dùng một mình thì không còn ai mang màu hộ, và đó đúng là hình dạng của
      `tierTitle` khi nó biến mất: `<Text style={styles.tierTitle}>`.
    */
    if (!new RegExp(`style=\\{styles\\.${name}\\}`).test(src)) continue;
    const line = src.slice(0, i + m.index).split('\n').length;
    bad.push(`${path.relative(NATIVE, file)}:${line}  ${name}`);
  }
}

if (bad.length) {
  console.error('style CHỮ không có màu, và không chỗ nào truyền màu vào:\n');
  for (const b of bad) console.error('  • ' + b);
  console.error('\nThiếu `color` là style hợp lệ, nên tsc không thấy. Chữ sẽ rơi về');
  console.error('màu mặc định của hệ thống — trên nền tối là đen trên đen.');
  process.exit(1);
}
console.log(`màu chữ OK — mọi style chữ hoặc tự khai màu, hoặc nhận màu tại chỗ dùng`);

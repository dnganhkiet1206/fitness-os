/**
 * Nhìn vào thanh tab phải biết mình đang ở tab nào.
 *
 * ── lỗi nó bắt ──
 *
 * `tintColor={colors.foreground}` (#ededed) với các tab chưa chọn hiện ra
 * TRẮNG: tương phản 1,17:1. Tức mục đang chọn và bốn mục kia gần như cùng một
 * màu, và cách duy nhất biết mình ở đâu là cái viên nang mờ phía sau.
 *
 * Đo pixel trên ảnh chụp máy thật (điểm sáng nhất của mỗi glyph):
 *
 *     tab chưa chọn   rgb(255,255,255)   L = 1.000
 *     tab đang chọn   rgb(232,232,232)   L = 0.807
 *
 * Không cửa nào bắt được: cả hai đều là màu hợp lệ, `tsc` xanh, và một thanh
 * tab mà mọi mục cùng màu trắng trông hoàn toàn bình thường trong ảnh chụp trừ
 * khi có người hỏi "tab nào đang mở".
 *
 * ── vì sao luật kiểm CẢ HAI màu chưa chọn ──
 *
 * Nguồn nói tab chưa chọn là `mutedForeground`, còn máy thật thì vẽ ra trắng —
 * `iconColor={{ default }}` không có tác dụng trên iOS 26 của máy ấy. Tôi
 * không kiểm được iOS từ đây, nên luật này KHÔNG đoán xem cái nào đang chạy.
 * Nó đòi một điều đúng trong cả hai trường hợp: dù nền tảng cho ra màu nào, mục
 * đang chọn vẫn phải khác nhìn thấy được.
 *
 * Đó cũng là lý do sàn là 1,5:1 chứ không cao hơn. Ghi chú trong `app-tabs`
 * ghi lại rằng bạc so với xám (1,74:1) đã từng bị bác là "quá gần"; sàn này
 * KHÔNG phán lại chuyện đó — nó chỉ chặn cái đã thật sự ship và không ai thấy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TABS = 'src/components/app-tabs.tsx';
/* Giá trị màu sống ở `constants/palette.ts` — dữ liệu THUẦN, không import gì —
   để `tools/palette.mjs` biên dịch rồi chạy nó mà đo tương phản trên giá trị
   thật. `ascnd.ts` chỉ còn re-export nó dưới cái tên `colors`, nên một công cụ
   dò mã màu bằng regex phải đọc tệp này. */
const PALETTE = 'src/constants/palette.ts';
const FLOOR = 1.5;

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const tabs = strip(readFileSync(path.join(NATIVE, TABS), 'utf8'));
const palette = readFileSync(path.join(NATIVE, PALETTE), 'utf8');
const problems = [];

/**
 * Bảng màu đọc từ nguồn, không chép — và đọc CẢ HAI bảng.
 *
 * ── vì sao "cả hai" là một sửa chữa, không phải một cải tiến ──
 *
 * Bản trước lấy khớp ĐẦU TIÊN của `name: '#…'` trong tệp bảng màu. `darkPalette`
 * được khai trước, nên luật này chỉ từng đo bản TỐI — và nó vẫn xanh suốt thời
 * gian bản sáng tồn tại, kể cả khi mọi con số của bản sáng khác hẳn.
 *
 * Nó lộ ra khi thử đổi tab đang chọn sang `brand`: bản tối vẫn qua (1,74× và
 * 2,20×) trong khi bản SÁNG tụt xuống 1,23× so với màu chưa chọn mà nguồn khai
 * — tức hai màu đọc ra như một, và không luật nào kêu.
 */
const tokens = (name) => {
  const dark = /export const darkPalette = \{[\s\S]*?\n\} as const;/.exec(palette)?.[0] ?? '';
  const light = /export const lightPalette: Palette = \{[\s\S]*?\n\};/.exec(palette)?.[0] ?? '';
  const grab = (src, theme) => {
    const m = new RegExp(`\\n\\s*${name}: '(#[0-9a-fA-F]{3,8})'`).exec(src);
    if (!m) problems.push(`${PALETTE}: không đọc được token \`${name}\` ở bản ${theme}`);
    return m?.[1];
  };
  return { dark: grab(dark, 'tối'), light: grab(light, 'sáng') };
};

const lin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const L = (hex) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c) : h.match(/../g);
  const [r, g, b] = n.slice(0, 3).map((x) => parseInt(x, 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const ratio = (a, b) => {
  const [hi, lo] = L(a) > L(b) ? [L(a), L(b)] : [L(b), L(a)];
  return (hi + 0.05) / (lo + 0.05);
};

/* Màu đang chọn: đọc thẳng biểu thức trong nguồn. */
/* `c.` chứ không còn `colors.`: thanh tab nay đọc bảng màu ĐANG BẬT. Neo cũ
   thôi khớp, và chốt "không tìm thấy" ngay dưới đã nổ đúng như nó phải nổ. */
const tintName = /tintColor=\{c\.(\w+)\}/.exec(tabs)?.[1];
if (!tintName) {
  problems.push(`${TABS}: không tìm thấy \`tintColor={colors.…}\` — luật này đang không kiểm gì`);
}
/* Màu chưa chọn mà NGUỒN khai. */
const mutedName = /iconColor=\{\{ default: c\.(\w+) \}\}/.exec(tabs)?.[1];
if (!mutedName) {
  problems.push(`${TABS}: không tìm thấy \`iconColor={{ default: colors.… }}\``);
}

if (!problems.length) {
  const tints = tokens(tintName);
  const muteds = tokens(mutedName);
  for (const theme of ['dark', 'light']) {
    const tint = tints[theme];
    const muted = muteds[theme];
    if (!tint || !muted) continue;
    /*
      Hai ứng viên cho "màu tab chưa chọn":
        · thứ nguồn khai (`iconColor.default`)
        · TRẮNG — thứ máy thật vẽ ra khi khai ấy không có tác dụng
    */
    const against = [
      [`màu nguồn khai (${mutedName} = ${muted})`, muted],
      ['trắng — thứ iOS 26 vẽ ra trên máy thật', '#ffffff'],
    ];
    for (const [what, hex] of against) {
      const r = ratio(tint, hex);
      if (r < FLOOR) {
        problems.push(
          `${TABS}: bản ${theme === 'dark' ? 'TỐI' : 'SÁNG'} — tab đang chọn (${tintName} = ${tint}) ` +
            `chỉ hơn ${what} ${r.toFixed(2)}:1, dưới sàn ${FLOOR}:1, tức nhìn vào thanh tab không biết ` +
            'mình đang ở tab nào',
        );
      }
    }
  }
  {
    const tint = tints.dark;
    const muted = muteds.dark;
    if (!problems.length) {
      const a = ratio(tint, muted).toFixed(2);
      const b = ratio(tint, '#ffffff').toFixed(2);
      const la = ratio(tints.light, muteds.light).toFixed(2);
      const lb = ratio(tints.light, '#ffffff').toFixed(2);
      console.log(
        `màu thanh tab OK — ở CẢ HAI bảng màu. Tab đang chọn là \`${tintName}\`; bản sáng ${la}:1 so với ` +
          `\`${mutedName}\` và ${lb}:1 so với trắng. Bản tối: ${tint}, và nó tách khỏi CẢ HAI màu ` +
          `chưa chọn có thể xảy ra: ${a}:1 so với colors.${mutedName} mà nguồn khai, ${b}:1 so với trắng mà ` +
          'iOS 26 thật sự vẽ ra khi khai ấy không có tác dụng. Luật đòi cả hai vì tôi không kiểm được iOS ' +
          `từ đây — bản đã ship trước đó là foreground trên nền trắng, 1,17:1, và không ai thấy nó suốt ` +
          'nhiều lần chụp màn hình',
      );
    }
  }
}

if (problems.length) {
  console.error('màu thanh tab sai:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

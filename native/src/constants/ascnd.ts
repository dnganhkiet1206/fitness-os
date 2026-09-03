import { Platform } from 'react-native';

import { darkPalette } from '@/constants/palette';

/**
 * ASCND design tokens — a faithful port of the web app's index.css
 * (HSL → hex, dark theme). Colours, radii, glass recipe and type scale
 * match the original so the native app reads as the same product.
 */

/**
 * Bảng màu của app.
 *
 * Giá trị nằm ở `constants/palette.ts` — dữ liệu thuần, không import gì — để
 * `tools/palette.mjs` biên dịch và CHẠY được nó một mình mà đo tương phản trên
 * giá trị thật. Ở đây chỉ còn cái tên mà 1938 chỗ trong app đang gọi.
 *
 * ── và điều đó có hệ quả cho các công cụ ──
 *
 * Một `tools/*.mjs` cần ĐỌC MÃ MÀU phải đọc `palette.ts`, không phải tệp này:
 * ở đây không còn chuỗi hex nào để regex bắt. Ba công cụ đã hỏng đúng vì lý do
 * ấy khi bảng màu dời đi (`resting-aura`, `glass-legibility`, `tab-tint`) và
 * cả ba nay trỏ đúng chỗ. Các công cụ đọc `spacing`, `MACRO_TINT`, `PAGE_TINT`
 * hay `RING_TEXT_MAX_SCALE` thì vẫn đọc tệp này — những thứ ấy không dời.
 */
export const colors = darkPalette;

/**
 * What a session's effort costs you, in colour.
 *
 * Six and seven carry no colour — a set you had four reps left in is not news,
 * and tinting the ordinary case spends the reader's attention on it. The last
 * three are the ones with consequences, and they are the app's own warning ramp
 * rather than three colours picked to look different:
 *
 *   8   two reps left, the edge of productive work        yellow
 *   9   one rep left, close enough to miss the next one   orange
 *   10  nothing left, the set ended because you could not   red
 *
 * Deliberately **not** green-to-red: green would say a light session is good
 * and a hard one is bad, and effort is a prescription rather than a grade.
 *
 * It lives here, beside the palette, because two screens read it — the week's
 * day panel while you are training, and the logged-workout list afterwards —
 * and a list where RPE 6 and RPE 10 look identical is a list you have to read
 * word by word instead of scanning.
 */
export const effortTint = (rpe: number): string =>
  ({ 8: colors.readinessYellow, 9: colors.metricOrange, 10: colors.readinessRed })[rpe] ??
  colors.mutedForeground;

/**
 * Liquid-glass surface recipe (dark) — the web renders cards as a 6%
 * white overlay with a hairline 12% white border and a faint top
 * highlight, over the near-black background. Replicated here without a
 * backdrop blur (nothing sits behind the card but the background, so the
 * blur is visually a no-op).
 */
export const glass = {
  bg: 'rgba(255,255,255,0.06)',
  border: 'rgba(255,255,255,0.12)',
  highlight: 'rgba(255,255,255,0.08)',
  borderWidth: 0.5,
  radius: 20,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  card: 20, // web metric-card padding (p-5)
  stack: 20, // web dashboard gap (space-y-5)
  lg: 24,
  xl: 32,
} as const;

const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });

/**
 * Type scale. Big numbers use a monospace face + tabular figures to match
 * the web's `font-mono` metrics.
 */

export const type = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.4 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  title2: { fontSize: 18, fontWeight: '700' as const, letterSpacing: -0.2 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  footnote: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 11, fontWeight: '500' as const },
  /** Monospace numeric — for big metric read-outs (web `font-mono`). */
  mono: { fontFamily: mono, fontVariant: ['tabular-nums'] as ['tabular-nums'] },
} as const;

/**
 * Trần phóng chữ cho số ĐỌC TRONG MỘT HÌNH.
 *
 * ── vì sao có trần, khi mọi chữ khác thì không ──
 *
 * `<Text>` của React Native mặc định `allowFontScaling` là true, và app này
 * không tắt nó ở đâu cả — nên toàn bộ chữ đã đi theo cỡ chữ hệ thống từ trước,
 * đúng như HIG đòi. Đó là hành vi đúng và không đụng vào.
 *
 * Trừ một chỗ. Con số ở giữa vòng tròn không phải chữ trong một bố cục biết co
 * giãn: nó là một hình vẽ có chữ số bên trong, nằm trong hộp cứng theo ĐƯỜNG
 * KÍNH của vòng. Ở cỡ chữ trợ năng lớn nhất của iOS, số 60 điểm vượt cả lỗ
 * trong của vòng 264 điểm và đè lên chính nét vòng — chữ không to ra thì đọc
 * được hơn, nó chỉ chồng lên đồ hoạ.
 *
 * `tools/type-scale.mjs` đã ghi đúng ngoại lệ này cho sàn 11 điểm: *"numerals
 * drawn inside a shape — graphics with a glyph in them, not text in a layout.
 * Raising those does not improve legibility, it overflows the circle they sit
 * in."* Trần này là cùng một lập luận, nhìn từ đầu kia của thang.
 *
 * 1.6 chứ không phải 1.0: người đặt cỡ chữ lớn VẪN được một con số lớn hơn —
 * 60 thành 96 điểm — chỉ là nó dừng trước khi tràn khỏi hình. Tắt hẳn scale
 * (`allowFontScaling={false}`) mới là thứ bỏ rơi họ, và đó là lý do dùng trần
 * chứ không dùng cờ tắt.
 *
 * CHƯA ĐO trên máy thật: con số 1.6 chọn theo hình học của vòng (lỗ trong
 * ~238 điểm), không theo một lần chụp màn hình ở AX5.
 */
export const RING_TEXT_MAX_SCALE = 1.6;

/**
 * Đường kính vòng tròn ở hero, dùng chung cho mọi trang của deck.
 *
 * Một con số, hai thẻ. Viết riêng ở mỗi file thì hai vòng tròn lệch nhau ngay
 * lần đầu một trong hai được chỉnh, và trên một deck vuốt ngang thì hai vòng
 * khác cỡ đọc ra là hai màn hình khác nhau chứ không phải hai trang của một
 * thứ.
 */
export const HERO_RING = 264;

/**
 * Cặp màu nền của mỗi mặt của app, ở MỘT chỗ.
 *
 * ── vì sao nó ở đây chứ không ở màn hình dùng nó ──
 *
 * Bảng này từng nằm cục bộ trong `(tabs)/index.tsx`, đủ dùng khi chỉ dashboard
 * đổi màu theo thẻ đang vuốt tới. Giờ trang dinh dưỡng phải mang đúng màu của
 * thẻ dinh dưỡng và trang tập luyện mang màu thẻ vận động — nghĩa là cùng một
 * quyết định được đọc ở bốn tệp. Chép nó ra là bảo đảm rằng một ngày nào đó thẻ
 * và trang của cùng một thứ sẽ nói hai màu khác nhau, và không có gì bắt được.
 *
 * ── chọn theo NGHĨA, không theo khẩu vị ──
 *
 * Vận động lấy màu vòng Move, dinh dưỡng lấy màu thẻ của nó, nước lấy xanh
 * dương. Nền và con số không được phép nói hai chuyện khác nhau.
 *
 * `progress` là cặp duy nhất không kề nhau trên vòng màu, và đó là lý do nó
 * được chọn: tiến trình là trang DUY NHẤT nói về tất cả các trang còn lại — nó
 * tổng hợp chứ không đo một thứ — nên một dải quét rộng nhất bảng màu là câu
 * đúng nghĩa. Nó cũng là cặp duy nhất không dùng lại tông ĐẦU của cặp nào khác.
 *
 * Không cặp nào được dùng ba màu trạng thái sẵn sàng làm tông riêng: xanh lá,
 * vàng, đỏ ở app này CÓ NGHĨA là trạng thái sẵn sàng. Dinh dưỡng dùng
 * `readinessGreen` là ngoại lệ có chủ ý và đã có từ trước — đó là màu vòng tròn
 * của chính nó, nên nền và vòng vẫn nói cùng một chuyện.
 */
/**
 * Màu của bốn chất, ở MỘT chỗ.
 *
 * ── vì sao ──
 *
 * Quyết định này từng nằm ở BA nơi: một bảng trong `dashboard-cards.tsx`, một
 * mã màu viết thẳng trong `quick-stats.tsx`, và một bảng nữa trong
 * `food-editor.tsx` — nơi đạm là VÀNG trong khi hai màn kia đã là đỏ hồng.
 *
 * Ba bản sao thì không cái nào sai một mình; chúng chỉ đơn giản không đồng ý với
 * nhau, và người dùng thấy cùng một chất mang hai màu ở hai màn cách nhau một
 * cú chạm.
 *
 * ── chọn màu ──
 *
 * Đạm là đỏ hồng của thịt. Tinh bột vàng cam như bông lúa. Chất béo xanh dương.
 * Chất xơ xanh lá.
 *
 * Không mượn `readinessYellow`/`readinessRed` làm màu chất: ba màu trạng thái
 * sẵn sàng ở app này CÓ NGHĨA, và dùng lại một trong ba cho một chất là để hai
 * chuyện khác nhau nói bằng cùng một màu. `readinessGreen` cho chất xơ là ngoại
 * lệ có sẵn từ trước — nó cũng là màu của chính tab Dinh dưỡng.
 */
export const MACRO_TINT = {
  protein: colors.metricRose,
  carbs: colors.metricOrange,
  fat: colors.metricBlue,
  fiber: colors.readinessGreen,
} as const;

/**
 * Dải màu của thanh tiến độ từng chất.
 *
 * ── vì sao ở đây, cạnh `MACRO_TINT` ──
 *
 * Chặng ĐẦU của mỗi dải phải bằng đúng tint của chất đó — thanh và icon là hai
 * cách vẽ cùng một thứ, và chúng lệch màu thì người dùng đọc ra hai thứ. Viết
 * thẳng mã màu ở chỗ dùng thì đổi `MACRO_TINT` xong thanh vẫn giữ màu cũ, và
 * không có gì báo: cả hai vẫn dựng, chỉ là chúng thôi đồng ý với nhau.
 *
 * Chặng SAU là một quyết định riêng — nó chỉ cần cùng họ với chặng đầu để dải
 * đọc ra là một dải chứ không phải hai màu ghép. Nên nó là một giá trị viết ra,
 * nhưng viết ra Ở ĐÂY, cạnh thứ nó phải hợp.
 */
export const MACRO_BAR = {
  protein: [colors.metricRose, '#ff8095'],
  carbs: [colors.metricOrange, '#ffd93d'],
  fat: [colors.metricBlue, colors.metricCyan],
  fiber: [colors.readinessGreen, '#2f9e6b'],
} as const satisfies Record<string, readonly [string, string]>;

export const PAGE_TINT = {
  activity: [colors.metricOrange, colors.metricPurple],
  nutrition: [colors.readinessGreen, colors.metricOrange],
  water: [colors.metricBlue, colors.metricCyan],
  progress: [colors.metricPurple, colors.metricCyan],
} as const satisfies Record<string, readonly [string, string]>;

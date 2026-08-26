import { Platform } from 'react-native';

/**
 * ASCND design tokens — a faithful port of the web app's index.css
 * (HSL → hex, dark theme). Colours, radii, glass recipe and type scale
 * match the original so the native app reads as the same product.
 */

export const colors = {
  // Core surfaces (dark) — exact from --background/--card/etc.
  background: '#070708',
  card: '#0e0e11',
  secondary: '#18181b',
  muted: '#161618',
  accent: '#1d1d20',
  border: '#2b2b31',
  input: '#303036',

  // Text
  foreground: '#ededed',
  /**
   * Secondary text — captions, units, macro labels, timestamps.
   *
   * Was `#6b6b6b`, which measures 3.39:1 against a card surface (`glass.bg`,
   * 6% white over the page) and 3.78:1 against the page itself. WCAG 2.1 SC
   * 1.4.3 asks 4.5:1 for text at this size, so it failed AA everywhere it was
   * used — and after `foreground` it is the most-used colour in the app.
   *
   * `#828282` is the smallest step that clears it: 4.71:1 on a card, 5.24:1 on
   * the page. The gap to `foreground` (15.45:1) stays wide enough that the two
   * still read as different ranks, which is the job this colour actually has.
   *
   * Measured rather than eyeballed. Eyeballing in a dark room on a good screen
   * is how it arrived at 3.39 in the first place.
   */
  mutedForeground: '#828282',
  /**
   * Secondary text, but on glass over the assistant's aura.
   *
   * `mutedForeground` is measured against a card — a dark, still surface. The
   * two assistant screens do not have one: `LiquidGlass` samples a drifting
   * coloured aura, so the surface under a caption is both brighter and never
   * the same twice.
   *
   * Measured at the worst spot the aura can produce: its brightest pool at
   * peak, the tail of its neighbour, the glass fill, the lit face at its bright
   * corner, and the strongest tint wash on top. `#828282` lands at **2.57:1**
   * there — below even the 3:1 asked of large text, and the failure is not
   * subtle: the label under a metric disappears into its own card.
   *
   * `#c8ccd4` measures 4.9:1 on that surface. It is also already in the app —
   * the `arrow` glyph's own colour — so this adds a role, not a colour.
   *
   * Only for text on `LiquidGlass`. On a card it is too close to `foreground`
   * to read as a second rank, which is the job `mutedForeground` still has
   * everywhere else.
   */
  glassMuted: '#c8ccd4',
  secondaryForeground: '#999999',

  // Brand (premium silver)
  primary: '#a8afbd',
  primaryForeground: '#070708',
  goldLight: '#c7cad1',
  champagne: '#9fa3ad',

  /**
   * ── the signalling colours are neon ──
   *
   * Everything below carries meaning — a state, a metric, a warning — as
   * opposed to the surfaces and text above it, which carry none and are
   * unchanged. Each is the same hue it was, with chroma and luminance pushed
   * up until it reads as emitted light rather than pigment. On a near-black
   * page that is what makes a colour legible at a glance: there is nothing to
   * reflect, so a muted colour has only its own brightness to work with.
   *
   * It happens to fix a real contrast problem. Every one of these went *up*
   * against `background`, and `readinessRed`/`destructive` at 4.20:1 had been
   * under the 4.5:1 that small text wants — the colour the app uses to say
   * something is wrong was the one hardest to read:
   *
   *   green   7.75 → 14.12    blue    5.56 →  7.75
   *   yellow 11.02 → 14.62    purple  4.23 →  5.67
   *   red     4.20 →  5.78    cyan    9.39 → 12.94
   *                           orange  7.29 →  8.96
   *
   * The brand silver (`primary`, `goldLight`, `champagne`) is deliberately
   * left alone. It is an identity, not a signal, and a neon brand colour would
   * compete with every one of these for attention.
   */

  // Semantic
  destructive: '#ff3b5c',

  // Readiness
  readinessGreen: '#2bf5a8',
  readinessYellow: '#ffd93d',
  readinessRed: '#ff3b5c',

  // Metrics
  metricBlue: '#3ba6ff',
  metricPurple: '#b45cff',
  metricCyan: '#22e3ff',
  metricOrange: '#ff9130',
  /**
   * Neon beige — the weight history's line.
   *
   * The only warm colour in the metrics. It is here because the weight chart
   * draws its ambient pool in the line's own colour, and a warm glow reads as
   * light falling on the page while a white one reads as a white shape on it.
   * It is close to the 3000K key in `ambient-light.tsx` (#ffd9b3) on purpose,
   * so the chart agrees with the light the page is already lit by.
   *
   * 16.59:1 on `background` — above the green it replaced (14.12:1), so this
   * is a legibility gain as well as a warmer one.
   */
  metricBeige: '#ffe6bd',
} as const;

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
export const PAGE_TINT = {
  activity: [colors.metricOrange, colors.metricPurple],
  nutrition: [colors.readinessGreen, colors.metricOrange],
  water: [colors.metricBlue, colors.metricCyan],
  progress: [colors.metricPurple, colors.metricCyan],
} as const satisfies Record<string, readonly [string, string]>;

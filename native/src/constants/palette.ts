/**
 * Hai bảng màu của app, dưới dạng DỮ LIỆU THUẦN.
 *
 * ── vì sao tệp này không import gì cả ──
 *
 * `constants/ascnd.ts` import `Platform` từ react-native, và `constants/theme.ts`
 * import `StyleSheet`. Cả hai đều đúng chỗ của chúng — và cả hai khiến bảng màu
 * không thể được BIÊN DỊCH RỒI CHẠY một mình trong một bước kiểm.
 *
 * `tools/palette.mjs` đo tương phản của từng token trên nền của chính theme nó.
 * Phép đo ấy phải chạy trên GIÁ TRỊ THẬT, không phải trên một bản dò bằng regex
 * — một mã màu nằm trong chú thích, hay một token dẫn từ token khác, đều làm
 * phép dò sai mà giá trị thật thì không. Nên bảng màu sống ở đây, sạch mọi
 * import, và mọi thứ khác đọc từ đây.
 *
 * Chiều phụ thuộc là NGƯỢC với thứ tự người ta hay viết: `colors` trong
 * `ascnd.ts` không còn là bản gốc, nó ĐỌC `darkPalette` ở đây. Một bảng, 1938
 * chỗ dùng, không bản sao nào để trôi.
 */

export const darkPalette = {
  // Core surfaces (dark) — exact from --background/--card/etc.
  background: '#070708',
  card: '#0e0e11',
  secondary: '#18181b',
  muted: '#161618',
  accent: '#1d1d20',
  border: '#2b2b31',
  input: '#303036',
  /**
   * Rãnh chưa chạy của MỌI vòng tròn tiến trình.
   *
   * Nó vốn là một hằng số cục bộ trong `readiness-gauge.tsx`, kèm câu "track
   * color used by every web ring" — một lời khẳng định về toàn app viết trong
   * một tệp, nên không gì giữ nó đúng. Đồng hồ nghỉ vẽ rãnh của nó bằng
   * `#1c1c21`, lệch một chút, đủ để hai vòng tròn cạnh nhau trong cùng một app
   * đọc ra là hai thứ khác nhau mà không ai chỉ được ra vì sao.
   *
   * Đưa lên đây thì câu ấy có một chỗ để đúng.
   *
   * ── và giá trị cũ KHÔNG NHÌN THẤY ĐƯỢC ──
   *
   * `#17171c` đo được **1,13:1** so với `background`. Đó không phải "kín đáo",
   * đó là không có. Người dùng gửi ảnh khoanh đúng phần rãnh của hai vòng tròn
   * ở đầu màn Hôm nay: chúng chìm hẳn vào nền.
   *
   * Repo này đã tìm ra điều đó MỘT LẦN rồi và không lan ra: `activity-rings.tsx`
   * đo được 1,01:1 so với thẻ của nó, kết luận "indistinguishable, not subtle",
   * rồi tự đặt một hằng số cục bộ `#3a3a42` cho riêng mình. Ba vòng tròn còn
   * lại không nhận được kết luận ấy — đúng cái mà chú thích ngay trên vừa nói
   * là lý do token này tồn tại.
   *
   * `#3a3a42` cho **1,79:1**: đủ để tìm thấy, còn xa mới tranh được với một
   * vòng đã chạy ở 7:1 trở lên.
   */
  ringTrack: '#3a3a42',

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
   * Đỏ hồng của thịt — màu của protein.
   *
   * KHÔNG dùng `readinessRed` cho việc này dù hai màu gần nhau: xanh lá, vàng
   * và đỏ ở app này CÓ NGHĨA là trạng thái sẵn sàng, nên mượn một trong ba cho
   * một macro là để hai chuyện khác nhau nói bằng cùng một màu.
   *
   * Giá trị lấy đúng con số `quick-stats.tsx` đã dùng cho protein — nó vốn là
   * một mã màu viết thẳng ở đó, tức cùng một quyết định nằm ở hai chỗ. Giờ một
   * chỗ.
   */
  metricRose: '#e6485c',
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

export type PaletteKey = keyof typeof darkPalette;
export type Palette = { readonly [K in PaletteKey]: string };

/** Tên của một bảng — thứ được lưu xuống máy. */
export type ThemeName = 'light' | 'dark';

/**
 * Bản tối: CHÍNH bảng cũ, không sao chép.
 *
 * Chép lại 26 mã màu vào đây là tạo bản thứ hai của một thứ đã có bản gốc, và
 * 124 tệp vẫn đang `import { colors }`. Hai bản sẽ trôi khỏi nhau ở lần sửa
 * đầu tiên, và không có gì báo vì cả hai đều dựng được.
 */


/**
 * Bản sáng: giấy ấm, không phải trắng thuần.
 *
 * ── các bề mặt ──
 *
 * Bản tối xếp bề mặt theo chiều SÁNG DẦN khi tiến ra trước: nền #070708 →
 * thẻ #0e0e11 → chip #18181b. Bản sáng giữ đúng nguyên tắc "tiến ra trước thì
 * sáng hơn", nên nó lật thành: nền là giấy ấm #f7f4ef, còn thẻ là TRẮNG. Thẻ
 * nổi lên khỏi trang thay vì lún xuống.
 *
 * Ấm chứ không trung tính, vì bạc là màu nhận diện của ASCND. Bạc trên trắng
 * thuần đọc ra là xám xịt; trên giấy ấm nó đọc ra là kim loại.
 *
 * ── hành động chính lật hẳn ──
 *
 * Bản tối: `primary` là BẠC SÁNG, chữ trên nó là màu nền tối. Bản sáng đảo
 * đúng cặp ấy — `primary` thành gần-đen ấm, chữ trên nó thành trắng. Một nút
 * bạc trên giấy trắng thì không phải một nút; nó là một vệt mờ.
 *
 * ── và champagne với goldLight KHÔNG được rơi vào cùng một xám ──
 *
 * Hạ máy móc cả hai thì chúng ra #6c6f79 và #6d6f76: hai token nhận diện thành
 * một màu. `tools/resting-aura.mjs` liệt chúng cạnh nhau như hai bậc của cùng
 * một dải bạc, nên gộp chúng là làm mất một bậc. Champagne giữ THÉP lạnh (đúng
 * lập luận `icon-tint.ts` đã ghi cho cái tạ: "thép xám lạnh bất kể cái tên gợi
 * ra gì"), còn goldLight lấy ĐỒNG ấm — cái tên của nó nói vàng, và trên giấy
 * thì đồng là thứ đọc được, khác hẳn thép.
 */
export const lightPalette: Palette = {
  /* ── bề mặt: giấy ấm, thẻ trắng nổi lên ── */
  background: '#f7f4ef',
  card: '#ffffff',
  secondary: '#efeae1',
  muted: '#f2eee7',
  accent: '#e9e3d8',
  border: '#dcd5c8',
  input: '#f4f0e8',
  /*
    Bản sáng có ĐÚNG cùng một lỗi, và nó không lộ ra cho tới khi có người nhìn
    hai bản cạnh nhau: `#e6e0d4` chỉ hơn nền `#f7f4ef` **1,20:1**.

    `#c4bcac` cho **1,72:1** — khớp với 1,79:1 của bản tối, nên một cái vòng
    đọc ra giống nhau ở hai bản thay vì đậm ở bản này và mất tích ở bản kia.
    Vẫn nằm trong họ màu ấm của bảng sáng (sắc ~40°), không phải một màu xám
    trung tính lạc vào.
  */
  ringTrack: '#c4bcac',

  /* ── chữ: cùng THỨ TỰ prominence như bản tối ──
     tối:  foreground 16,5:1 > secondaryForeground 6,8:1 > mutedForeground 5,0:1
     sáng: foreground 17,6:1 > secondaryForeground 7,8:1 > mutedForeground 5,8:1
     Thứ tự ấy là thứ mắt đã học ở bản tối; đảo nó là bắt học lại. */
  foreground: '#1a1917',
  mutedForeground: '#6b6559',
  secondaryForeground: '#57524a',
  /** chữ mờ TRÊN KÍNH sáng — 6,9:1 trên mặt kính #fbf9f5 */
  glassMuted: '#5c564b',

  /* ── hành động chính: nút gần-đen, chữ trắng (17,6:1) ── */
  primary: '#1a1917',
  primaryForeground: '#ffffff',

  /* ── nhận diện: thép lạnh và đồng ấm, hai bậc khác nhau ── */
  champagne: '#6c6f79',
  goldLight: '#7d6733',

  /* ── tín hiệu: dẫn ra từ bản tối bằng OKLCH, đều ≥4,5:1 trên CẢ nền và thẻ ── */
  destructive: '#de0143',
  readinessGreen: '#177e55',
  readinessYellow: '#846e0b',
  readinessRed: '#de0143',
  metricBlue: '#0073bf',
  metricPurple: '#9b40e3',
  metricCyan: '#027b8b',
  metricOrange: '#ac5b04',
  metricRose: '#d0324b',
  /** chỉ là ĐỒ HOẠ (đường cân nặng), nên ngưỡng của nó là 3:1 — đo được 3,03 */
  metricBeige: '#a08a63',
};

export const palettes: Record<ThemeName, Palette> = { light: lightPalette, dark: darkPalette };

/** Tên theme của một bảng màu — khoá để tra chất liệu đi cùng nó. */
export function themeOf(c: Palette): ThemeName {
  return c === lightPalette ? 'light' : 'dark';
}

/**
 * Chất liệu của thẻ — và đây là chỗ hai theme KHÁC NHAU về bản chất, không về màu.
 *
 * ── vì sao không phải một phép đổi mã màu ──
 *
 * `glass-card.tsx` ghi lại mô hình của bản tối: mặt sáng ở góc trên-trái, tối
 * dần xuống góc dưới-phải, theo hướng đèn chính mà `AmbientLight` đặt ngay
 * ngoài góc trên-trái trang. Nó là một tấm KÍNH bắt ánh sáng.
 *
 * Và nó nói thẳng vì sao không có bóng đổ: *"RN renders shadows on dark as a
 * hard halo rather than a soft falloff. The depth comes from the gradient, the
 * hairline border and the bright top edge."*
 *
 * Trên giấy thì cả ba câu ấy đảo chiều. Một lớp phủ trắng 6% trên #f7f4ef là
 * không có gì. Một dải sáng-tối 8% trên giấy trắng là một vệt bẩn. Còn bóng đổ
 * — thứ bản tối phải bỏ — lại đọc ĐÚNG trên nền sáng, vì đó là cách một tờ giấy
 * thật nổi lên khỏi tờ giấy dưới nó.
 *
 * Nên chất liệu sáng là: mặt TRẮNG ĐỤC, một viền tơ ấm, và một bóng thấp mềm.
 * Không gradient, không mép sáng trên. Nó là giấy, không phải kính — và cái tên
 * `glass` ở lại chỉ vì 53 tệp đang gọi nó, không vì nó còn đúng nghĩa ở đây.
 *
 * `elevation` là cho Android; `shadow*` là cho iOS. Cả hai phải có, và cả hai
 * chỉ dùng ở bản sáng: đặt `shadowOpacity` khác 0 trên bản tối là đem lại đúng
 * cái vành sáng mà chú thích kia đã bỏ nó đi.
 */
/**
 * Bề mặt CON — ô macro, đĩa chữ cái, nhóm danh sách, rãnh thanh tiến độ.
 *
 * ── vì sao nó phải là một vai riêng, chứ không dùng lại mặt thẻ ──
 *
 * Ở bản tối, một lớp phủ trắng 6% làm được CẢ HAI việc: đặt trên trang #070708
 * nó là một cái thẻ, đặt trên thẻ #0e0e11 nó là một ô con. Lớp phủ trong suốt
 * cộng dồn, nên cùng một công thức đọc ra "cao hơn một bậc" ở bất kỳ bậc nào.
 * Đó là lý do MỘT hằng số `glass` từng phục vụ được 25 tệp.
 *
 * Trên giấy thì không. Mặt thẻ là `#ffffff` ĐỤC, nên một ô con tô cũng `#ffffff`
 * nằm trong thẻ là vô hình — trắng trên trắng. Ô con phải đi XUỐNG khỏi trắng,
 * trong khi thẻ đi LÊN khỏi giấy. Hai hướng ngược nhau, nên hai vai.
 *
 * ── và cái vẽ ra ô là VIỀN, không phải nền ──
 *
 * `today-widgets-2.tsx` đã đo và ghi lại đúng câu ấy cho bản tối: nền ô đo được
 * 1,015 trên mặt thẻ và không cách nào cứu được, còn viền lên 1,46. Nguyên tắc
 * ấy chuyển sang giấy nguyên vẹn — viền tơ ấm làm việc, nền chỉ là một bậc nhẹ.
 *
 * Giá trị bản tối là BẢN SAO NGUYÊN VĂN của `glass` cũ, nên bản tối không đổi
 * một điểm ảnh nào. Giá trị bản sáng dẫn từ chính bảng màu sáng, không phải mã
 * màu mới bịa ra.
 */
export interface Inset {
  bg: string;
  border: string;
  borderWidth: number;
}

/**
 * Bề mặt trên một nền ĐANG CHUYỂN ĐỘNG — hai màn hình trợ lý, xem `liquid-glass.tsx`.
 *
 * Ở đó nền không phải một màu phẳng mà là bốn vũng màu trôi, nên bề mặt phải
 * làm hai việc mà thẻ thường không phải làm: giữ được MÉP của mình khi vũng
 * dưới nó tối/sáng bất thường, và giữ chữ ĐỌC ĐƯỢC khi màu trôi qua.
 *
 * Cả hai giá trị bản tối là bản chép nguyên văn của thứ đang chạy. Bản sáng
 * dẫn từ token bằng đúng độ mờ ấy — `alpha(card, 0.62)` — chứ không phải một
 * độ mờ mới chọn: đổi con số cùng lúc với đổi màu là hai thay đổi trong một, và
 * chỉ một trong hai được yêu cầu ở giai đoạn này.
 */
export interface Aura {
  /** một sợi màu DƯỚI lớp blur, để tấm không mất mép trên một vũng cực đoan */
  hair: string;
  /** nền đục giữ chữ đọc được khi vũng màu trôi qua dưới nó */
  base: string;
  /** `tint` của `BlurView` — vật liệu hệ thống, không phải một màu của app */
  blurTint: 'light' | 'dark';
  /**
   * Màu của lớp LÀM DỊU phủ lên hào quang và lên dải đầu trang.
   *
   * Bản tối làm dịu bằng ĐEN — thêm bóng vào một phòng tối. Trên giấy, đen là
   * một vệt xám bẩn: thứ làm dịu một trang giấy là chính màu giấy, chồng thêm
   * lên. Cùng vai, ngược vật liệu, đúng như bóng đổ và mép sáng.
   */
  scrim: string;
}

export interface Material {
  /** mặt thẻ — trong suốt ở bản tối (kính), đục ở bản sáng (giấy) */
  bg: string;
  border: string;
  /** mép sáng trong ở đỉnh thẻ; `null` ở bản sáng vì giấy không phát sáng */
  highlight: string | null;
  /** có vẽ mặt gradient chéo hay không */
  lit: boolean;
  borderWidth: number;
  radius: number;
  /**
   * Màu mà một LỚP PHỦ MỜ được làm bằng.
   *
   * ── vì sao không phải `foreground` ──
   *
   * 101 chỗ trong app viết `rgba(255,255,255,0.3)` cho một dòng chữ mờ, một
   * viền nhạt, một nền chip. Trên giấy chúng là trắng trên trắng: không nhìn
   * thấy gì, và không có lỗi nào báo.
   *
   * Phép sửa hiển nhiên là `alpha(c.foreground, 0.3)`. Nhưng `foreground` của
   * bản tối là `#ededed`, không phải `#ffffff` — nên phép ấy đổi bản tối ở cả
   * 101 chỗ. Chênh 7% độ sáng ở độ mờ 30% thì mắt không thấy, nhưng "chắc là
   * không ai thấy" không phải một lời bảo đảm, và giai đoạn này hứa bản tối
   * không đổi MỘT ký tự nào.
   *
   * Nên đây là một vai riêng: mực thuần của theme. Bản tối `#ffffff` — đúng
   * chữ đang chạy — và bản sáng là mực của giấy.
   */
  ink: string;
  /** bề mặt con — xem `Inset` */
  inset: Inset;
  /** bề mặt trên nền động — xem `Aura` */
  aura: Aura;
  shadow: {
    shadowColor: string;
    shadowOpacity: number;
    shadowRadius: number;
    shadowOffset: { width: number; height: number };
    elevation: number;
  };
}

const NO_SHADOW = {
  shadowColor: 'transparent',
  shadowOpacity: 0,
  shadowRadius: 0,
  shadowOffset: { width: 0, height: 0 },
  elevation: 0,
} as const;

export const materials: Record<ThemeName, Material> = {
  dark: {
    bg: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.12)',
    highlight: 'rgba(255,255,255,0.08)',
    lit: true,
    borderWidth: 0.5,
    radius: 20,
    ink: '#ffffff',
    /* Đúng ba giá trị của hằng `glass` cũ, chép nguyên văn. Ở bản tối một lớp
       phủ trong suốt cộng dồn, nên mặt thẻ và ô con dùng chung được một công
       thức — và chúng PHẢI tiếp tục dùng chung, nếu không bản tối đổi. */
    inset: {
      bg: 'rgba(255,255,255,0.06)',
      border: 'rgba(255,255,255,0.12)',
      borderWidth: 0.5,
    },
    /* Ba giá trị đang chạy, chép nguyên văn khỏi `liquid-glass.tsx`. */
    aura: {
      hair: 'rgba(255,255,255,0.035)',
      base: 'rgba(13,13,18,0.62)',
      blurTint: 'dark',
      /* `#000` nguyên văn — hai chỗ dùng nó đều viết `rgba(0,0,0,…)`/`"#000"`. */
      scrim: '#000000',
    },
    shadow: NO_SHADOW,
  },
  light: {
    bg: '#ffffff',
    /* Viền tơ lấy từ mực chữ, không phải một xám trung tính: trên giấy ấm, một
       viền xám lạnh đọc ra là bẩn. 8% là đủ để có mép mà chưa thành một cái
       khung. */
    border: 'rgba(26,25,23,0.08)',
    highlight: null,
    lit: false,
    /* Nét tơ. `StyleSheet.hairlineWidth` là 1/scale của máy (0,333 trên 3x) và
       tệp này cố ý không import react-native, nên con số được viết ra —
       `tools/palette.mjs` kiểm nó khớp với thứ RN trả về trên 2x và 3x. */
    borderWidth: 1 / 3,
    ink: lightPalette.foreground,
    /* Ô con đi XUỐNG khỏi mặt thẻ trắng, ngược hướng với thẻ đi lên khỏi giấy.
       Cả hai giá trị DẪN từ bảng màu sáng chứ không phải mã màu mới: `secondary`
       cách mặt thẻ 1,20 và cách trang 1,09, còn `border` cách mặt thẻ 1,46 —
       đúng con số mà bản tối đã đo được cho viền và gọi là đủ. */
    inset: {
      bg: lightPalette.secondary,
      border: lightPalette.border,
      borderWidth: 1 / 3,
    },
    /* Sợi MỰC thay cho sợi trắng: trên giấy, một sợi trắng dưới lớp blur không
       vẽ ra mép nào. Cùng độ mờ 0,035, đổi hướng chứ không đổi lượng. */
    aura: {
      hair: alpha(lightPalette.foreground, 0.035),
      base: alpha(lightPalette.card, 0.62),
      blurTint: 'light',
      scrim: lightPalette.background,
    },
    radius: 20,
    /* Thấp và mềm: lệch 1 điểm, toả 8. Thẻ nằm TRÊN trang, không bay phía trên
       nó — một bóng cao biến mọi thẻ thành một hộp nổi và trang thành một cái
       kệ. Màu bóng là mực chữ chứ không phải đen thuần, cùng lý do như viền. */
    shadow: {
      shadowColor: '#1a1917',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 1 },
      elevation: 2,
    },
  },
};

/**
 * Một token ở độ mờ nào đó.
 *
 * ── vì sao cần nó, và nó thay được bao nhiêu ──
 *
 * Trong 596 mã màu viết thẳng của app, rất nhiều là chính một token ở một độ
 * mờ: `'rgba(255,59,92,0.35)'` là viền nút đăng xuất, và 255,59,92 đúng bằng
 * `destructive` của bản tối. Chuỗi ấy là một BẢN CHÉP — nó không đổi khi bảng
 * màu đổi, nên ở bản sáng nó vẫn là đỏ neon của nền đen.
 *
 * React Native không tính toán màu trong style, nên phép nhân alpha phải xảy ra
 * ở JavaScript. Hàm này làm đúng một việc ấy và không hơn.
 *
 * Chỉ nhận `#rgb`/`#rrggbb`: một token đã có alpha rồi mà bị nhân thêm lần nữa
 * là hai độ mờ nhân nhau, và kết quả sẽ trông "gần đúng" ở một theme rồi sai ở
 * theme kia — đúng loại lỗi không ai nhìn ra. Nên nó NÉM chứ không đoán.
 */
export function alpha(token: string, a: number): string {
  const h = token.trim();
  const short = /^#([0-9a-fA-F]{3})$/.exec(h);
  const full = /^#([0-9a-fA-F]{6})$/.exec(h);
  if (!short && !full) throw new Error(`alpha() cần #rgb hoặc #rrggbb, nhận "${token}"`);
  const hx = short ? short[1].split('').map((d) => d + d).join('') : (full as RegExpExecArray)[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hx.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${a})`;
}

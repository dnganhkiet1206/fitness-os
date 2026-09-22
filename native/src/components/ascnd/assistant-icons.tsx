import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { type PaletteKey } from '@/constants/palette';
import { type Palette } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';

/**
 * The assistant screen's own glyphs.
 *
 * ── why these are not `lucide` ──
 *
 * Lucide is a uniform 2pt outline set, and an outline has almost no surface.
 * On this screen every icon sits on glass and is supposed to *light* the panel
 * it sits on — a hairline stroke has nothing for that light to come from, so
 * the tint under it reads as a coloured smudge with an unrelated wire drawing
 * on top.
 *
 * These are solid, and each one carries a two-stop gradient running the same
 * way as the room's key light: bright at the upper left, saturated toward the
 * lower right. That is the same diagonal `GlassCard` lights its face along, so
 * an icon and the card under it agree about where the light is.
 *
 * ── the shapes are drawn, not traced ──
 *
 * Every path here is written by hand on a 24 grid. Three of them were wrong the
 * first time and the render caught them: `spark`'s second star landed outside
 * its own bounds, and the gear was unusable enough that it became the sliders
 * glyph the reference actually uses. The sliders' knobs are solid discs rather
 * than rings, because a ring drawn with `evenodd` over the bar it sits on turns
 * the overlap into a hole — the bar showed *through* the knob.
 */

export type GlyphName =
  | 'heart'
  | 'moon'
  | 'flame'
  | 'bolt'
  | 'leaf'
  | 'pulse'
  | 'spark'
  | 'gauge'
  | 'sliders'
  | 'arrow'
  | 'camera'
  | 'calendar'
  | 'home'
  /* the coach's own six, added when the chat took the assistant's material */
  | 'chevron'
  | 'plus'
  | 'clock'
  | 'trash'
  | 'user'
  | 'alert'
  | 'dumbbell';

const disc = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const bar = (y: number) =>
  `M4.1 ${y - 1.15}h15.8a1.15 1.15 0 0 1 0 2.3H4.1a1.15 1.15 0 0 1 0-2.3Z`;

const PATHS: Record<GlyphName, string> = {
  heart:
    'M12 21.2C12 21.2 2.8 14.6 2.8 8.9 2.8 6.1 5 3.9 7.8 3.9c1.8 0 3.3 1 4.2 2.3.9-1.4 2.4-2.3 4.2-2.3 2.8 0 5 2.2 5 5 0 5.7-9.2 12.3-9.2 12.3Z',
  moon: 'M21 14.7A9.1 9.1 0 0 1 9.3 3a9.1 9.1 0 1 0 11.7 11.7Z',
  flame:
    'M12 22.3c4 0 7.2-2.9 7.2-6.7 0-4.8-4.4-6.6-5.4-11.9-.1-.7-.9-.9-1.3-.4-2.3 2.2-3.8 4.8-3.8 7 0 .9.2 1.8.5 2.5-1-.3-1.9-1.1-2.3-2.2-.2-.5-.9-.6-1.3-.1a8.2 8.2 0 0 0-1.8 5.1c0 3.8 3.2 6.7 7.2 6.7Z',
  bolt: 'M13.6 1.9 5.4 13.5c-.35.5 0 1.2.65 1.2h4.2l-1 7.3c-.1.75.9 1.1 1.3.5l8.2-11.6c.35-.5 0-1.2-.65-1.2h-4.2l1-7.3c.1-.75-.9-1.1-1.3-.5Z',
  leaf: 'M21.3 2.9c-10.2 0-16 4.6-16 11.4 0 1.6.35 3 1 4.2l-2.6 2.6a1.1 1.1 0 0 0 1.55 1.55l2.6-2.6c1.2.65 2.6 1 4.2 1 6.8 0 9.6-5.8 9.6-16 0-1.2-.15-2.15-.35-2.15Z',
  pulse:
    'M2.9 12.9a1.15 1.15 0 0 1 0-2.3h3.4l2.6-6.4c.4-1 1.85-.95 2.2.07l3.5 10.4 1.75-3.9c.2-.42.6-.68 1.05-.68h3.7a1.15 1.15 0 0 1 0 2.3h-3l-2.7 6c-.42.95-1.8.9-2.15-.08L9.75 8.2l-1.6 3.95c-.18.44-.6.73-1.07.73Z',
  spark:
    'M10.2 2.2c.42 0 .78.28.9.68l1.15 3.75 3.75 1.15a.94.94 0 0 1 0 1.8l-3.75 1.15-1.15 3.75a.94.94 0 0 1-1.8 0L8.15 10.73 4.4 9.58a.94.94 0 0 1 0-1.8l3.75-1.15L9.3 2.88c.12-.4.48-.68.9-.68ZM17.8 13.4c.34 0 .64.23.74.55l.52 1.6 1.6.52a.78.78 0 0 1 0 1.48l-1.6.52-.52 1.6a.78.78 0 0 1-1.48 0l-.52-1.6-1.6-.52a.78.78 0 0 1 0-1.48l1.6-.52.52-1.6c.1-.32.4-.55.74-.55Z',
  gauge:
    'M12 3.2A9.6 9.6 0 0 0 3.4 17.1a1.4 1.4 0 0 0 2.5-1.3 6.8 6.8 0 1 1 12.2 0 1.4 1.4 0 0 0 2.5 1.3A9.6 9.6 0 0 0 12 3.2Zm3.6 4.6-4.5 3.3a2 2 0 1 0 2.1 2.1l3.3-4.5a.6.6 0 0 0-.9-.9Z',
  sliders:
    bar(6.4) + bar(12) + bar(17.6) + disc(15.2, 6.4, 3.05) + disc(8.4, 12, 3.05) + disc(16.4, 17.6, 3.05),
  /* Body plus a lens punched through it. The lens is a second subpath and the
     glyph is drawn `evenodd`, so the hole shows the card's glass rather than a
     disc of some background colour that would only be right on one screen. */
  camera:
    'M4.4 6.5h3.05l1.1-1.95c.3-.53.87-.85 1.48-.85h4.24c.61 0 1.18.32 1.48.85l1.1 1.95H19.6A2.4 2.4 0 0 1 22 8.9v8.7a2.4 2.4 0 0 1-2.4 2.4H4.4A2.4 2.4 0 0 1 2 17.6V8.9a2.4 2.4 0 0 1 2.4-2.4ZM8.6 13.4a3.4 3.4 0 1 0 6.8 0 3.4 3.4 0 1 0-6.8 0Z',
  /* A rounded page with its header ruled off, and no hanger rings — the same
     shape SF Symbols' own `calendar` draws, for the same reason: at 19pt two
     2pt posts above the body are three grey pixels, and what they add is
     noise rather than "calendar".

     The rule is a second subpath under `evenodd`, so it shows the tile's glass
     rather than a colour that would only be right on one surface — the trick
     `camera` and `alert` already use. It runs the full width on purpose: a
     slot that stops short of both edges reads as a dash floating on a card. */
  calendar:
    'M5.9 3.9H18.1a3 3 0 0 1 3 3V18.1a3 3 0 0 1-3 3H5.9a3 3 0 0 1-3-3V6.9a3 3 0 0 1 3-3Z' +
    'M2.9 9.2H21.1V11H2.9Z',
  home:
    'M11.06 2.98a1.5 1.5 0 0 1 1.88 0l7.5 6.02c.36.28.56.71.56 1.17V19.2a2.4 2.4 0 0 1-2.4 2.4h-3.7v-5.5a1.2 1.2 0 0 0-1.2-1.2h-3.4a1.2 1.2 0 0 0-1.2 1.2v5.5H5.4A2.4 2.4 0 0 1 3 19.2v-9.03c0-.46.2-.89.56-1.17Z',
  arrow:
    'M12 3.4c.3 0 .6.12.82.34l6.3 6.3a1.16 1.16 0 0 1-1.64 1.64L13.16 7.4V19.4a1.16 1.16 0 0 1-2.32 0V7.4l-4.32 4.28A1.16 1.16 0 0 1 4.88 10l6.3-6.26c.22-.22.52-.34.82-.34Z',
  chevron:
    'M15.9 2.66a1.25 1.25 0 0 1 0 1.77L8.33 12l7.57 7.57a1.25 1.25 0 0 1-1.77 1.77l-8.45-8.45a1.25 1.25 0 0 1 0-1.77l8.45-8.45a1.25 1.25 0 0 1 1.77 0Z',
  plus:
    'M10.75 3.6a1.25 1.25 0 0 1 2.5 0v7.15h7.15a1.25 1.25 0 0 1 0 2.5h-7.15v7.15a1.25 1.25 0 0 1-2.5 0v-7.15H3.6a1.25 1.25 0 0 1 0-2.5h7.15Z',
  /* Ring plus hands, drawn `evenodd`. The hands sit inside the ring's hole, so
     the rule that empties the dial fills them back in — two overlapping
     "holes" is an odd number of crossings. Cheaper than a third subpath and it
     keeps the hands the colour of the ring rather than of whatever is behind. */
  clock:
    'M12 2.8a9.2 9.2 0 1 0 0 18.4a9.2 9.2 0 1 0 0-18.4ZM12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14Z' +
    'M11 6.9a1.1 1.1 0 0 1 2.2 0v4.65l3.2 1.85a1.1 1.1 0 0 1-1.1 1.9l-3.75-2.16a1.1 1.1 0 0 1-.55-.95Z',
  trash:
    'M8.2 4.5V3.6a1.2 1.2 0 0 1 1.2-1.2h5.2a1.2 1.2 0 0 1 1.2 1.2v.9h3.6a1.1 1.1 0 0 1 0 2.2H4.6a1.1 1.1 0 0 1 0-2.2Z' +
    'M6.2 8.4h11.6l-.85 11.3a2.2 2.2 0 0 1-2.2 2.05h-5.5a2.2 2.2 0 0 1-2.2-2.05Z',
  user:
    'M12 3.2a4.4 4.4 0 1 0 0 8.8a4.4 4.4 0 1 0 0-8.8Z' +
    'M12 13.6c-4.4 0-8 2.6-8 5.8 0 .9.7 1.4 1.6 1.4h12.8c.9 0 1.6-.5 1.6-1.4 0-3.2-3.6-5.8-8-5.8Z',
  /* Triangle with the bar and dot punched out, same `evenodd` trick as
     `camera`: the holes show the glass rather than a colour that would only be
     right on one surface. */
  alert:
    'M12 2.9c.78 0 1.5.42 1.89 1.1l8.4 14.6A2.18 2.18 0 0 1 20.4 21.9H3.6a2.18 2.18 0 0 1-1.89-3.3l8.4-14.6A2.18 2.18 0 0 1 12 2.9Z' +
    'M12 7.8a1.15 1.15 0 0 0-1.15 1.2l.3 4.9a.85.85 0 0 0 1.7 0l.3-4.9A1.15 1.15 0 0 0 12 7.8Z' +
    'M12 16.4a1.3 1.3 0 1 0 0 2.6a1.3 1.3 0 1 0 0-2.6Z',
  /* Two plates a side and a bar between them.
     Drawn rather than borrowed because the set had no training mark at all:
     `pulse` is training *load*, which is a different idea, and the exercise
     library wanted something literal. Five rounded rectangles, unioned — the
     overlap between bar and inner plates is deliberate and `nonzero` fill
     resolves it into one solid shape. */
  dumbbell:
    'M2.7 8.6H3.1A1.1 1.1 0 0 1 4.2 9.7V14.3A1.1 1.1 0 0 1 3.1 15.4H2.7A1.1 1.1 0 0 1 1.6 14.3V9.7A1.1 1.1 0 0 1 2.7 8.6ZM6.2 6H6.6A1.3 1.3 0 0 1 7.9 7.3V16.7A1.3 1.3 0 0 1 6.6 18H6.2A1.3 1.3 0 0 1 4.9 16.7V7.3A1.3 1.3 0 0 1 6.2 6ZM8.6 10.7H15.4A1.2 1.2 0 0 1 16.6 11.9V12.1A1.2 1.2 0 0 1 15.4 13.3H8.6A1.2 1.2 0 0 1 7.4 12.1V11.9A1.2 1.2 0 0 1 8.6 10.7ZM17.4 6H17.8A1.3 1.3 0 0 1 19.1 7.3V16.7A1.3 1.3 0 0 1 17.8 18H17.4A1.3 1.3 0 0 1 16.1 16.7V7.3A1.3 1.3 0 0 1 17.4 6ZM20.9 8.6H21.3A1.1 1.1 0 0 1 22.4 9.7V14.3A1.1 1.1 0 0 1 21.3 15.4H20.9A1.1 1.1 0 0 1 19.8 14.3V9.7A1.1 1.1 0 0 1 20.9 8.6Z',
};

/**
 * Màu NHẬN DIỆN của từng glyph — một KHOÁ bảng màu, không phải một mã màu.
 *
 * ── vì sao nó từng là mã màu, và vì sao điều đó hỏng ──
 *
 * Bảng này vốn giữ hai mã màu cho mỗi glyph, và chú thích cũ của nó nói đúng ý
 * định: *"these are the app's own palette entries rather than free choices — a
 * tile tinted a colour that appears nowhere else would be a fifth accent nobody
 * agreed to."* Đo ngược lại thì ý ấy là thật: **18 trong 20** màu nhận diện
 * trùng KHÍT một token của bản TỐI. Chúng chỉ bị gõ ra thành giá trị thay vì
 * gọi tên — nên cả bảng chỉ biết một theme.
 *
 * Đây là bảng tint THỨ TÁM; bảy bảng kia đã chuyển sang khoá từ đợt GĐ1, và
 * chú thích của `icon-tint.ts` kể lại đúng cái giá: *"trên giấy icon món ăn vẫn
 * là xanh neon #2bf5a8, đo được 1,43:1 trên mặt thẻ trắng"*.
 *
 * Trên kính trắng của Health Assistant, đo cả bảng: **16/20 glyph dưới sàn 3:1**
 * của WCAG 1.4.11, và đầu NHẠT của gradient nằm ở 1,00–1,55 — `arrow`,
 * `chevron`, `plus` bắt đầu từ đúng `#ffffff` trên một mặt trắng.
 *
 * `liquid-glass.tsx` đã ghi lại một nửa lỗi này và chữa nửa ấy bằng cách TẮT
 * lớp wash trên giấy. Câu kết của nó nói rõ nửa còn lại được cố ý để nguyên:
 * *"Màu giữ nguyên vai của nó ở những dấu nhỏ — ô tròn sau glyph, viền của tấm
 * đang chọn, chấm trạng thái."* Nửa ấy là nửa này.
 *
 * Bản TỐI không đổi một điểm ảnh nào: mỗi khoá dưới đây trả về đúng mã màu cũ.
 */
export const GLYPH_TINT: Record<GlyphName, PaletteKey> = {
  heart: 'readinessRed',
  moon: 'metricViolet',
  flame: 'metricOrange',
  bolt: 'readinessYellow',
  leaf: 'readinessGreen',
  pulse: 'metricBlue',
  spark: 'metricPurple',
  gauge: 'readinessGreen',
  sliders: 'primary',
  arrow: 'glassMuted',
  camera: 'metricOrange',
  calendar: 'metricCyan',
  home: 'primary',
  chevron: 'glassMuted',
  plus: 'glassMuted',
  clock: 'primary',
  /*
    Red, alone among the chrome glyphs. Deleting a conversation is the one
    irreversible thing on that screen and the only one worth colouring.

    `destructive`, không phải `readinessRed`. Hai khoá ấy TRÙNG giá trị ở cả hai
    diện mạo cho tới 22/09 (#ff3b5c tối · #de0b44 sáng), nên không ai phải chọn
    — và vì thế cái thùng rác vô tình đọc màu qua khoá của một TRẠNG THÁI SẴN
    SÀNG. Khi bộ ba ấy được chỉnh cho ngang hàng, `readinessRed` mềm đi một bậc
    và kéo theo cái thùng rác, dù không ai định làm cho việc xoá bớt dứt khoát.

    Nay nó đọc khoá nói đúng điều nó làm. Màu vẽ ra KHÔNG đổi một điểm ảnh so
    với trước 22/09, ở cả hai diện mạo — `destructive` giữ nguyên hai giá trị ấy.
  */
  trash: 'destructive',
  user: 'primary',
  /*
    Cam cảnh báo, không phải vàng sẵn sàng và cũng không phải đỏ phá huỷ.

    Glyph này dựng ở đúng hai chỗ, và cả hai đều là một LƯU Ý chứ không phải
    một lỗi: dòng miễn trừ y tế của AI Coach (*"AI chỉ hỗ trợ nhắc nhở thói
    quen, không chẩn đoán"*) và dòng *"Chưa đọc được hôm nay. Chạm để thử lại."*
    Không chỗ nào có gì hỏng, và không chỗ nào có gì bị xoá.

    Nó từng mượn `readinessYellow` — tức trôi theo trạng thái sẵn sàng của
    người dùng, một đại lượng chẳng liên quan gì tới nó. `metricOrange` tách nó
    ra mà vẫn giữ đúng nghĩa cảnh báo, và nó dùng chung tông với `flame` và
    `camera`, hai glyph đã đọc khoá ấy.
  */
  alert: 'metricOrange',
  /* Steel. Nothing else in the set owns a cool grey-blue, and it is what the
     object is made of — the one glyph here where the literal reading is also
     the distinctive one. */
  dumbbell: 'metricSteel',
};

/**
 * Đầu NHẠT của gradient — CHỈ tồn tại ở bản tối.
 *
 * ── vì sao bản sáng không có đầu nhạt, và đó không phải bỏ bớt ──
 *
 * Trong phòng tối, một điểm dừng nhạt hơn màu nhận diện đọc ra là ÁNH SÁNG rọi
 * lên glyph. Trên kính TRẮNG thì không có chỗ cho nó: nhạt hơn màu nhận diện
 * nghĩa là gần mặt kính hơn, và đó chính xác là con số đã đo — 1,00 cho
 * `arrow`, `chevron`, `plus`, vì chúng bắt đầu từ đúng `#ffffff`.
 *
 * Vế đối của một ánh sáng trên giấy là một cái BÓNG, tức đầu kia phải ĐẬM hơn
 * chứ không nhạt hơn. Đó là một quyết định thiết kế chưa ai đặt ra, và bịa ra
 * hai mươi sắc đậm ở đây là dựng một bảng màu thứ hai — đúng thứ vừa gỡ đi.
 *
 * Nên trên giấy glyph tô PHẲNG bằng chính màu nhận diện của nó: một màu, đã có
 * token, đã đo, và tương phản tối thiểu của cả hình bằng đúng tương phản của
 * token ấy. `liquid-glass.tsx` đã rút ra cùng một kết luận cho lớp wash và ghi
 * lại bằng câu của nó: *"Chữa bằng cách TẮT, không phải hạ độ mờ: hướng đã sai
 * thì mờ hơn vẫn sai."*
 *
 * Bảng này ĐÓNG BĂNG: nó chỉ mô tả bản tối đang ship, và không giá trị nào ở
 * đây được đổi mà không đo lại bản tối.
 */
const DARK_HILITE: Record<GlyphName, string> = {
  heart: '#ff8fa8',
  moon: '#d9c4ff',
  flame: '#ffd08a',
  bolt: '#fff0a8',
  leaf: '#a8ffd9',
  pulse: '#a8d4ff',
  spark: '#e0c4ff',
  gauge: '#a8ffd9',
  sliders: '#e8e8ee',
  arrow: '#ffffff',
  camera: '#ffd08a',
  calendar: '#a8f4ff',
  home: '#f2f3f6',
  chevron: '#ffffff',
  plus: '#ffffff',
  clock: '#f2f3f6',
  /* Không đổi: `destructive` bản tối bằng đúng `readinessRed` cũ (#ff3b5c). */
  trash: '#ff8fa8',
  user: '#e8e8ee',
  /* Theo tint mới — cùng điểm sáng với `flame` và `camera`, ba glyph cùng đọc
     `metricOrange` thì cùng một cặp điểm dừng. */
  alert: '#ffd08a',
  dumbbell: '#cfe0f5',
};

/**
 * Hai điểm dừng của một glyph, cho theme đang bật.
 *
 * Đây là chỗ DUY NHẤT biết theme — `GLYPH_TINT` trả về một KHOÁ, đúng khuôn
 * `icon-tint.ts` đặt cho bảy bảng tint kia: bảng ở phạm vi module nên không đọc
 * được theme, và chỗ duy nhất đọc được là trong thân component.
 */
export function glyphStops(name: GlyphName, c: Palette, lit: boolean): readonly [string, string] {
  const ink = c[GLYPH_TINT[name]];
  return lit ? [DARK_HILITE[name], ink] : [ink, ink];
}

/** Glyphs whose shape needs a hole punched through it. */
const EVENODD: Partial<Record<GlyphName, true>> = { camera: true, calendar: true, clock: true, alert: true };

/**
 * `useId` on every gradient, without exception.
 *
 * SVG ids are document-global on native rather than scoped to the `<Svg>` they
 * are written in, and this set renders eight times on one screen. Hardcoded
 * ids would mean the first heart's gradient painting every glyph after it.
 * This has cost the project three separate debugging sessions in other
 * components.
 */
export function Glyph({
  name,
  size = 22,
  colour,
}: {
  name: GlyphName;
  size?: number;
  /** override the gradient with a flat colour — used where the tint is carried elsewhere */
  colour?: string;
}) {
  const uid = useId();
  const id = `gl-${name}-${uid}`;
  const c = usePalette();
  const m = useMaterial();
  const [from, to] = glyphStops(name, c, m.lit);

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {colour ? null : (
        <Defs>
          <LinearGradient id={id} x1="0.15" y1="0" x2="0.85" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
      )}
      <Path
        d={PATHS[name]}
        fill={colour ?? `url(#${id})`}
        fillRule={EVENODD[name] ? 'evenodd' : 'nonzero'}
      />
    </Svg>
  );
}

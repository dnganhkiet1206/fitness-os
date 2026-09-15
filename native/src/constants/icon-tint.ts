import {
  Activity,
  Apple,
  Award,
  Bed,
  BicepsFlexed,
  Bot,
  Camera,
  ChefHat,
  Coins,
  Croissant,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Medal,
  Moon,
  ScanBarcode,
  Soup,
  Sparkles,
  Star,
  Sunrise,
  TrendingUp,
  Trophy,
  type LucideIcon,
  Utensils,
  UtensilsCrossed,
  Weight,
  Zap,
} from 'lucide-react-native';

/*
  Bảng này trả về KHOÁ của bảng màu, không phải mã màu.

  Bảy hằng dưới đây từng đọc `colors` — tức bản TỐI — ở phạm vi module, nên
  trên giấy icon món ăn vẫn là xanh neon #2bf5a8, đo được 1,43:1 trên mặt thẻ
  trắng. Khoá thì để mỗi theme tự trả lời, và bản sáng đã có giá trị riêng cho
  cả bảy token này. Lập luận CHỌN token nào cho miền nào không đổi một chữ.
*/
import { type PaletteKey } from '@/constants/palette';

/**
 * What colour an icon is, decided once for the whole app.
 *
 * ── the problem this fixes ──
 *
 * `Utensils` was the brand silver in three places and muted grey in a fourth.
 * `Sparkles` was silver, purple and grey depending on the screen. `Dumbbell`
 * was silver in three and a 35%-alpha grey in another. Nothing was wrong on
 * any one screen; the app simply had no opinion, so the same idea arrived in a
 * different colour depending on where you met it.
 *
 * A colour that changes per screen is not decoration, it is noise: the eye
 * learns "green means food" in one place and has to unlearn it in the next.
 *
 * ── what gets a colour, and what does not ──
 *
 * Only icons that stand for **a thing in the app** are in this table — food,
 * calories, training, the heart, water, sleep, rewards, the assistant.
 *
 * Chrome is deliberately absent: chevrons, close, plus, check, search, pencil,
 * back arrows. They are punctuation. Giving them domain colours would make
 * every list row a small firework display and, worse, would spend meaning on
 * things that have none — if a chevron is green then green does not mean food
 * any more.
 *
 * Anything not listed falls back to `mutedForeground`, which is what `Icon`
 * used before this existed. Adding an icon here is how it gains a colour.
 *
 * ── why these colours ──
 *
 * All neon, from the app's own signal palette, so they read as emitted light
 * on a near-black page rather than as pigment.
 *
 * Each is meant to be guessable before it is learned:
 *
 *   food        green   growth, vegetables — the one the brief named
 *   energy      orange  fire, and everything that burns or spends it
 *   training    blue    effort under control; the calmest of the set, because
 *                       it appears the most
 *   heart       red     blood, and the only colour anyone reads as "vital"
 *   water       cyan    water
 *   sleep       purple  night
 *   reward      yellow  gold
 *   assistant   purple  shared with sleep on purpose, see below
 *
 * ── the two deliberate sharings ──
 *
 * Steps and calories share **orange**. Both are energy spent moving; giving
 * footprints a colour of their own would say they are a different kind of
 * thing from the flame beside them, and they are not — steps are what the
 * flame is counting.
 *
 * The assistant shares **purple** with sleep. There are seven neon colours and
 * more than seven ideas, so something had to double up; these two are the pair
 * that never appear next to each other, sleep being a metric and the assistant
 * being a way in. Given a spare hue, the assistant should get it.
 */

/** food and anything eaten */
const FOOD = 'readinessGreen' satisfies PaletteKey;
/** energy: burned, spent, or counted */
const ENERGY = 'metricOrangeGraphic' satisfies PaletteKey;
/**
 * Tập luyện — KIM LOẠI, không phải xanh dương.
 *
 * Tạ, đĩa tạ, đòn gánh: thứ người ta cầm lên đều bằng thép. Một cái tạ màu
 * xanh neon là một cái tạ không ai từng thấy, và nó đứng cạnh những icon khác
 * cũng xanh neon (nước xanh cyan, chỉ số xanh dương) nên nó chẳng nói được
 * mình là gì.
 *
 * `champagne` (#9fa3ad) là màu bạc app đã giữ sẵn trong nhóm nhận diện —
 * `tools/resting-aura.mjs` liệt kê nó cạnh `primary` và `goldLight`. Nó là
 * thép xám lạnh bất kể cái tên gợi ra gì.
 *
 * KHÔNG dùng `colors.primary`, dù nó cũng là bạc: `primary` có 195 chỗ dùng và
 * nó là màu của HÀNH ĐỘNG CHÍNH. Tô icon bằng nó là làm nhoè ranh giới "cái
 * này bấm được".
 *
 * Tương phản trên mặt thẻ #0e0e11: 7,63:1 — ngang màu xanh nó thay (7,42:1) và
 * trên sàn 3:1 của đồ hoạ lớn rất nhiều.
 *
 * Đổi ở HẰNG SỐ chứ không ở riêng `Dumbbell`: `Activity` cũng là TRAINING, và
 * để cái tạ hoá thép trong khi nhịp tập vẫn xanh là tạo ra đúng vết nứt mà tệp
 * này sinh ra để hàn.
 */
const TRAINING = 'champagne' satisfies PaletteKey;
/** the body's own signals */
const VITAL = 'readinessRed' satisfies PaletteKey;
/** water */
const WATER = 'metricCyan' satisfies PaletteKey;
/** night, and the assistant */
const NIGHT = 'metricPurple' satisfies PaletteKey;
/** anything won */
const REWARD = 'readinessYellow' satisfies PaletteKey;
/**
 * Phân tích — thứ app ĐỌC RA từ dữ liệu, không phải một miền của cơ thể.
 *
 * ── vì sao nó phải là một miền riêng ──
 *
 * Mục "Phân tích" ở màn Hôm nay đeo huy hiệu `Sparkles`, và ngay dưới nó thẻ
 * "Gợi ý thông minh" cũng đeo `Sparkles` — cùng glyph, cùng màu tím, cách nhau
 * sáu mươi điểm. Chủ dự án khoanh cả hai và gọi ra chỗ trùng.
 *
 * Cái phải đổi là huy hiệu MỤC, không phải thẻ: `Sparkles` ánh xạ sang `NIGHT`
 * — "đêm, và trợ lý" — nên nó THUỘC VỀ thẻ AI. Tab bar cũng dùng đúng nó cho
 * AI Coach, và `ai-meal-suggest` dùng nó ba lần. Mục thì chỉ đang mượn.
 *
 * `TrendingUp` là glyph của mục ấy: widget đầu tiên trong nó là biểu đồ xu
 * hướng sẵn sàng. Nhưng không miền nào có sẵn nhận được nó — nó không phải
 * thức ăn, năng lượng, thép, cơ thể, nước, đêm hay phần thưởng. Nên miền thứ
 * bảy, chứ không phải nhét bừa vào một miền cũ: chú thích của `TRAINING` ngay
 * trên đã ghi bài học "đổi ở HẰNG SỐ chứ không ở riêng một icon".
 *
 * `metricBlue` là khoá tự do duy nhất còn lại trong bảng, và chú thích của
 * chính nó đã ghi "MỘT màu làm cả hai việc: vẽ đồ hoạ, và viết chữ" — nên nó
 * hợp lệ cho một icon. Đo trên nền huy hiệu (chính nó ở 12%): **4,23:1** trên
 * giấy và **5,85:1** trong tối, trên sàn 3,0 của vật thể đồ hoạ.
 */
const INSIGHT = 'metricBlue' satisfies PaletteKey;

const TINTS: [LucideIcon, PaletteKey][] = [
  // food
  [Soup, FOOD],
  [Utensils, FOOD],
  [UtensilsCrossed, FOOD],
  [ChefHat, FOOD],
  [Apple, FOOD],
  [Croissant, FOOD],
  [Camera, FOOD],
  [ScanBarcode, FOOD],

  // energy
  [Flame, ENERGY],
  [Zap, ENERGY],
  [Footprints, ENERGY],

  // training
  [BicepsFlexed, TRAINING],
  [Dumbbell, TRAINING],
  [Activity, TRAINING],

  // the body
  [Heart, VITAL],
  [HeartPulse, VITAL],
  /*
    Quả cân, và vì sao nó là CƠ THỂ chứ không phải thép.

    Đọc theo nghĩa đen thì một quả cân là kim loại, nên `TRAINING` (thép) là câu
    trả lời dễ. Nhưng chú thích của chính `TRAINING` nói rõ miền ấy là gì: "tạ,
    đĩa tạ, đòn gánh — thứ người ta CẦM LÊN". Con số này không ai cầm lên; nó
    được ĐO. Và thứ được đo là cơ thể, nên nó về cùng chỗ với nhịp tim và HRV:
    những con số cơ thể nói ra về chính nó.

    ── `Weight` chứ không phải `Scale`, và đây là một chỗ SAI NGHĨA đã sửa ──

    Lucide `Scale` là CÁN CÂN CÔNG LÝ — hai đĩa treo trên một đòn cân. Nó mang
    nghĩa so sánh, công bằng, đánh đổi; nó không phải cái cân sức khoẻ người ta
    bước lên. App đã dùng nó cho cân nặng ở ba chỗ, và cả ba đều đang mượn một
    biểu tượng của khái niệm khác.

    Hệ quả phải nói ra: trên thẻ "Cần làm hôm nay", dòng Cân nặng và dòng Sinh
    trắc do đó CÙNG một màu. Đó là bảng này làm đúng việc của nó — màu ở đây
    nói MIỀN, không nói danh tính; hai dòng phân biệt nhau bằng hình và bằng
    nhãn. Tách ra một miền thứ chín chỉ để hai dòng khác màu là quay lại đúng
    kiểu "mỗi icon một màu" mà tệp này sinh ra để dẹp.

    Đo trên mặt ô icon: 4,52:1 ở bản sáng, 4,88:1 ở bản tối — trên sàn 3:1 của
    WCAG 1.4.11 cho vật thể đồ hoạ.
  */
  [Weight, VITAL],

  // water
  [Droplets, WATER],

  // night, and the assistant
  [Moon, NIGHT],
  [Bed, NIGHT],
  [Sunrise, NIGHT],
  [Sparkles, NIGHT],
  [Bot, NIGHT],

  // phân tích
  [TrendingUp, INSIGHT],

  // won
  [Coins, REWARD],
  [Trophy, REWARD],
  [Medal, REWARD],
  [Award, REWARD],
  [Star, REWARD],
];

const BY_ICON = new Map<LucideIcon, PaletteKey>(TINTS);

/**
 * The colour this icon should be, or `undefined` if it is chrome.
 *
 * Keyed on the component itself rather than a name, so a typo cannot silently
 * produce a grey icon — an icon that is not in the table is not in the table
 * for a reason, and one that is cannot be misspelled.
 */
export function iconTint(icon: LucideIcon): PaletteKey | undefined {
  return BY_ICON.get(icon);
}

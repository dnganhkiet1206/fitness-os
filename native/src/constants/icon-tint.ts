import {
  Activity,
  Apple,
  Award,
  Bed,
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
  Sparkles,
  Star,
  Sunrise,
  Trophy,
  Utensils,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import { colors } from '@/constants/ascnd';

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
const FOOD = colors.readinessGreen;
/** energy: burned, spent, or counted */
const ENERGY = colors.metricOrange;
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
const TRAINING = colors.champagne;
/** the body's own signals */
const VITAL = colors.readinessRed;
/** water */
const WATER = colors.metricCyan;
/** night, and the assistant */
const NIGHT = colors.metricPurple;
/** anything won */
const REWARD = colors.readinessYellow;

const TINTS: [LucideIcon, string][] = [
  // food
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
  [Dumbbell, TRAINING],
  [Activity, TRAINING],

  // the body
  [Heart, VITAL],
  [HeartPulse, VITAL],

  // water
  [Droplets, WATER],

  // night, and the assistant
  [Moon, NIGHT],
  [Bed, NIGHT],
  [Sunrise, NIGHT],
  [Sparkles, NIGHT],
  [Bot, NIGHT],

  // won
  [Coins, REWARD],
  [Trophy, REWARD],
  [Medal, REWARD],
  [Award, REWARD],
  [Star, REWARD],
];

const BY_ICON = new Map<LucideIcon, string>(TINTS);

/**
 * The colour this icon should be, or `undefined` if it is chrome.
 *
 * Keyed on the component itself rather than a name, so a typo cannot silently
 * produce a grey icon — an icon that is not in the table is not in the table
 * for a reason, and one that is cannot be misspelled.
 */
export function iconTint(icon: LucideIcon): string | undefined {
  return BY_ICON.get(icon);
}

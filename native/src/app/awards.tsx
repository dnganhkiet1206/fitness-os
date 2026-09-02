import * as Haptics from 'expo-haptics';
import { Activity, BedDouble, Beef, Calendar, CalendarCheck, CalendarDays, CalendarRange, ChartLine, ChefHat, Crown, Droplet, Droplets, Dumbbell, Flame, Footprints, Gem, GlassWater, Medal, Moon, MoonStar, Mountain, Route, Salad, Scale, Share2, Shield, Sparkles, Sunrise, Target, TrendingUp, Trophy, Utensils, Zap, type LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { ProgressBar } from '@/components/ascnd/progress-bar';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { press } from '@/constants/motion';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { AWARD_DEFINITIONS, useAwardProgress, useAwards, useCheckAwards } from '@/hooks/use-extras';
import type { AwardSources } from '@/lib/award-grant';
import { awardText } from '@/lib/gamification-i18n';
import type { AppLang } from '@/lib/i18n';

/*
  Mỗi HUY CHƯƠNG một dấu, không phải mỗi MIỀN một dấu.

  Trước đây icon gán theo `type`, nên cả tám huy chương chuỗi ngày dùng chung
  một ngọn lửa. Cộng với con số trên mặt đĩa thì đã phân biệt được, nhưng glyph
  vẫn chưa NÓI gì: nó chỉ lặp lại cái tiêu đề mục ngay phía trên.

  Nay mỗi cái mang dấu của chính nó, và dấu ấy leo thang theo ý nghĩa: chuỗi
  ngày đi từ tia lửa → tuần → tháng → bình minh → huy hiệu → đá quý → vương
  miện. Bước chân đi từ dấu chân → cung đường → ngọn núi.

  Bảng này sinh ra từ chính danh mục và MỌI tên đã được đối chiếu với tệp thật
  trong `lucide-react-native/dist/esm/icons`. Hai tên tôi bịa — `line-chart` và
  `waves` — bị bắt ở bước đó; nếu không kiểm thì chúng rơi vào nhánh
  `?? Trophy` và vẽ ra cái cúp, im lặng, không đỏ ở đâu cả.
*/
const ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  'bed-double': BedDouble,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  'calendar-range': CalendarRange,
  'chart-line': ChartLine,
  'chef-hat': ChefHat,
  crown: Crown,
  droplet: Droplet,
  droplets: Droplets,
  dumbbell: Dumbbell,
  flame: Flame,
  footprints: Footprints,
  gem: Gem,
  'glass-water': GlassWater,
  medal: Medal,
  moon: Moon,
  'moon-star': MoonStar,
  mountain: Mountain,
  route: Route,
  salad: Salad,
  scale: Scale,
  shield: Shield,
  sunrise: Sunrise,
  target: Target,
  'trending-up': TrendingUp,
  trophy: Trophy,
  utensils: Utensils,
  zap: Zap,
};

/**
 * Mỗi hạng là một thứ KIM LOẠI, không phải một màu.
 *
 * ── vì sao cần ba tông cho mỗi hạng ──
 *
 * Bản cũ có đúng một màu mỗi hạng, và huy chương được vẽ bằng một vòng viền
 * 3px cộng một icon lucide cùng màu ấy. Kết quả đọc ra là một nút bị vô hiệu
 * hoá, không phải một tấm huy chương.
 *
 * Huy chương của Apple Fitness — thứ người dùng lấy làm chuẩn — là một cái ĐĨA
 * ĐẶC: thân đĩa chuyển màu xuyên tâm, một vành ngoài dày hơn, glyph dập chìm
 * vào mặt kim loại CÙNG TÔNG chứ không phải màu tương phản, và một vệt sáng
 * chéo ở góc trên trái. Không có ba tông thì không dựng được cái nào trong bốn
 * thứ đó: chuyển màu cần sáng và tối, vành cần tối hơn mặt, glyph dập chìm cần
 * một tông tối hơn nữa nằm trên cùng nền.
 *
 * `dim` giữ nguyên cho viên chữ hạng ở dưới thẻ.
 */
type Metal = { color: string; light: string; dark: string; dim: string; label: string };
const TIER_CONFIG: Record<string, Metal> = {
  bronze: { color: '#c47b3d', light: '#e8a86a', dark: '#7d4a20', dim: 'rgba(196,123,61,0.12)', label: 'Bronze' },
  silver: { color: '#c7cad1', light: '#f2f4f8', dark: '#7e828c', dim: 'rgba(199,202,209,0.12)', label: 'Silver' },
  gold: { color: '#ffd93d', light: '#fff3ab', dark: '#b0790a', dim: 'rgba(255,217,61,0.12)', label: 'Gold' },
  platinum: { color: '#b45cff', light: '#ddb0ff', dark: '#6b2fa0', dim: 'rgba(180,92,255,0.12)', label: 'Platinum' },
};

/**
 * Dáng huy chương, sinh bằng CÔNG THỨC — không phải đường cong vẽ tay.
 *
 * ── vì sao ràng buộc này ──
 *
 * Hai lượt trước tôi tự viết path Bézier cho ngọn lửa, giọt nước và trăng
 * khuyết. Cả hai lượt đều ra hình méo, vì hệ số điều khiển là tôi đoán và
 * "đúng cú pháp" không có nghĩa là "vẽ ra đẹp". Đa giác và hoa thị thì khác:
 * đỉnh nằm trên đường tròn theo lượng giác, nên chúng luôn cân đối, và đổi
 * bán kính là cả bộ theo.
 *
 * ── và vì sao đo bán kính trong trước khi chọn ──
 *
 * Mặt đĩa phải chứa được con số. Bán kính trong của từng hình đo trước khi
 * gán: lục giác 48px, bát giác 52px, thoi 40px, tia mặt trời 45px — đều lọt
 * "365" ở 21pt (~36px). Sao 5 cánh chỉ 25px, và nó CHỈ dùng cho miền kỷ lục
 * nơi con số lớn nhất là "5". Lượt trước tôi chọn trăng khuyết mà không hỏi
 * nó có chứa nổi con số không; nó không.
 *
 * ── ý nghĩa nằm ở đâu ──
 *
 *     chuỗi ngày   tia mặt trời   — toả ra, cháy tiếp
 *     buổi tập     khiên          — sức mạnh
 *     kỷ lục       sao năm cánh   — đỉnh
 *     bước chân    lục giác       — biển chỉ đường
 *     dinh dưỡng   bát giác       — cái đĩa
 *     nước         hình thoi      — giọt, dựng theo hình học
 *     giấc ngủ     vuông bo tròn  — cái gối
 *     cân nặng     hình tròn      — mặt đồng hồ cân
 */
function polyPath(r: number, sides: number, rotate = -Math.PI / 2): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i * 2 * Math.PI) / sides;
    pts.push(`${(36 + r * Math.cos(a)).toFixed(2)},${(36 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Hoa thị / tia: bán kính so le giữa `r` và `r * inner`. */
function starPath(r: number, points: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push(`${(36 + rad * Math.cos(a)).toFixed(2)},${(36 + rad * Math.sin(a)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** Vuông bo tròn mạnh — cái gối. */
function squirclePath(r: number): string {
  const k = r * 0.55;
  const a = r * 0.92;
  return [
    `M ${36 - a + k} ${36 - a}`, `L ${36 + a - k} ${36 - a}`,
    `Q ${36 + a} ${36 - a} ${36 + a} ${36 - a + k}`, `L ${36 + a} ${36 + a - k}`,
    `Q ${36 + a} ${36 + a} ${36 + a - k} ${36 + a}`, `L ${36 - a + k} ${36 + a}`,
    `Q ${36 - a} ${36 + a} ${36 - a} ${36 + a - k}`, `L ${36 - a} ${36 - a + k}`,
    `Q ${36 - a} ${36 - a} ${36 - a + k} ${36 - a}`, 'Z',
  ].join(' ');
}

/** Khiên: vai vuông trên, mũi dưới. */
function shieldPath(r: number): string {
  const w = r * 0.9;
  return [
    `M ${36 - w} ${36 - r + r * 0.16}`,
    `Q ${36 - w} ${36 - r} ${36 - w * 0.8} ${36 - r}`,
    `L ${36 + w * 0.8} ${36 - r}`,
    `Q ${36 + w} ${36 - r} ${36 + w} ${36 - r + r * 0.16}`,
    `L ${36 + w} ${36 - r * 0.3}`,
    `Q ${36 + w} ${36 + r * 0.3} ${36} ${36 + r}`,
    `Q ${36 - w} ${36 + r * 0.3} ${36 - w} ${36 - r * 0.3}`,
    'Z',
  ].join(' ');
}

function medalPath(type: string, r: number): string | null {
  switch (type) {
    case 'streak': return starPath(r, 12, 0.8);
    case 'first_workout':
    case 'volume_milestone': return shieldPath(r);
    case 'pr': return starPath(r, 5, 0.45);
    case 'steps_goal': return polyPath(r, 6);
    case 'nutrition': return polyPath(r, 8, -Math.PI / 8);
    case 'water': return polyPath(r, 4, -Math.PI / 2);
    case 'sleep': return squirclePath(r);
    default: return null; /* cân nặng: hình tròn */
  }
}

/*
  Chưa mở thì là kim loại XÁM, không phải kim loại có hạng bị làm mờ.

  Bản cũ hạ `opacity` cả thẻ xuống 0,4, nên chữ mô tả tụt dưới ngưỡng đọc được
  — và đó là trạng thái của MỌI người ở ngày đầu. Cho huy chương một thứ kim
  loại riêng thì nó tự nói "chưa mở" bằng chất liệu, và chữ giữ nguyên độ đọc.
*/
const LOCKED: Metal = {
  color: '#4a4a55', light: '#5c5c68', dark: '#2a2a31',
  dim: 'rgba(24,24,27,0.4)', label: '',
};

/**
 * Nhóm theo MIỀN, không theo hạng.
 *
 * ── vì sao đổi ──
 *
 * Bản cũ gom theo hạng, nên năm huy chương chuỗi ngày (30/60/100/180/365) nằm
 * rải trong mục "PLATINUM" cạnh "hoàn thành 100 buổi tập" — bốn cái thang khác
 * nhau trộn vào nhau, và không cái nào đọc ra là một cái thang. Người muốn biết
 * "chuỗi ngày của tôi tới đâu rồi" phải tự quét cả bốn mục.
 *
 * Và chữ "PLATINUM" hiện bảy lần trên một màn: một lần ở tiêu đề mục, một lần
 * trên mỗi thẻ. Hạng vẫn còn trên thẻ — ở đó nó nói điều gì đó — nhưng thôi làm
 * cách chia.
 *
 * Thứ tự: thang dài nhất trước, vì đó là thứ người ta theo lâu nhất.
 */
const DOMAINS: { types: string[]; vi: string; en: string }[] = [
  { types: ['streak'], vi: 'Chuỗi ngày', en: 'Streaks' },
  /*
    `first_workout` gộp vào Buổi tập, không đứng riêng.

    Nó là `type` riêng ở tầng dữ liệu vì luật trao khác nhau — một cái xét
    `>= 1`, ba cái kia xét ngưỡng — nhưng với người đọc thì cả bốn đều trả lời
    cùng một câu: "tôi đã tập bao nhiêu buổi". Cho nó một mục riêng nghĩa là
    một tiêu đề, một đường kẻ, một bộ đếm "0/1" rồi đúng MỘT thẻ; khung nhiều
    hơn nội dung.

    Vì thế nhóm ở đây nhận một DANH SÁCH type chứ không phải một type. Cách
    chia của màn hình thôi phải trùng khít với cách chia của bảng dữ liệu —
    hai thứ ấy trả lời hai câu hỏi khác nhau.
  */
  { types: ['first_workout', 'volume_milestone'], vi: 'Buổi tập', en: 'Workouts' },
  { types: ['pr'], vi: 'Kỷ lục cá nhân', en: 'Personal records' },
  { types: ['steps_goal'], vi: 'Bước chân', en: 'Steps' },
  { types: ['nutrition'], vi: 'Dinh dưỡng', en: 'Nutrition' },
  { types: ['water'], vi: 'Nước uống', en: 'Water' },
  { types: ['sleep'], vi: 'Giấc ngủ', en: 'Sleep' },
  { types: ['body'], vi: 'Cân nặng', en: 'Body' },
];

/**
 * Con số hiện tại cho mỗi miền, để thẻ chưa mở nói được "12 / 30".
 *
 * Tra tìm được ghi lại: huy chương chưa mở mà không nói bạn đang ở đâu thì nó
 * chỉ là một ô xám. "Log 30 days in a row" đúng ở mọi ngày kể từ ngày đầu, nên
 * nó không nói gì; "12 / 30" thì nói.
 */
function currentFor(type: string, src: AwardSources | undefined): number | null {
  if (!src) return null;
  switch (type) {
    case 'streak': return src.streak;
    case 'volume_milestone':
    case 'first_workout': return src.workoutCount;
    case 'pr': return src.prCount;
    case 'steps_goal': return src.steps;
    case 'nutrition': return src.mealCount;
    case 'water': return src.waterDays;
    case 'sleep': return src.sleepCount;
    case 'body': return src.weighCount;
    default: return null;
  }
}

type AwardDef = (typeof AWARD_DEFINITIONS)[number];
interface EarnedAward {
  id: string;
  award_key: string | null;
  earned_at: string;
}

function MedalCard({
  award,
  earned,
  locale,
  lang,
  index,
  current,
}: {
  award: AwardDef;
  earned: EarnedAward | undefined;
  locale: string;
  lang: AppLang;
  index: number;
  /** con số hiện tại của miền này, hoặc `null` khi chưa đọc được */
  current: number | null;
}) {
  const i18n = useI18n();
  const tier = TIER_CONFIG[award.tier] ?? TIER_CONFIG.bronze;
  const AwardIcon = ICON_MAP[award.icon] ?? Trophy;
  const isEarned = !!earned;
  const { title, desc } = awardText(award.key, lang);
  const m: Metal = isEarned ? tier : LOCKED;
  /*
    Glyph SÁNG hơn mặt đĩa, không tối hơn.

    Bản đầu tôi dập chìm bằng `m.dark` — đúng nguyên tắc của huy chương thật,
    nơi kim loại sáng và nét khắc đổ bóng. Nhưng ở trạng thái chưa mở, mặt đĩa
    là #4a4a55 và `dark` là #2a2a31: tối trên tối, và glyph biến mất khỏi ảnh
    chụp. Nguyên tắc "khắc chìm" không bê thẳng sang một bảng màu tối được.
  */
  const glyph = isEarned ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)';

  /* Dáng của miền ở hai bán kính; `null` là hình tròn — xem `medalPath`. Mọi
     dáng đều đối xứng quanh 36,36 nên chữ vẫn đặt ở tâm, khác hẳn giọt nước và
     ngọn lửa của lượt trước vốn dồn khối lượng về một đầu. */
  const rim = medalPath(award.type, 33);
  const face = medalPath(award.type, 28);


  /* Vòng tiến độ ở r=34, ngay ngoài vành r=33. */
  const R = 34;
  const C = 2 * Math.PI * R;

  /*
    Phần đã đi được, chỉ khi biết CẢ HAI đầu.

    `need` vắng mặt ở những huy chương không có ngưỡng (`first_workout`,
    `first_pr`) — chúng chỉ có hai trạng thái, nên không có gì để vẽ dở.
    `current` là `null` khi truy vấn hỏng, và một truy vấn hỏng KHÔNG được vẽ
    thành 0% — đó là cùng bất biến mà `usable()` giữ ở phía trao huy chương.
  */
  const need = 'requirement' in award ? award.requirement : null;
  const pct =
    isEarned || need == null || current == null ? 0 : Math.max(0, Math.min(1, current / need));
  const showCount = !isEarned && need != null && current != null;

  /*
    Mốc, viết ngắn cho vừa mặt đĩa.

    10.000 bước thành "10K" chứ không phải "10000" — năm chữ số ở cỡ này thì
    hoặc tràn hoặc phải nhỏ tới mức thôi là mặt huy chương.
  */
  const mark =
    need == null ? null : need >= 1000 ? `${Math.round(need / 1000)}K` : String(need);


  const share = async () => {
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `🏅 ${title} — ${desc}! #ASCND`,
      });
    } catch {
      // user cancelled
    }
  };

  return (
    <Animated.View
      style={styles.medalCard}
      entering={FadeInDown.springify().damping(26).stiffness(180).delay(Math.min(index, 12) * 45)}>
      <View style={styles.medalRing}>
        {/*
          Một cái ĐĨA, không phải một cái vòng.

          Bốn lớp, đúng giải phẫu của huy chương Apple Fitness:

            1. vành ngoài — chuyển màu dọc sáng-trên/tối-dưới, cho cạnh có bề dày
            2. mặt đĩa    — chuyển màu XUYÊN TÂM lệch lên trái, nơi ánh sáng rơi
            3. vệt sáng   — một lát mỏng ở góc trên trái, thứ làm kim loại ra kim loại
            4. glyph      — dập chìm bằng tông TỐI của cùng kim loại, không phải
                            màu tương phản; đó là khác biệt giữa "khắc vào" và
                            "dán lên"

          Tất cả TĨNH. Bài học mascot trong phiên này là 26 nhóm SVG cập nhật
          MỖI KHUNG HÌNH — chi phí nằm ở chỗ động, không ở chỗ có nhiều nhóm.
          Bốn lớp không đổi thì vẽ một lần rồi thôi.
        */}
        <Svg width={72} height={72} viewBox="0 0 72 72">
          <Defs>
            <SvgGradient id={`rim-${award.key}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={m.light} />
              <Stop offset="1" stopColor={m.dark} />
            </SvgGradient>
            <RadialGradient id={`face-${award.key}`} cx="36%" cy="30%" r="78%">
              <Stop offset="0" stopColor={m.light} />
              <Stop offset="0.55" stopColor={m.color} />
              <Stop offset="1" stopColor={m.dark} />
            </RadialGradient>
          </Defs>

          {/* Vành và mặt CÙNG một dáng, khác bán kính — mọi hình đều có bề dày
              cạnh, không riêng hình tròn. */}
          {rim ? (
            <Path d={rim} fill={`url(#rim-${award.key})`} />
          ) : (
            <Circle cx={36} cy={36} r={33} fill={`url(#rim-${award.key})`} />
          )}
          {face ? (
            <Path d={face} fill={`url(#face-${award.key})`} />
          ) : (
            <Circle cx={36} cy={36} r={28} fill={`url(#face-${award.key})`} />
          )}
          {/* Lát sáng: một cung ở phần tư trên-trái, mờ dần bằng độ trong. */}
          {/* Vệt sáng bám theo đường tròn r=28, nên chỉ đúng cho mặt TRÒN. Các
              dáng khác đã có chuyển màu xuyên tâm làm việc đó. */}
          {!face && (
            <Path d="M 13 30 A 24 24 0 0 1 44 13 A 28 28 0 0 0 13 44 Z" fill="rgba(255,255,255,0.20)" />
          )}

        </Svg>
        {/*
          CON SỐ là mặt của huy chương, glyph chỉ là phụ đề.

          ── vì sao ──

          `AWARD_DEFINITIONS` gán icon theo `type`, nên cả tám huy chương chuỗi
          ngày dùng chung một ngọn lửa và cả bốn huy chương buổi tập dùng chung
          một quả tạ. Trong mỗi nhóm mọi đĩa GIỐNG HỆT nhau — thứ duy nhất khác
          là màu hạng — nên nhìn vào đĩa không đọc ra được nó là huy chương gì.
          Người dùng nói đúng: "cái nào cũng giống nhau thành ra nhìn không có
          ý nghĩa".

          Ý nghĩa của một huy chương CHÍNH LÀ cái mốc, nên mốc phải là thứ lớn
          nhất trên mặt đĩa. Huy chương chuỗi 30 ngày và chuỗi 365 ngày lập tức
          khác nhau, và khác nhau ở đúng thứ làm chúng khác nhau. Apple đặt số
          lên mặt badge vì cùng lý do.

          Huy chương KHÔNG có ngưỡng — "buổi tập đầu tiên", "PR đầu tiên", "bữa
          ăn đầu tiên" — thì không có số để in, và cũng không cần: chúng vốn đã
          là duy nhất trong nhóm của mình. Chúng giữ glyph, vẽ lớn hơn.
        */}
        <View style={styles.medalIcon}>
          {mark ? (
            <>
              <Icon icon={AwardIcon} size={13} color={glyph} />
              <Text style={[styles.medalMark, { color: glyph }]} numberOfLines={1}>
                {mark}
              </Text>
            </>
          ) : (
            <Icon icon={AwardIcon} size={30} color={glyph} />
          )}
        </View>
      </View>



      <Text style={[styles.medalTitle, !isEarned && styles.medalTitleLocked]} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.medalDesc} numberOfLines={2}>
        {desc}
      </Text>

      {/*
        Tiến độ là một THANH NGANG dưới cùng, không phải vòng cung quanh đĩa.

        Vòng cung đọc sai ở hai điểm. Nó bám sát mép kim loại nên ở mức thấp —
        1/60, 1/100 — nó chỉ là một vạch ngắn ở đỉnh, trông như một khiếm
        khuyết của hình chứ không như tiến độ. Và nó cạnh tranh với chính cái
        vành: hai đường tròn đồng tâm cách nhau một điểm ảnh.

        Thanh ngang thì có điểm đầu và điểm cuối nhìn thấy được, nên 1/100 đọc
        ra là "mới bắt đầu" chứ không phải "hình bị sứt".
      */}
      {showCount ? (
        <View style={styles.barWrap}>
          {/*
            `<ProgressBar>`, không phải một bản chép thứ bảy.

            Bản đầu dựng track + fill tại chỗ và cho fill một `width` phần trăm.
            Hai thứ hỏng cùng lúc: một `width` phần trăm KHÔNG chạy hoạt hoạ nên
            thanh nhảy cóc mỗi lần con số đổi, và nếu có cho nó chạy thì đó là
            một thuộc tính bố cục — layout phải tính lại mỗi khung hình.
            `progress-bar.tsx` đã đo và giải quyết đúng hai chuyện đó một lần
            cho cả app; `tools/progress-bar.mjs` tồn tại vì đây là bản chép thứ
            bảy chứ không phải thứ nhất.

            Sàn 2% được GIỮ, và nó chuyển sang chỗ gọi vì nó là một quyết định
            về màn hình này: một thanh có điểm đầu và điểm cuối nhìn thấy được
            thì 1/100 phải đọc ra là "mới bắt đầu", không phải "hình bị sứt".
          */}
          <ProgressBar
            pct={Math.max(0.02, pct)}
            color={tier.color}
            height={4}
            trackColor="rgba(255,255,255,0.08)"
          />
          <Text style={styles.medalProgress}>
            {current!.toLocaleString(locale)} / {need!.toLocaleString(locale)}
          </Text>
        </View>
      ) : null}

      {earned && (
        <View style={styles.earnedRow}>
          <Text style={styles.earnedDate}>
            {new Date(earned.earned_at).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>
          <PressScale to={press.deep} accessibilityRole="button" accessibilityLabel={i18n.a11yShare} hitSlop={8} onPress={share}>
            <Icon icon={Share2} size={14} color={colors.mutedForeground} />
          </PressScale>
        </View>
      )}
    </Animated.View>
  );
}

export default function AwardsScreen() {
  const { data: awards } = useAwards();
  const { data: sources } = useAwardProgress();
  const { checkAndGrant, ready } = useCheckAwards();
  const checkedRef = useRef(false);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const locale = lang === 'vi' ? 'vi-VN' : 'en-US';

  // Web Awards runs the grant check on open too
  useEffect(() => {
    if (ready && !checkedRef.current) {
      checkedRef.current = true;
      checkAndGrant();
    }
  }, [ready, checkAndGrant]);

  const earnedMap = new Map((awards ?? []).map((a) => [a.award_key, a]));
  const earnedCount = earnedMap.size;
  const totalCount = AWARD_DEFINITIONS.length;
  const pct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;
  const R = 32;
  const C = 2 * Math.PI * R;

  return (
    <Screen refreshable back title={i18n.awardsTitle}>
      {/* Hero: medal tile + progress ring (web) */}
      <View style={styles.hero}>
        <View style={styles.heroTile}>
          <Icon icon={Medal} size={30} color="#ffd93d" />
        </View>
        <Text style={styles.heroCount}>
          {i18n.awardsEarned} <Text style={styles.heroCountNum}>{earnedCount}</Text> / {totalCount}{' '}
          {i18n.awardsOf}
        </Text>
        <View style={styles.progressWrap}>
          <Svg width={80} height={80} viewBox="0 0 80 80">
            <Defs>
              <SvgGradient id="awards-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor="#ffd93d" />
                <Stop offset="100%" stopColor="#ff9130" />
              </SvgGradient>
            </Defs>
            <Circle cx={40} cy={40} r={R} fill="none" stroke="#17171c" strokeWidth={4} />
            <Circle
              cx={40}
              cy={40}
              r={R}
              fill="none"
              stroke="url(#awards-grad)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={`${C}`}
              strokeDashoffset={C * (1 - pct / 100)}
              transform="rotate(-90 40 40)"
            />
          </Svg>
          <View style={styles.progressCenter}>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
        </View>
      </View>

      {DOMAINS.map((dom) => {
        const list = AWARD_DEFINITIONS.filter((a) => dom.types.includes(a.type));
        if (list.length === 0) return null;
        const done = list.filter((a) => earnedMap.has(a.key)).length;
        /* Mọi type trong một nhóm đọc cùng một nguồn — `first_workout` và
           `volume_milestone` đều là `workoutCount` — nên lấy type đầu là đủ. */
        const now = currentFor(dom.types[0], sources);
        return (
          <View key={dom.types[0]} style={styles.tierSection}>
            <View style={styles.tierHeader}>
              {/* Icon của chính miền, không phải Sparkles cho mọi mục — bản cũ
                  vẽ cùng một ngôi sao trên cả bốn tiêu đề, nên nó không phân
                  biệt được gì và chỉ là trang trí. */}
              <Icon icon={ICON_MAP[list[0].icon] ?? Trophy} size={14} color={colors.mutedForeground} />
              <Text style={styles.tierTitle}>{lang === 'vi' ? dom.vi : dom.en}</Text>
              <View style={styles.tierLine} />
              <Text style={styles.tierCount}>
                {done}/{list.length}
              </Text>
            </View>
            <View style={styles.grid}>
              {list.map((award, i) => (
                <MedalCard
                  key={award.key}
                  award={award}
                  earned={earnedMap.get(award.key)}
                  locale={locale}
                  lang={lang}
                  index={i}
                  current={now}
                />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm },
  heroTile: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,217,61,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ffd93d',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  heroCount: { ...type.footnote, color: colors.mutedForeground },
  heroCountNum: { ...type.mono, fontWeight: '700', color: colors.foreground },
  progressWrap: { width: 80, height: 80 },
  progressCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPct: { ...type.mono, fontSize: 17, fontWeight: '700', color: '#ffd93d' },

  tierSection: { gap: spacing.sm + 4 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /*
    `color` PHẢI có ở đây.

    Trước đây màu đến từ inline `{ color: tc.color }` — màu của hạng. Khi đổi
    sang nhóm theo miền tôi bỏ dòng inline ấy và không cấp màu thay thế, nên
    chữ rơi về màu mặc định của hệ thống: đen trên nền đen. Tiêu đề mục biến
    mất hoàn toàn.

    `tsc` không thấy được: thiếu `color` là style hợp lệ. Guard cũng không —
    không luật nào nói "mỗi Text phải có màu". Chỉ mắt người bắt được, và đó
    là lần thứ hai trong phiên này một thay đổi qua hết mọi cửa tự động rồi
    hỏng trên màn hình.
  */
  tierTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: colors.foreground,
  },
  tierLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(43,43,49,0.4)' },
  tierCount: { ...type.mono, fontSize: 11, color: colors.mutedForeground },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  medalCard: {
    width: '47.5%',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.5)',
    backgroundColor: 'rgba(14,14,17,0.6)',
  },
  /* Số đứng riêng một dòng, chữ số đều bề rộng để cột không nhảy khi con số
     đổi từ 9 sang 10. */
  barWrap: { width: '100%', alignItems: 'center', gap: 4, marginTop: 2 },
  /* `width` là phần trăm nên nó co theo thẻ; `minWidth` 2% để mức 1/365 vẫn
     hiện ra một đầu mút thay vì biến mất hoàn toàn. */
  medalProgress: {
    ...type.footnote,
    fontWeight: '700',
    color: colors.mutedForeground,
    fontVariant: ['tabular-nums'],
  },
  medalRing: { width: 72, height: 72 },
  /* Con số trên mặt đĩa: đậm, chữ số đều bề rộng, bóp sát để "365" và "250"
     vẫn nằm gọn trong 56 điểm đường kính mặt. */
  /*
    Con số DẬP vào kim loại, không đặt lên trên.

    Một bóng tối lệch xuống một điểm ảnh cho nét chữ một cạnh dưới — đúng thứ
    xảy ra khi chữ được dập chìm và ánh sáng đến từ trên trái, cùng hướng với
    vệt sáng và với chuyển màu xuyên tâm của mặt đĩa. Không có nó thì con số
    trông như dán lên.

    Nét 900 và giãn -1: ở 22 điểm trong đường kính 56, "365" cần bóp sát mới
    còn khoảng thở hai bên.
  */
  medalMark: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
    marginTop: -1,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
  medalIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalTitle: { fontSize: 13, fontWeight: '700', color: colors.foreground, textAlign: 'center' },
  /*
    `mutedForeground`, không phải xám 50% alpha.

    Bản cũ để `rgba(140,140,150,0.5)` — trên nền thẻ tối thì tên huy chương tụt
    dưới ngưỡng đọc được, và đó là trạng thái của MỌI huy chương ở ngày đầu.
    Mờ để nói "chưa mở" là đúng; mờ tới mức phải nheo mắt thì cả màn không dùng
    được đúng lúc nó cần thuyết phục người ta nhất. Kim loại xám đã nói "chưa
    mở" rồi — chữ không cần nói lại bằng cách tự xoá mình.
  */
  medalTitleLocked: { color: colors.mutedForeground },
  medalDesc: { fontSize: 11, color: colors.mutedForeground, textAlign: 'center', lineHeight: 14 },
  earnedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  earnedDate: { ...type.mono, fontSize: 11, color: colors.mutedForeground },
});

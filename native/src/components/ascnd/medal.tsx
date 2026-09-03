import { Activity, BedDouble, CalendarCheck, CalendarDays, CalendarRange, ChartLine, ChefHat, Crown, Droplet, Droplets, Dumbbell, Flame, Footprints, Gem, GlassWater, Medal as MedalIcon, Moon, MoonStar, Mountain, Route, Salad, Scale, Shield, Sunrise, Target, TrendingUp, Trophy, Utensils, Zap, type LucideIcon } from 'lucide-react-native';
import { useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { Icon } from '@/components/ascnd/icon';

/**
 * Tấm huy chương, vẽ MỘT chỗ.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Huy chương được vẽ lại toàn bộ ở `app/awards.tsx`: đĩa kim loại bốn lớp,
 * dáng riêng cho từng miền, con số dập lên mặt. Nhưng thẻ "Huy chương gần đây"
 * trên Hôm nay KHÔNG đi qua đường đó — nó có bảng icon riêng (tám cái, trong
 * khi danh mục có hai mươi chín), bảng màu hạng riêng, và vẽ một ô bo góc viền
 * mảnh với một icon lucide bên trong. Tức bản thiết kế mới chưa bao giờ tới
 * được cái thẻ mà đa số người dùng nhìn thấy trước.
 *
 * Không ai báo được điều đó bằng một bước kiểm: hai bản vẽ đều hợp lệ, đều
 * biên dịch, đều có màu. Người dùng nhìn hai màn cạnh nhau mới thấy.
 *
 * ── ranh giới ──
 *
 * Tệp này giữ ĐĨA và những bảng tra mà đĩa cần: dấu của từng huy chương, kim
 * loại của từng hạng, và dáng của từng miền. Nó KHÔNG giữ thẻ — tiêu đề, mô
 * tả, thanh tiến độ, ngày nhận, nút chia sẻ đều là chuyện của màn hình, và hai
 * chỗ dùng đĩa này bày chúng khác nhau vì chúng trả lời hai câu hỏi khác nhau.
 */

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
export const ICON_MAP: Record<string, LucideIcon> = {
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
  /* `Medal` là TÊN của component xuất ra ở cuối tệp này, nên icon cùng tên
     phải đổi tên khi nhập — nếu không thì bảng tra trỏ vào chính component. */
  medal: MedalIcon,
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
export type Metal = { color: string; light: string; dark: string; dim: string; label: string };
export const TIER_CONFIG: Record<string, Metal> = {
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
export const LOCKED: Metal = {
  color: '#4a4a55', light: '#5c5c68', dark: '#2a2a31',
  dim: 'rgba(24,24,27,0.4)', label: '',
};


/**
 * Đĩa huy chương ở một cỡ bất kỳ.
 *
 * ── vì sao `size` không chỉ là một con số truyền vào `<Svg>` ──
 *
 * Hình vẽ thì co theo `viewBox`, nhưng con số và glyph nằm TRÊN nó là `<Text>`
 * và `<Icon>` của React Native — chúng không biết gì về viewBox. Nên mọi cỡ
 * chữ đều nhân với `k`, và nếu quên thì ở 40 điểm cái đĩa co lại còn con số
 * vẫn 22pt, tràn ra ngoài vành.
 *
 * ── vì sao glyph biến mất ở cỡ nhỏ ──
 *
 * Ở cỡ đầy đủ, mặt đĩa mang một con số lớn kèm một dấu nhỏ phía trên. Nhân với
 * `k = 40/72` thì dấu ấy còn 7 điểm — dưới ngưỡng đọc được của một glyph nét
 * mảnh, nên nó thôi là thông tin và chỉ còn là nhiễu quanh con số.
 *
 * Bỏ nó đi thì cỡ nhỏ mất một tầng thông tin, và đó là đánh đổi ĐÚNG: con số
 * là thứ phân biệt huy chương chuỗi 30 ngày với chuỗi 365, còn dấu chỉ nhắc lại
 * cái miền mà tiêu đề ngay bên cạnh đã nói.
 */
const GLYPH_FLOOR = 56;

export function Medal({
  type,
  tier,
  icon,
  requirement,
  earned,
  size = 72,
}: {
  type: string;
  tier: string;
  icon: string;
  /** Mốc in lên mặt đĩa; `null` ở huy chương không có ngưỡng. */
  requirement?: number | null;
  earned: boolean;
  size?: number;
}) {
  /*
    Id DUY NHẤT cho hai gradient.

    Bản trong `awards.tsx` khoá theo `award.key`, thứ đúng chừng nào mỗi huy
    chương chỉ vẽ một lần trên một cây. Nay đĩa này còn nằm trong thẻ "gần đây",
    nên cùng một huy chương có thể xuất hiện hai chỗ cùng lúc — và hai `<Defs>`
    trùng id thì cái sau đè lên cái trước. `readiness-aura` đã trả giá cho đúng
    bài học này. `useId` trả về chuỗi có dấu hai chấm, thứ không hợp lệ trong
    `url(#…)`, nên phải gột.
  */
  const uid = useId().replace(/:/g, '');
  const AwardIcon = ICON_MAP[icon] ?? Trophy;
  const m: Metal = earned ? (TIER_CONFIG[tier] ?? TIER_CONFIG.bronze) : LOCKED;

  /*
    Glyph SÁNG hơn mặt đĩa, không tối hơn.

    Bản đầu dập chìm bằng `m.dark` — đúng nguyên tắc của huy chương thật, nơi
    kim loại sáng và nét khắc đổ bóng. Nhưng ở trạng thái chưa mở, mặt đĩa là
    #4a4a55 và `dark` là #2a2a31: tối trên tối, và glyph biến mất khỏi ảnh chụp.
    Nguyên tắc "khắc chìm" không bê thẳng sang một bảng màu tối được.
  */
  const glyph = earned ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.55)';

  /* Dáng của miền ở hai bán kính; `null` là hình tròn — xem `medalPath`. */
  const rim = medalPath(type, 33);
  const face = medalPath(type, 28);

  /*
    Mốc, viết ngắn cho vừa mặt đĩa.

    10.000 bước thành "10K" chứ không phải "10000" — năm chữ số ở cỡ này thì
    hoặc tràn hoặc phải nhỏ tới mức thôi là mặt huy chương.
  */
  const mark =
    requirement == null ? null : requirement >= 1000 ? `${Math.round(requirement / 1000)}K` : String(requirement);

  const k = size / 72;
  const withGlyph = size >= GLYPH_FLOOR;

  return (
    <View style={{ width: size, height: size }}>
      {/*
        Một cái ĐĨA, không phải một cái vòng.

        Bốn lớp, đúng giải phẫu của huy chương Apple Fitness:

          1. vành ngoài — chuyển màu dọc sáng-trên/tối-dưới, cho cạnh có bề dày
          2. mặt đĩa    — chuyển màu XUYÊN TÂM lệch lên trái, nơi ánh sáng rơi
          3. vệt sáng   — một lát mỏng ở góc trên trái, thứ làm kim loại ra kim loại
          4. glyph      — nét nổi trên mặt kim loại

        Tất cả TĨNH. Bài học mascot là 26 nhóm SVG cập nhật MỖI KHUNG HÌNH — chi
        phí nằm ở chỗ động, không ở chỗ có nhiều nhóm. Bốn lớp không đổi thì vẽ
        một lần rồi thôi.
      */}
      <Svg width={size} height={size} viewBox="0 0 72 72">
        <Defs>
          <SvgGradient id={`rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={m.light} />
            <Stop offset="1" stopColor={m.dark} />
          </SvgGradient>
          <RadialGradient id={`face-${uid}`} cx="36%" cy="30%" r="78%">
            <Stop offset="0" stopColor={m.light} />
            <Stop offset="0.55" stopColor={m.color} />
            <Stop offset="1" stopColor={m.dark} />
          </RadialGradient>
        </Defs>

        {/* Vành và mặt CÙNG một dáng, khác bán kính — mọi hình đều có bề dày
            cạnh, không riêng hình tròn. */}
        {rim ? (
          <Path d={rim} fill={`url(#rim-${uid})`} />
        ) : (
          <Circle cx={36} cy={36} r={33} fill={`url(#rim-${uid})`} />
        )}
        {face ? (
          <Path d={face} fill={`url(#face-${uid})`} />
        ) : (
          <Circle cx={36} cy={36} r={28} fill={`url(#face-${uid})`} />
        )}
        {/* Vệt sáng bám theo đường tròn r=28, nên chỉ đúng cho mặt TRÒN. Các
            dáng khác đã có chuyển màu xuyên tâm làm việc đó. */}
        {!face && (
          <Path d="M 13 30 A 24 24 0 0 1 44 13 A 28 28 0 0 0 13 44 Z" fill="rgba(255,255,255,0.20)" />
        )}
      </Svg>

      {/*
        CON SỐ là mặt của huy chương, glyph chỉ là phụ đề.

        `AWARD_DEFINITIONS` từng gán icon theo `type`, nên cả tám huy chương
        chuỗi ngày dùng chung một ngọn lửa: trong mỗi nhóm mọi đĩa GIỐNG HỆT
        nhau và nhìn vào đĩa không đọc ra được nó là huy chương gì. Ý nghĩa của
        một huy chương CHÍNH LÀ cái mốc, nên mốc phải là thứ lớn nhất trên mặt.

        Huy chương KHÔNG có ngưỡng — "buổi tập đầu tiên", "PR đầu tiên" — thì
        không có số để in, và cũng không cần: chúng vốn đã là duy nhất trong
        nhóm của mình. Chúng giữ glyph, vẽ lớn hơn.
      */}
      <View style={styles.center} pointerEvents="none">
        {mark ? (
          <>
            {withGlyph ? <Icon icon={AwardIcon} size={Math.round(13 * k)} color={glyph} /> : null}
            <Text
              style={[styles.mark, { color: glyph, fontSize: Math.round(22 * k), letterSpacing: -k }]}
              numberOfLines={1}>
              {mark}
            </Text>
          </>
        ) : (
          <Icon icon={AwardIcon} size={Math.round(30 * k)} color={glyph} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /*
    Con số DẬP vào kim loại, không đặt lên trên.

    Một bóng tối lệch xuống một điểm ảnh cho nét chữ một cạnh dưới — đúng thứ
    xảy ra khi chữ được dập chìm và ánh sáng đến từ trên trái, cùng hướng với
    vệt sáng và với chuyển màu xuyên tâm của mặt đĩa.
  */
  mark: {
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    marginTop: -1,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});

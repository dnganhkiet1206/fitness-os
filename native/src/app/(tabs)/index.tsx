import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { nav } from '@/lib/nav';
import * as Haptics from 'expo-haptics';
import {
  Apple,
  Check,
  CircleMinus,
  Pencil,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Heart,
  Pin,
  Plus,
  RotateCcw,
  Sparkles,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import Animated, {
  FadeIn,
  FadeInDown,
  interpolate,
  measure,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActivityRingsCard } from '@/components/ascnd/activity-rings';
import { AmbientLight } from '@/components/ascnd/ambient-light';
import {
  NutritionCard,
  SleepCard,
  StepsWidget,
  WaterWidget,
} from '@/components/ascnd/dashboard-cards';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { iconTint } from '@/constants/icon-tint';
import { PeekHost } from '@/components/ascnd/card-peek';
import { AccountAvatar } from '@/components/ascnd/account-avatar';
import { BrandLockup } from '@/components/ascnd/brand-lockup';
import { DragReorder } from '@/components/ascnd/drag-reorder';
import { SwipeRow } from '@/components/ascnd/swipe-row';
import { StreakChip } from '@/components/ascnd/streak-chip';
import { Mascot } from '@/components/ascnd/mascot';
import { ReadinessAura } from '@/components/ascnd/readiness-aura';
import { ReadinessGauge } from '@/components/ascnd/readiness-gauge';
import { StatusScrim } from '@/components/ascnd/status-scrim';
import {
  ReadinessTrendCard,
  SmartTipsCard,
  SupplementChecklistCard,
  WeightCheckinCard,
} from '@/components/ascnd/today-widgets';
import {
  BiometricsCard,
  RecentAwardsCard,
  TrainingCard,
  WorkoutStatusCard,
} from '@/components/ascnd/today-widgets-2';
import { useCheckAwards, useUpdateChallengeProgress } from '@/hooks/use-extras';
import { BottomTabInset } from '@/constants/expo-template-theme';
import { PressScale } from '@/components/ascnd/press-scale';
import { BOUNCE, duration, spring } from '@/constants/motion';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';

import { HERO_RING, PAGE_TINT, radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles, type PaletteKey } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/** Độ đậm của lớp phủ dưới hero. Đủ để kéo tương phản về một mức, chưa đủ để
 *  giấu nền — vẫn phải nhìn xuyên qua thấy màu của vòng tròn phía trên. */
/**
 * Quãng cuộn để hàng nút trên đầu tắt hẳn.
 *
 * MỘT con số cho cả phép mờ lẫn cổng chạm. Hai con số riêng thì có một dải cuộn
 * mà hàng nút đã vô hình nhưng vẫn ăn cú chạm — một nút không nhìn thấy nuốt
 * mất cú bấm vào vòng tròn phía dưới, và không có gì trên màn hình giải thích
 * được chuyện đó.
 */
/**
 * Độ mờ kính của tấm nội dung. MỘT con số, không phải một phép nội suy.
 *
 * ── vì sao nó thôi chạy theo cuộn ──
 *
 * `intensity` không phải một prop native animate được: mỗi khung hình
 * Reanimated phải cấu hình lại `UIVisualEffectView` bên dưới, và ở đây nó còn
 * nằm trong một `MaskedView` nên mặt nạ phải trộn lại theo. Đó là thứ đắt nhất
 * trên đường cuộn, và nó chạy 60 lần một giây trong suốt cú cuộn — đọc ra là
 * "cuộn hơi giật nhẹ".
 *
 * Cảm giác "càng cuộn càng dày" thì KHÔNG mất: lớp phủ vẫn đậm dần trên đúng
 * quãng cũ, và độ mờ của một lớp màu gần như miễn phí so với việc dựng lại một
 * hiệu ứng kính. Cùng một câu chuyện, kể bằng thứ rẻ hơn.
 *
 * Giữ ở mức mạnh vì đó là điều đã yêu cầu: kính phải đủ dày để vệt sáng của
 * vòng tròn thôi lẫn vào các nút.
 */
/**
 * Độ mờ của lớp kính tấm nội dung.
 *
 * ── 70 chính là "đường kẻ" đã bị báo ba lần ──
 *
 * `expo-blur` cài `intensity` bằng cách giữ một `UIViewPropertyAnimator` ở
 * `fractionComplete`, thứ scale CẢ bán kính blur LẪN sắc của vật liệu. Nên một
 * con số lớn không phải là kính dày hơn — nó là một phần lớn hơn của một tấm
 * kính đục. Trên một trang gần như đen, vật liệu ấy LÀM SÁNG nền lên thành một
 * dải xám.
 *
 * Đo trên ảnh chụp thật của harness, cột dọc ngay dưới hàng chấm: nền đi từ
 * (7,7,8) lên (72,72,73) trong ba mươi dòng. Không có bước nhảy nào — nhưng một
 * dải sáng dần rồi tối lại thì vẫn có MÉP, và mắt đọc mép đó là một đường kẻ
 * cắt ngang ngay dưới mấy cái chấm. Ba lần sửa hình học trước đó không chạm
 * được vào nó, vì nó không phải chuyện bố cục.
 *
 * `status-scrim.tsx` đã trả giá cho đúng con số này và ghi lại: "Fifty is the
 * default and far too much. The numbers people reach for when they want the
 * effect to be obvious — 60, 80, 100 — are what make a backdrop read as an
 * overlay." Nó dùng 30. Đây là mặt lớn hơn nên 36, nhưng cùng một phía của lằn
 * ranh ấy.
 *
 * Và nó cũng rẻ hơn: bán kính nhỏ hơn là ít việc hơn cho mỗi điểm ảnh, trên
 * đúng lớp đắt nhất của đường cuộn.
 */
const SHEET_BLUR = 36;

/**
 * Quãng hàng nút đi lên khi nó rời đi.
 *
 * ── vì sao bằng đúng chiều cao của chính nó cộng lề ──
 *
 * Nó phải ra HẲN khỏi mép trên, không phải nhích lên rồi mờ tại chỗ. Một thứ
 * mờ tại chỗ đọc ra là bị tắt; một thứ đi ra khỏi mép đọc ra là rời đi. Đó là
 * cả khác biệt mà hai vòng trước tôi đã không tạo ra được.
 */
/**
 * Chiều cao hàng nút, tức chỗ nó từng chiếm khi còn nằm trong dòng chảy.
 *
 * Ghim nó ra khỏi vùng cuộn là lấy mất chiều cao đó khỏi bố cục, nên nội dung
 * bị kéo lên nằm dưới hàng nút. Cộng lại vào `paddingTop` là trả đúng chỗ cũ.
 * Bằng đúng cạnh của `squareBtn` — hàng chỉ cao bằng nút cao nhất trong nó.
 */
const TOP_BAR_H = 44;

/**
 * Quãng hàng nút đi lên khi nó rời đi.
 *
 * ── vì sao bằng đúng chiều cao của chính nó cộng lề ──
 *
 * Nó phải ra HẲN khỏi mép trên, không phải nhích lên rồi mờ tại chỗ. Một thứ
 * mờ tại chỗ đọc ra là bị tắt; một thứ đi ra khỏi mép đọc ra là rời đi. Đó là
 * cả khác biệt mà hai vòng trước tôi đã không tạo ra được.
 *
 * Khai SAU `TOP_BAR_H` chứ không trước: một hằng số module đọc một hằng số nằm
 * dưới nó là ReferenceError ngay lúc nạp tệp, và bản nháp đầu của dòng này đã
 * đúng như vậy.
 */
const TOP_BAR_LIFT = TOP_BAR_H + spacing.sm;

const SCRIM = 0.62;
/** Độ mờ của lớp phủ khi tấm còn nằm dưới hero, nhân với `SCRIM` — cho ra 0.42,
 *  đúng mức cũ. Xem ghi chú ở `scrimFade` về vì sao nó phải đổi theo cuộn. */
const SCRIM_REST = 0.68;
/** Chiều cao dải chuyển ở mép trên lớp phủ. Cùng con số với `TRAIL` của
 *  `card-deck.tsx`: hai lớp mờ gặp nhau ở đúng vùng này nên chúng tắt dần trên
 *  cùng một quãng, nếu lệch thì chỗ chồng nhau lộ ra thành một dải đậm hơn. */
const SCRIM_FADE = 72;
/**
 * Quãng lớp kính tắt dần ở đáy.
 *
 * Cộng THÊM vào dưới quãng đang dùng chứ không cắt vào nó, nên nó không đổi một
 * điểm nào của vùng phủ. Dài hơn dải trên (72) vì dải trên còn phải nhường chỗ
 * cho chữ ngay bên dưới nó, còn dưới đáy thì chỉ có nền — mà một dốc dài thì
 * không có hàng nào lệch với hàng bên cạnh đủ để nhìn ra.
 */
const GLASS_TAIL = 96;
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useHealthSync } from '@/hooks/use-health-sync';
import { useReminderSync } from '@/hooks/use-reminders';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { TodaySkeleton } from '@/components/ascnd/skeleton';
import { useTodayTrainingMinutes } from '@/hooks/use-fitness-data';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { useTodayWater } from '@/hooks/use-water';
import { useStepsGoal } from '@/hooks/use-steps-goal';
import type { QuestKey } from '@/lib/mascot-room';
import { Glyph, GLYPH_TINT } from '@/components/ascnd/assistant-icons';
import { LiquidGlass } from '@/components/ascnd/liquid-glass';
import { isCustomGroup, useWidgetConfig, WIDGET_META, type WidgetKey } from '@/hooks/use-widget-config';
import { CardDeck } from '@/components/ascnd/card-deck';
import { Expander } from '@/components/ascnd/expander';
import { EmptyHero, NutritionHero, SleepHero, WaterHero } from '@/components/ascnd/hero-pages';
import { HERO_DECK, recordHeight } from '@/lib/widget-heights';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';
import { armTabBarRestore, topChromeVisible, tabScrollFrame } from '@/lib/tab-bar-visibility';

/**
 * Stored group icons are emoji strings (persisted configs) — map them to
 * code-drawn lucide icons with a neon accent, Apple-Settings style.
 */
/**
 * Quãng cuộn mà hero tắt hẳn trong đó.
 *
 * Đặt bằng đường kính vòng tròn: khi bạn đã cuộn qua đúng chiều cao của thứ
 * đang nhìn thì thứ đó không còn lý do gì để còn ở đó. Một con số cố định chứ
 * không phải một tỉ lệ màn hình, vì thứ nó đo là VÒNG TRÒN, và vòng tròn có
 * cùng một cỡ trên mọi máy.
 */
const HERO_FADE = HERO_RING;

/**
 * Hero giữ nguyên độ đậm trong quãng đầu này trước khi bắt đầu mờ.
 *
 * Bản trước mờ ngay từ pixel cuộn đầu tiên và tắt hẳn ở 216 — tức là chỉ cần
 * nhích ngón tay là con số đang đọc đã nhạt đi. Một cú cuộn nhỏ thường không
 * phải "tôi xong với cái này rồi", nó là "tôi muốn xem có gì bên dưới"; thứ
 * đang nhìn không nên phản ứng với ý định đó.
 *
 * Nên nó đứng nguyên cho tới khi bạn đã cuộn qua một phần ba vòng tròn, rồi mới
 * mờ, và mờ hết ở NGOÀI chiều cao vòng tròn — sau lúc tấm đã che xong, chứ
 * không phải trước.
 */
const HERO_HOLD = HERO_RING * 0.34;

/**
 * Bao lâu không ai chạm thì nhân vật đứng hình.
 *
 * Xem đoạn dài ở `wake` bên dưới: 20 giây dài hơn mọi lần liếc mắt và ngắn hơn
 * mọi lần để máy đó. Ở đây chứ không nằm trong thân component, vì nó là một
 * quyết định về sản phẩm chứ không phải một con số của một lần render.
 */
const IDLE_MS = 20_000;

/**
 * Quãng cuộn mà tấm nội dung phủ kín hero trong đó.
 *
 * Tên cũ là HERO_COVER_FRACTION và nó nói về một hiệu ứng MỜ không còn tồn tại —
 * hero không tan đi nữa, nó bị che. Một hằng số mang tên của cơ chế đã bị thay
 * là thứ người đọc sau sẽ tin.
 *
 * Neo vào chiều cao MÀN HÌNH, không vào đường kính vòng tròn: thứ quyết định
 * tấm phải đi bao xa mới che hết phần đang nhìn thấy là phần đang nhìn thấy,
 * và nó khác nhau ở mỗi máy.
 */
const HERO_COVER_FRACTION = 0.66;

/* `intensity` là một prop chứ không phải một style, nên nó phải đi qua
   `animatedProps`; `useAnimatedStyle` không chạm tới được. */

/*
  Màu lấy từ `iconTint`, KHÔNG gõ tay ở đây.

  Bảng này từng tự khai màu cho mỗi nhóm, và nó lệch với `constants/icon-tint`
  ngay ở cái tạ: bảng tint nói `Dumbbell` là TRAINING (xanh dương), bảng này
  nói cam. Trên màn Hôm nay hai cái tạ nằm cách nhau vài chục điểm ảnh — một
  cam ở tiêu đề nhóm, một xanh ở dòng buổi tập gần nhất — và người dùng chụp
  lại đúng chỗ đó.

  `icon-tint.ts` TỒN TẠI để chấm dứt chuyện này; comment đầu tệp ấy ghi lại
  rằng `Dumbbell` từng là bạc ở ba chỗ và xám 35% ở chỗ thứ tư. Bảng này đi
  vòng qua nó, nên nó lại thành chỗ thứ năm.

  Nếu hai nhóm ra cùng một màu thì đó là tín hiệu đổi ICON của nhóm, không
  phải đè màu — đè màu là cách bảng tint bị vô hiệu hoá lần nữa.
*/
/*
  Cả năm ô giữ KHOÁ bảng màu, và `null` nghĩa là "màu trung tính của theme".

  `iconTint()` nay trả về `PaletteKey` chứ không phải mã màu — bảng tint đã hết
  đóng băng. Bảng này vẫn cất thứ nó trả về, nên nó cũng cất khoá; chỗ vẽ ở
  `GroupIconBadge` là nơi duy nhất có `c` để giải ra màu.

  Lỗi mà chuyển đổi này SUÝT để lại: `alpha(tint, 0.12)` với `tint` là chuỗi
  `"readinessRed"` biên dịch trót lọt — một khoá cũng là một `string` — và ném
  lúc chạy, làm trắng cả màn hình Hôm nay. `alpha()` NÉM thay vì đoán, và đó là
  lý do nó lộ ra ở lần chạy đầu thay vì thành một mảng màu sai lặng lẽ.
*/
const GROUP_ICONS: Record<string, { icon: LucideIcon; color: PaletteKey | null }> = {
  '❤️': { icon: Heart, color: iconTint(Heart)! },
  '🍎': { icon: Apple, color: iconTint(Apple)! },
  '💪': { icon: Dumbbell, color: iconTint(Dumbbell)! },
  '✨': { icon: Sparkles, color: iconTint(Sparkles)! },
  /* `Pin` không có trong bảng tint — nó là ghim, không mang nghĩa miền nào.
     Nhóm "khác" giữ màu trung tính của chính nó. */
  '📌': { icon: Pin, color: null },
};

/** Neon-tinted icon chip for a widget group */
function GroupIconBadge({ iconKey }: { iconKey: string }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const meta = GROUP_ICONS[iconKey] ?? GROUP_ICONS['📌'];
  const tint = meta.color ? c[meta.color] : c.mutedForeground;
  return (
    <View style={[styles.groupIconBadge, { backgroundColor: alpha(tint, 0.12) }]}>
      <Icon icon={meta.icon} size={13} color={tint} />
    </View>
  );
}

/**
 * Section header — web WidgetGroupSection: icon chip + semibold title.
 *
 * `action` là chỗ cho nút Sửa, và nó chỉ được truyền cho mục ĐẦU TIÊN — xem
 * chỗ dựng danh sách mục. Ô này nhận một `ReactNode` chứ không nhận một cờ
 * `showEdit`: hàng tiêu đề không cần biết cái nút ấy làm gì.
 */
function GroupHeader({
  icon,
  title,
  action,
}: {
  icon: string;
  title: string;
  action?: React.ReactNode;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <View style={styles.groupHeader}>
      <GroupIconBadge iconKey={icon} />
      {/* `flex: 1` nằm trên CHỮ, không phải một ô đệm riêng: tiêu đề dài thì nó
          xuống dòng trong phần bề rộng còn lại thay vì đẩy nút Sửa ra khỏi mép. */}
      <Text style={styles.groupTitle}>{title}</Text>
      {action}
    </View>
  );
}

/**
 * Nút Sửa bố cục — icon cộng chữ, phẳng, không viền không nền.
 *
 * ── vì sao đổi hình dạng khi đổi chỗ ──
 *
 * Ở góc trên nó là một ô 44×44 có viền, đứng cạnh hai ô 44×44 khác — nó là một
 * trong ba thứ ngang hàng nhau. Ở hàng tiêu đề mục thì không còn gì ngang hàng
 * với nó cả: bên trái là một cái huy hiệu 22 điểm và một dòng chữ 14 điểm. Bê
 * nguyên cái ô có viền xuống đây là đặt một vật nặng gấp đôi mọi thứ quanh nó
 * lên một hàng vốn chỉ để đọc lướt.
 *
 * Cái đi xuống là VIỀN và NỀN, không phải cái icon. Phẳng là cách iOS làm ở
 * đúng vị trí này (Danh sách, Nhắc nhở, Wallet) — nó đọc ra là "một việc bạn
 * có thể làm với mục này" chứ không phải "một nút nữa".
 *
 * ── và vì sao vẫn có icon ──
 *
 * Bản đầu chỉ có chữ, và người dùng bác: *"vẫn phải có icon bên cạnh chữ sửa
 * để người ta hiểu"*. Họ đúng, và lý do nằm ở chính chỗ nó đứng. Hàng này có
 * một huy hiệu icon ở đầu, nên một chữ đơn độc ở cuối hàng đọc ra là NHÃN —
 * cùng loại với chữ "Sức khoẻ" bên trái, chỉ nhạt hơn. Cái icon là thứ nói
 * rằng đây là một nút, trước cả khi người ta đọc chữ.
 *
 * 14 điểm cạnh chữ 13: nhỉnh hơn chiều cao chữ hoa một chút, nên hai thứ nằm
 * trên cùng một đường và cái icon không đọc ra như một dấu chấm câu.
 *
 * ── vùng chạm vẫn 44 ──
 *
 * Chữ chỉ cao 18 điểm. `hitSlop` bù phần còn thiếu ra bốn phía, nên vùng chạm
 * đủ sàn của Apple mà không phải độn `padding` — độn sẽ đẩy hàng tiêu đề cao
 * lên và làm hỏng nhịp dọc của cả trang. `tools/tap-targets.mjs` đo cái này.
 */
function EditLayoutButton({
  label,
  a11yLabel,
  onPress,
}: {
  label: string;
  /* Nhãn HIỆN là "Sửa" — đủ trong ngữ cảnh của hàng, vì mắt thấy cả tiêu đề
     mục ngay bên trái. Trình đọc màn hình đọc từng phần tử rời nhau, nên nó
     cần câu đầy đủ: "Sắp xếp lại bảng điều khiển". */
  a11yLabel: string;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      hitSlop={{ top: 13, bottom: 13, left: 12, right: 12 }}
      onPress={onPress}>
      <View style={styles.groupActionRow}>
        <Icon icon={Pencil} size={14} color={c.mutedForeground} />
        <Text style={styles.groupAction}>{label}</Text>
      </View>
    </PressScale>
  );
}

export default function TodayScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  /**
   * `isPending` is what stops the page shifting under you as it loads.
   *
   * Nearly every widget picks between a short "nothing logged" card and a much
   * taller real one — the readiness gauge alone is a 208pt ring against a ~100pt
   * placeholder. Rendering the placeholders first and swapping them as the query
   * lands moves everything below by a couple of hundred points, which is the
   * page drifting. The widgets are held back until there is an answer, so each
   * one mounts once at its final height and the cascade runs on a layout that
   * does not move afterwards.
   *
   * The wait is not felt in practice: the query cache is persisted to storage
   * (see `query-client`), so on any warm start the data is already there and
   * this is false on the first render.
   */
  const { data: dailyLog, isPending: dayPending, isError: dayFailed } = useDailyLog();
  /* Cùng biểu thức mà JSX dùng để quyết định có dựng các thẻ nhóm hay không —
     một chỗ, để cờ `cascaded` không thể nói về một điều kiện khác với thứ nó
     đang đếm. */
  const groupsUp = !dayPending && !dayFailed;
  const { data: sleep } = useTodaySleep();
  const { data: waterMl } = useTodayWater();
  const { available: healthAvailable, sync: healthSync } = useHealthSync();
  const { lang } = useAppSettings();
  const { user } = useAuth();
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const { config, editMode, setEditMode, moveWidget, moveGroup, moveGroupTo, removeGroup, addGroup, resetConfig } =
    useWidgetConfig();
  const { goal: stepsGoal } = useStepsGoal();
  // Reminders are dated one-shots, so the schedule has to be rebuilt as the day
  // is lived — see `useReminderSync`.
  useReminderSync();
  const [newGroupName, setNewGroupName] = useState('');

  // Pull-to-refresh (web PullToRefresh: invalidate everything)
  const [refreshing, setRefreshing] = useState(false);
  /** Đã qua lần dựng đầu chưa — xem ghi chú ở `styles.sheet` về vì sao hiệu ứng
   *  vào phải im lặng ở lần đầu tiên. */
  /* Id của gradient là TOÀN CỤC trên native, không cục bộ trong `<Svg>` khai ra
     nó — hai màn hình cùng mounted sẽ dùng chung cái đăng ký sau cùng.
     `status-scrim.tsx` ghi repo này đã dính ba lần; `useId` là luật. */
  const sheetMask = `sheetBlurMask-${useId()}`;
  /* Id riêng cho dải tắt ở đáy. Id của gradient là TOÀN CỤC trên native, nên
     hai gradient dùng chung một tên thì cái đăng ký sau vẽ cho cả hai. */
  const sheetTail = `sheetBlurTail-${useId()}`;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const onRefresh = useCallback(async () => {
    // The gesture has no button to press, so the tap it never gets is repaid
    // here: the pull is confirmed the moment it takes, not when data lands.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    /* `finally`, không phải hai dòng gán: lời hứa kia hỏng thì vòng xoay quay
       mãi trên một trang không còn tải gì — một vòng xoay không bao giờ dừng
       là lời nói dối lâu hơn cả một cú kéo không làm gì. Cùng luật với
       `screen.tsx`, nơi ba mươi màn còn lại lấy cú kéo của chúng. */
    try {
      await queryClient.invalidateQueries();
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  // Auto-grant awards once per session (web Index does this on mount)
  const { checkAndGrant, ready: awardsReady } = useCheckAwards();
  // Re-check awards every time Today regains focus (e.g. after closing a
  // log sheet), not just on first mount — Today stays mounted across the
  // log flow, so a milestone earned mid-session would otherwise not fire
  // its celebration until a remount. The grant engine is duplicate-safe
  // and only celebrates fresh grants, so re-running on focus is safe.
  const awardCheckInFlight = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!awardsReady || awardCheckInFlight.current) return;
      awardCheckInFlight.current = true;
      checkAndGrant().finally(() => {
        awardCheckInFlight.current = false;
      });
    }, [awardsReady, checkAndGrant]),
  );

  /**
   * Weekly challenge progress, on the same focus as awards.
   *
   * It only ever ran from the Challenges screen, which is one tap inside the
   * Progress tab. So a week of five workouts left the challenge sitting at
   * zero until the user happened to go and look — and then it jumped from 0 to
   * done and celebrated, which is a reward for opening a screen rather than
   * for the week that earned it. Awards were already checked here; challenges
   * are its sibling and were not.
   *
   * The run is cheap now: the per-challenge reads go out together, and a pass
   * that finds nothing changed writes nothing at all. The in-flight guard is
   * the same one awards use — focus fires on every return from a log sheet.
   */
  const challengeRunInFlight = useRef(false);
  const challengeProgress = useUpdateChallengeProgress();
  useFocusEffect(
    useCallback(() => {
      if (challengeRunInFlight.current) return;
      challengeRunInFlight.current = true;
      challengeProgress
        .mutateAsync()
        .catch(() => {})
        .finally(() => {
          challengeRunInFlight.current = false;
        });
      // `challengeProgress` is a fresh object each render; depending on it
      // would re-run this on every render rather than on every focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const now = new Date();
  const greeting =
    now.getHours() < 12 ? i18n.goodMorning : now.getHours() < 18 ? i18n.goodAfternoon : i18n.goodEvening;
  const userName = profile?.name || i18n.authYourName;

  // Readiness (same mapping as web Index)
  const readinessScore = dailyLog?.readiness_score != null ? Math.round(Number(dailyLog.readiness_score)) : null;
  const readinessStatus = (dailyLog?.readiness_status as 'green' | 'yellow' | 'red') || 'yellow';

  /* Một giá trị, hai thứ đọc nó: deck dịch các trang, còn nền đổi màu. Sở hữu ở
     đây chứ không ở trong deck, vì thứ cần nó nằm NGOÀI deck. */
  const deckAt = useSharedValue(0);

  /**
   * Chế độ tập trung: chi tiết của một vòng tròn đang mở.
   *
   * Nó ẩn Koa, bốn nút ghi và toàn bộ các nhóm thẻ. Đó là chủ ý chứ không phải
   * tác dụng phụ: khi bạn đã hỏi "vì sao 74", thì mười hai thẻ khác trên trang
   * là mười hai câu trả lời cho những câu hỏi khác. Trang trả lời đúng một câu
   * tại một thời điểm.
   *
   * State nằm ở đây chứ không trong thẻ, vì thứ nó điều khiển nằm ở đây.
   */
  /**
   * Trang hero nào đang MỞ CHI TIẾT — một chỉ số, không phải một boolean.
   *
   * ── lỗi nó sửa ──
   *
   * Đây từng là `heroOpen: boolean`, và nó được truyền cho CẢ SÁU thẻ. Mở chi
   * tiết một thẻ là mở chi tiết sáu thẻ: sáu khối số cùng bung ra, sáu trang
   * cùng cao lên, và `card-deck` lấy trang cao nhất làm chiều cao chung. Khoảng
   * trống dọc và rò rỉ trạng thái giữa các thẻ là CÙNG MỘT LỖI nhìn từ hai
   * phía — một biến trạng thái dùng chung cho những thứ đáng lẽ độc lập.
   *
   * `null` = không thẻ nào mở. Số = đúng thẻ đó, và chỉ thẻ đó.
   */
  const [expandedAt, setExpandedAt] = useState<number | null>(null);
  /* Trang hero đang xem. Chỉ dùng để quyết định dựng lớp aura nào — xem chỗ
     vẽ `AuraLayer`. Deck báo về khi cú vuốt đã CHỐT, không phải mỗi khung. */
  const [heroPage, setHeroPage] = useState(0);
  /* Câu hỏi "có thẻ nào đang mở không" — thứ mà tấm nội dung và hiệu ứng cuộn
     cần biết. Chúng không cần biết là thẻ NÀO. */
  const heroOpen = expandedAt !== null;

  /**
   * Cascade thẻ thông tin chạy ĐÚNG MỘT LẦN — lần app dựng chúng đầu tiên.
   *
   * ── lỗi ──
   *
   * Mỗi thẻ nhóm mang
   * `entering={FadeInDown.springify().delay((heroWidgets.length + gi + wi) * 70)}`,
   * và các thẻ ấy bị tháo khỏi cây rồi dựng lại. Mỗi lần dựng lại là cả cascade
   * chạy lại: từng thẻ bay lên từ dưới, lệch nhau 70ms, kéo dài quá nửa giây.
   *
   * Một hiệu ứng vào kể chuyện "cái này vừa tới". Đúng ở lần mở app — lúc ấy nó
   * vừa tới thật. Sai ở mọi lần sau, vì nó chưa đi đâu cả; nó chỉ bị che.
   *
   * ── chế độ tập trung THÔI tháo chúng ──
   *
   * Lý do đầu tiên viết ra ở đây là "mỗi lần ĐÓNG thẻ chỉ số, cả dashboard dựng
   * lại". Nay tấm nội dung đi bằng `Expander` chứ không bằng một cái cổng, nên
   * các thẻ ở nguyên trong cây suốt cả hai chiều và cascade không còn cách nào
   * chạy lại vì lý do đó.
   *
   * Cờ này vẫn còn việc: `dayPending` vẫn lật được sau một lần đọc hỏng rồi
   * thử lại, và lần dựng lại ấy vẫn không phải một lần "vừa tới". Nên điều kiện
   * bây giờ đúng bằng `groupsUp` — CÙNG biểu thức mà JSX dùng, không thêm một
   * vế nào mà JSX không có.
   *
   * ── vì sao là state chứ không phải `mounted` ──
   *
   * `mounted` thành true ngay sau lần commit đầu, mà lần commit đầu thường là
   * lúc `dayPending` còn true — các thẻ nhóm CHƯA có mặt. Gắn vào `mounted` sẽ
   * giết luôn cascade ở lần mở app, tức bỏ mất đúng cái lần duy nhất nó đúng.
   *
   * Nên cờ này bám vào chính sự kiện cần đếm: các thẻ nhóm đã hiện ra lần nào
   * chưa. Ghi trong `useEffect` chứ không ghi thẳng trong thân render, để lần
   * render đang dựng chúng vẫn còn đọc được `false`.
   */
  const [cascaded, setCascaded] = useState(false);
  useEffect(() => {
    if (groupsUp) setCascaded(true);
  }, [groupsUp]);

  /**
   * Trang đã cuộn được bao xa, đọc trên UI thread.
   *
   * Cần nó để phần dưới TRƯỢT ĐÈ lên hero thay vì hai thứ cùng đi lên một tốc
   * độ. `onScroll` thường của React Native trả về ở JS thread, và một hiệu ứng
   * bám ngón tay chạy qua đó thì trễ đúng một nhịp — thấy được, và đúng thứ
   * `swipe-row.tsx` đã ghi: một chỉ báo tường thuật KẾT QUẢ của cử chỉ là một
   * cảm giác khác hẳn với một chỉ báo tường thuật CỬ CHỈ.
   */
  const scrollY = useSharedValue(0);

  /*
    Chiều cao khung nhìn và mức cuộn tối đa, để tự-cuộn khi kéo biết mép ở đâu
    và biết lúc nào phải dừng. Đọc từ chính sự kiện cuộn — `layoutMeasurement`
    và `contentSize` đi kèm mỗi sự kiện — nên không tốn thêm phép đo nào.

    Khai ở ĐÂY, cạnh `scrollY`, chứ không ở chỗ dùng: worklet cuộn bên dưới đọc
    chúng, và một worklet bắt biến nó tham chiếu ngay lúc hook được gọi — khai
    xuống dưới là vùng chết tạm thời và app ra trắng trước khi vẽ. Bản nháp đầu
    của đúng hai dòng này khai ở dòng 866 trong khi worklet dựng ở dòng 622;
    `tools/worklet-tdz.mjs` bắt được.
  */
  const viewportH = useSharedValue(0);
  const maxScroll = useSharedValue(0);
  /* Đọc một lần ở JS, dùng trong worklet như một hằng số — không phải shared
     value, vì chiều cao màn hình không đổi giữa hai frame. */
  /* Quãng cuộn đủ để tấm phủ kín hero. Neo vào chiều cao màn hình vì đó là thứ
     quyết định tấm phải đi bao xa mới che hết phần đang nhìn thấy. */
  const cover = useWindowDimensions().height * HERO_COVER_FRACTION;
  /*
     Khai báo TRƯỚC `onScroll`, và thứ tự đó là bắt buộc chứ không phải cho gọn.

     `useAnimatedScrollHandler` dựng worklet NGAY lúc gọi và bắt các biến nó
     tham chiếu. Đặt một biến nó đọc ở BÊN DƯỚI thì lúc worklet được dựng, biến
     còn trong vùng chết tạm thời — `ReferenceError` ngay trong render, và cả
     trang ra trắng. (Ca cụ thể hồi đó là `barGoneSV`, thứ đã bỏ hẳn cùng React
     state của nó; `cover` ngay trên đây vẫn nằm dưới cùng một luật.)

     TypeScript không bắt được: tham chiếu nằm trong một callback, nên nó không
     chứng minh được callback chạy lúc nào. Bản đầu của thay đổi này đã đi qua
     `tsc` sạch và tám guard xanh, rồi dựng ra một cây DOM rỗng — canary của
     `live.mjs` là thứ duy nhất thấy.
  */
  /*
    ── `barGone` từng là React state, và đó là cú giật còn lại ──

    Nó chỉ dùng cho MỘT việc: đặt `pointerEvents` của hàng nút trên đầu, để khi
    hàng đã mờ hẳn thì nó thôi ăn chạm. Nhưng nó là state, và nó được ghi TỪ
    trình xử lý cuộn — nên mỗi lần vượt mốc `TOP_BAR_FADE` là một lần dựng lại
    TOÀN BỘ màn Today: cả deck, cả năm trang hero, cả dashboard.

    Mốc ấy bị vượt ở CẢ HAI CHIỀU — kéo xuống qua 56, rồi cuộn ngược lên qua 56
    — nên cú dựng lại rơi đúng vào giữa đà, đúng hai lúc đã bị báo: "giật khi
    cuộn thông tin từ dưới lên và khi kéo mạnh xuống".

    `pointerEvents` là một thuộc tính STYLE từ React Native 0.71, nên nó đi được
    vào chính worklet đang tính độ mờ của hàng ấy. Cùng một giá trị, cùng một
    nơi, không còn React ở giữa: đường cuộn của Today giờ không ghi state lần
    nào nữa.
  */

  /**
   * Nhân vật đứng hình trong lúc trang đang cuộn.
   *
   * ── cú giật còn lại, và nó đã được chẩn đoán ở một màn khác ──
   *
   * Koa trên dashboard là một `KoaFigure`, và `KoaFigure` chạy một
   * `useFrameCallback` nuôi 36 vòng chuyển động ở nhịp của màn hình — tới 120
   * khung hình một giây. Chú thích của chính nó gọi đó là "cost driver của cả
   * nhân vật: mọi lớp có hiệu ứng đều tính lại khi nó nhích", và nói rõ cổng
   * duy nhất là `animated`, do CHỖ GỌI chịu trách nhiệm.
   *
   * Chỗ gọi ở đây truyền `animated={focused}` — đúng cho việc chuyển tab, và
   * vô nghĩa trong lúc cuộn: đang xem dashboard thì `focused` luôn true. Nên
   * suốt mỗi cú vuốt, cái rig ấy vẫn chạy hết công suất trên đúng luồng UI
   * đang phải trộn lại lớp kính của tấm, bốn viên quick-log, dải trên đỉnh, và
   * ba `useAnimatedStyle`.
   *
   * Chi phí của nó KHÔNG đều: 36 vòng có chu kỳ khác nhau (chớp mắt, nhịp thở,
   * nghiêng người, đưa mắt), nên có những khung hình nhiều lớp cùng động và
   * đắt hơn hẳn những khung hình khác. Đó đúng là hình dạng của "thỉnh thoảng
   * cuộn vẫn còn hơi giật nhẹ" — một cú hụt lác đác chứ không phải chậm đều.
   *
   * `mascot-room.tsx` đã gặp đúng lỗi này và ghi lại: *"một cú cuộn (bắt đầu
   * và dừng) là phần còn lại của cú giật"*. Cơ chế có từ đó; ở dashboard chưa
   * ai nối nó.
   *
   * ── vì sao ở đây không cần hẹn giờ như mascot-room ──
   *
   * Màn đó cuộn bằng `onScroll` của JS và phải dùng một `setTimeout` 120ms để
   * biết lúc nào đà đã hết. Ở đây bộ xử lý cuộn là worklet, nên bốn sự kiện
   * biên của `UIScrollView` đọc được thẳng trên luồng UI: kéo bắt đầu, kéo
   * kết thúc, đà bắt đầu, đà kết thúc. Không một chuyến sang JS nào, và không
   * một hẹn giờ nào — đúng hướng mà cả đường cuộn của màn này đã đi trong
   * phiên này.
   *
   * Cặp `onEndDrag` → thả / `onMomentumBegin` → giữ lại là CÓ CHỦ Ý chứ không
   * phải thừa: một cú kéo chậm rồi thả tay KHÔNG sinh đà, nên nó không bao giờ
   * nhận `onMomentumEnd`, và nếu chỉ dựa vào đà thì nhân vật sẽ đứng hình vĩnh
   * viễn. Thả ở `onEndDrag` khiến trường hợp xấu nhất là nhân vật chạy sớm một
   * khung hình, chứ không phải một nhân vật thôi thở.
   */
  /*
    ── bốn lý do, MỘT kết quả ──

    Giá trị này từng tên là `scrollPause` và chỉ có một lý do. Nay có bốn, và ba
    trong số đó không phải cuộn — nên cái tên đã đổi, và quan trọng hơn: các lý
    do được TÁCH khỏi kết quả.

    Bản trước mỗi chỗ tự ghi thẳng vào cờ chung: `onBeginDrag` ghi true,
    `onEndDrag` ghi `focusSV.value === 1`. Tức mỗi người viết phải nhớ OR đủ mọi
    lý do KHÁC của mình — và tôi đã suýt sót đúng chuyện đó khi thêm lý do thứ
    hai. Với bốn lý do thì đó không còn là "suýt".

    Nên mỗi lý do có cờ riêng, và `hold` là phép OR viết ra ĐÚNG MỘT LẦN. Thêm
    lý do thứ năm chỉ cần thêm một cờ và một vế; không chỗ nào khác phải sửa.
  */
  /** ngón tay đang kéo, hoặc đà chưa hết */
  const dragging = useSharedValue(false);
  /** đã cuộn qua khỏi nhân vật — nó còn trong cây nhưng không ai thấy */
  const offscreen = useSharedValue(false);
  /** không ai chạm vào màn hình đủ lâu */
  const idle = useSharedValue(false);

  /* Chế độ tập trung tắt hẳn hiệu ứng theo cuộn.

     Khi chi tiết đang mở thì hero VÀ khối số của nó chính là nội dung — cuộn
     xuống là để đọc tiếp, không phải để rời đi. Làm mờ thứ người ta đang đọc là
     trả lời sai câu hỏi họ vừa hỏi.

     ── vì sao nó khai Ở ĐÂY chứ không ở chỗ dùng ──

     `onScroll` bên dưới ĐỌC nó, và một worklet tham chiếu biến ngay lúc hook
     được gọi. Khai sau `useAnimatedScrollHandler` thì worklet bắt phải một biến
     chưa tồn tại — cùng ràng buộc mà `viewportH`/`maxScroll` ở trên đã phải
     tuân theo. */
  const focusSV = useSharedValue(0);
  useEffect(() => {
    focusSV.value = heroOpen ? 1 : 0;
  }, [heroOpen, focusSV]);

  /**
   * "Đứng hình đi, không ai nhìn thấy bạn động đâu."
   *
   * Bốn lý do gộp ở đúng một chỗ. `koa-figure` đọc nó trên luồng UI và GIỮ
   * `last` hiện hành, nên nhân vật dừng ở đúng khung hình nó đang ở và chạy
   * tiếp không giật — cùng một hành vi cho cả bốn, nên không có từ vựng chuyển
   * động nào mới được phát minh ra ở đây.
   */
  const hold = useDerivedValue(
    () => dragging.value || offscreen.value || idle.value || focusSV.value === 1,
  );

  /*
    ── lý do 3: nhân vật đã cuộn khỏi tầm nhìn ──

    Lớp aura có luật "ngoài màn thì dừng" và `aura-cost.mjs` canh nó. Nhân vật
    thì chưa có, nên nó chạy ở nhịp màn hình suốt cả nửa dưới của trang — nơi nó
    đã ra khỏi khung nhìn từ lâu. Cùng một app, cùng một luật, một bên tuân một
    bên không.

    Đo MỘT LẦN mỗi cú cuộn, không phải mỗi khung hình: trong lúc cuộn thì
    `dragging` đã giữ nó rồi, nên câu hỏi chỉ cần trả lời đúng lúc cú cuộn DỪNG.
    `measure()` của Reanimated chạy ngay trong worklet nên không có chuyến nào
    sang JS.

    `null` là "không đo được", và ở đó câu trả lời an toàn là KHÔNG giữ: đóng
    băng một thứ có thể đang hiện ra là lỗi tệ hơn hẳn cái đang được sửa.
  */
  const koaRef = useAnimatedRef<Animated.View>();
  const settleOffscreen = () => {
    'worklet';
    const m = measure(koaRef);
    offscreen.value = m === null ? false : m.pageY + m.height <= 0 || m.pageY >= viewportH.value;
  };

  /*
    ── lý do 4: không ai chạm vào gì cả ──

    Đây là trạng thái MẶC ĐỊNH của một app đang mở lâu, và là toàn bộ nội dung
    của báo cáo "máy nóng khi mở lâu". Nhân vật thở mãi trong lúc màn hình đứng
    yên; đo được ~605 lần ghi style mỗi giây chỉ riêng nó.

    20 giây, và con số ấy là một đánh đổi có hai đầu. Ngắn hơn thì nhân vật đứng
    hình trong lúc người ta còn đang ĐỌC dashboard, và một nhân vật đông cứng
    giữa lúc nhìn đọc ra là app treo. Dài hơn thì phần lớn thời gian máy nóng
    vẫn nằm ngoài tầm với. Hai mươi giây dài hơn mọi lần liếc mắt và ngắn hơn
    mọi lần để máy đó.

    Hình dạng của cú dừng KHÔNG mới: nó đúng bằng cú đông cứng mà mỗi lần cuộn
    đã làm từ lâu — giữ nguyên khung hình, chạy tiếp không giật. Nên không có
    thứ gì mới xuất hiện trên màn hình, chỉ có một lý do mới để cùng một thứ xảy
    ra.
  */
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    idle.value = false;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      idle.value = true;
    }, IDLE_MS);
  }, [idle]);
  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [wake]);


  const onScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      dragging.value = true;
      /* Chạm vào là tỉnh. Một cú kéo không đi qua `onTouchStart` của lớp bọc
         khi ScrollView đã giành quyền, nên nó phải tự đánh thức. */
      runOnJS(wake)();
    },
    /* Thả ngay khi nhấc tay. Nếu có đà thì `onMomentumBegin` giữ lại ở khung
       hình kế — xem ghi chú ở `hold`.

       Thả về `focusSV`, không về `false`: cuộn chỉ là MỘT trong hai lý do Koa
       phải đứng hình. Lý do kia là chế độ tập trung, nơi tấm nội dung — và Koa
       nằm trong nó — bị hộp cắt của `Expander` thu về 0. Nhân vật vẫn ở trong
       cây và vẫn chạy 36 vòng của nó sau một mép không ai nhìn thấy được, đúng
       thứ mà `aura-cost.mjs` cấm ở lớp aura.

       Và chính vì cuộn VẪN xảy ra ở chế độ tập trung — cả khối chi tiết cao hơn
       màn hình, người ta phải cuộn để đọc — nên một `false` cứng ở đây sẽ cho
       nhân vật chạy lại ngay lần nhấc tay đầu tiên. */
    onEndDrag: () => {
      dragging.value = false;
      settleOffscreen();
    },
    onMomentumBegin: () => {
      dragging.value = true;
    },
    onMomentumEnd: () => {
      dragging.value = false;
      settleOffscreen();
    },
    onScroll: (e) => {
      viewportH.value = e.layoutMeasurement.height;
      maxScroll.value = Math.max(0, e.contentSize.height - e.layoutMeasurement.height);
    /*
      Thanh tab: quyết định và ghi NGAY TẠI ĐÂY, trên luồng UI.

      Trước đây dòng này là `runOnJS(handleTabScroll)(y)` — một cú nhảy UI→JS
      mỗi khung hình của mỗi cú cuộn, và bên kia mỗi lần lại huỷ một timer rồi
      dựng một timer mới. Sáu mươi lần một giây, cho một việc chỉ cần xảy ra một
      lần sau khi ngón tay đã rời màn hình.

      Và nó rơi đúng vào luồng React đang dựng: đó là luồng mà khi bỏ lỡ khung
      hình sẽ để một `entering` mắc kẹt ở giá trị đầu — màn hình trắng/mờ đã bị
      báo ở Progress và Nutrition. Cùng một vấn đề nhìn từ hai phía.

      `tabBarVisible` là shared value và `withSpring` chạy được trong worklet,
      nên trường hợp thường không cần JS chút nào. JS chỉ còn cần cho cái hẹn
      giờ, và nó được lên dây MỘT lần mỗi lần thanh ẩn đi.
    */
      if (tabScrollFrame(e.contentOffset.y, Date.now())) runOnJS(armTabBarRestore)();
    },
  });

  /**
   * Hero gần như ĐỨNG YÊN, và tắt dần thay vì trượt đi.
   *
   * Bản trước cho nó đi xuống bằng nửa tốc độ trang đi lên. Nó "đè" đúng, và nó
   * sai cảm giác: một vòng tròn to đi ngược chiều ngón tay là hai chuyển động
   * cùng lúc trên một màn hình, và mắt bám cái to hơn. Thứ cần chuyển động là
   * TẤM, không phải thứ tấm đang phủ lên.
   *
   * Nên hero chỉ nhích 12% — đủ để không đọc ra là một ảnh dán chết vào nền —
   * rồi mờ dần. Đến khi tấm phủ hết vòng tròn thì nó đã tắt, nên không có lúc
   * nào một vòng tròn mờ nằm sau chữ.
   */
  /**
   * Hero có hành động RIÊNG: nó đứng nguyên và bị che dần từ dưới lên.
   *
   * ── vì sao không phải mờ, và không phải trôi ──
   *
   * Bốn bản trước đều sai vì cùng một lý do: tôi cho hero TỰ làm gì đó — trôi
   * chậm hơn trang, hoặc tan đi. Cả hai đều là hero phản ứng với cú cuộn, và
   * mắt đọc ra là hai thứ cùng chuyển động.
   *
   * Thứ đúng là hero KHÔNG làm gì cả. Nó đứng đúng chỗ, đầy đủ, sắc nét, và tấm
   * nội dung bò lên che nó — từ mép dưới lên trên. Cái biến mất không phải là
   * hero; cái biến mất là phần hero còn nhìn thấy được. Đó là hai câu khác nhau,
   * và câu thứ hai là thứ một tấm trượt vốn dĩ kể.
   *
   * Nên không có opacity và không có scale ở đây. Che là toàn bộ hiệu ứng.
   *
   * ── ghim, rồi thả ──
   *
   * `translateY = scrollY` giữ nó đứng yên trên màn hình. Nhưng ghim mãi thì nó
   * treo sau tấm suốt cả trang dài, nên phép bù trừ dừng lại ở `cover` — quãng
   * vừa đủ để tấm phủ kín nó. Sau mốc đó nó cuộn đi bình thường cùng trang, ở
   * dưới tấm, nơi không ai còn nhìn thấy.
   */
  const heroSlide = useAnimatedStyle(() => {
    if (focusSV.value === 1) return { transform: [{ translateY: 0 }] };
    return {
      transform: [{ translateY: Math.min(scrollY.value, cover) }],
      /*
        Mờ ở CUỐI, sau khi tấm đã phủ kín — không phải trong lúc đang phủ.

        Che là hiệu ứng chính; nếu mờ chạy song song thì hai thứ cùng làm một
        việc và hero biến mất trước khi tấm kịp kể xong câu chuyện. Nhưng ghim
        một tấm ảnh đầy đủ ở phía sau mãi mãi cũng sai: khi trang thông tin đã
        chiếm hết màn hình thì thứ nằm sau nó không còn là nền của gì nữa.

        Nên 15% cuối của quãng phủ mới là chỗ nó tắt.
      */
      /*
        Mờ NHẸ ngay từ pixel đầu, rồi tắt hẳn về cuối.

        Ba mốc chứ không hai: từ 1 xuống 0.72 trong nửa đầu quãng phủ, rồi từ
        0.72 xuống 0 trong nửa sau. Dốc thoải trước, dốc đứng sau.

        Một mốc duy nhất ở 15% cuối thì suốt 85% đầu vòng tròn đứng đó y nguyên
        và cú cuộn không có phản hồi nào; mờ đều từ đầu tới cuối thì nó nhạt quá
        sớm để còn đọc được. Hai đoạn cho cả hai: có phản hồi ngay, mà con số
        vẫn đọc được cho tới khi tấm che tới nơi.
      */
      opacity: interpolate(scrollY.value, [0, cover * 0.5, cover], [1, 0.72, 0], 'clamp'),
    };
  });

  /* Và tấm đục dần lên theo đúng quãng đó: lúc đứng yên nó gần như trong suốt
     để thấy được mình đang nằm trên cái gì, cuộn hết thì nó là một mặt phẳng
     để chữ không phải cạnh tranh với bất cứ thứ gì. */
  /**
   * Lớp phủ đậm dần theo đúng lúc tấm trượt lên đè hero.
   *
   * ── vì sao không để một mức cố định ──
   *
   * Blur làm mất NÉT, không làm giảm SÁNG. Vòng tròn là một nét dày, bão hoà,
   * phát sáng; làm mờ nó xong vẫn còn nguyên một vệt xanh chói nằm sau các nút
   * ghi, và đó là cái "thông tin bị lẫn" — không phải chữ đọc không ra, mà là
   * hai thứ sáng ngang nhau tranh nhau cùng một chỗ. Thứ giết được vệt sáng đó
   * là một lớp TỐI, không phải thêm blur.
   *
   * Nhưng một lớp tối cố định ở mức đó thì lúc chưa cuộn lại thành một hộp đen
   * đặt trên nền — vì lúc đó phía sau chẳng có gì sáng để dập cả. Nên nó chạy
   * theo CÙNG quãng với blur và với phép mờ của hero: cả ba là một chuyển động.
   */
  const scrimFade = useAnimatedStyle(() => {
    if (focusSV.value === 1) return { opacity: SCRIM_REST };
    return {
      opacity: interpolate(scrollY.value, [HERO_HOLD, cover], [SCRIM_REST, 1], 'clamp'),
    };
  });

  /**
   * Bật/tắt chế độ tập trung. KHÔNG đưa trang về đầu.
   *
   * ── lập luận cũ, và vế đã thôi đúng ──
   *
   * Chỗ này từng gọi `scrollTo({ y: 0, animated: true })` ở cả hai chiều, và lý
   * do viết ra là: "Thu lại gỡ cả dashboard ra khỏi cây CÙNG LÚC, chiều cao nội
   * dung co lại đột ngột, và offset cũ không còn tồn tại nên nó bị kéo về mốc
   * gần nhất còn hợp lệ. Người dùng thấy một cú trôi mà mình không ra lệnh."
   *
   * Chẩn đoán ấy đúng, và chữ quan trọng nhất trong nó là ĐỘT NGỘT. Cú trôi khó
   * chịu không phải vì trang di chuyển — mà vì nó di chuyển do một thứ đã xảy
   * ra xong trong một khung hình, nên trên màn hình không còn gì giải thích nó.
   *
   * `scrollTo(0)` không gỡ điều đó; nó thêm một chuyển động THỨ BA. Đo trên
   * harness web: mở thẻ sẵn sàng làm chạy cùng lúc một hộp cắt 240ms
   * `inOut(cubic)` trên luồng UI, một cú xoá dashboard trong một khung hình, và
   * một cú cuộn native có đường cong và thời lượng riêng — ba dòng thời gian
   * cho một cú chạm.
   *
   * ── vì sao bỏ được ──
   *
   * Vì tấm nội dung nay co bằng `Expander`. Chiều cao nội dung đổi LIÊN TỤC
   * trên đúng 240ms ấy, nên nếu ScrollView có phải kẹp thì nó kẹp dần theo cùng
   * đường cong — và người dùng đang NHÌN thấy thứ gây ra nó co lại. Cú trôi
   * thôi là một cú trôi và thành hệ quả, thứ mà một cú cuộn riêng không bao giờ
   * thành được.
   *
   * Và trong phần lớn trường hợp không có gì để kẹp: mũi tên nằm TRÊN khối chi
   * tiết, nên bạn chỉ bấm được nó từ những vị trí cuộn còn nhìn thấy nó.
   *
   * ── đo được, cùng một harness, cùng một thao tác ──
   *
   * Mở khối chi tiết, cuộn xuống, rồi bấm thu lại; theo dõi y của CHÍNH cái nút
   * vừa bấm:
   *
   *     trước:  nút đi 225 điểm, scrollTop 225 → 0
   *     sau:    nút đi   0 điểm, scrollTop 209 → 209
   *
   * Không có cú kẹp nào xảy ra: mức cuộn tối đa đi 209 → 1.383 trong khi tấm mở
   * ra, nên vị trí cũ chưa bao giờ hết hợp lệ. Cú `scrollTo` cũ không cứu một
   * cú kẹp — nó là chuyển động duy nhất trong cả cảnh ấy.
   *
   * `toggleEdit` bên trên GIỮ `scrollTo(0)` của nó, và đó không phải chuyện
   * thiếu nhất quán: đổi sang chế độ sắp xếp là thay cả nội dung trang bằng một
   * nội dung khác, không phải mở một phần của cùng một trang.
   */
  /**
   * Hàng nút trên đầu: tan đi khi rời đỉnh, hiện lại khi về đỉnh.
   *
   * Nó vốn đã cuộn khỏi màn hình vì nằm trong trang — nhưng "cuộn đi" và "tan
   * đi" là hai cảm giác khác nhau: cái đầu là ba cái nút bị đẩy ra ngoài mép,
   * cái sau là ba cái nút thôi cần thiết. Ở đỉnh trang chúng là điều khiển của
   * trang; cuộn xuống rồi thì thứ bạn đang xem mới là trang.
   *
   * 56pt là quãng ngắn — chúng biến mất gần như ngay khi bạn bắt đầu, đúng như
   * thanh điều khiển của Apple Music, chứ không nấn ná nửa màn hình.
   */
  const topBar = useAnimatedStyle(() => {
    /*
      ── vì sao nó đọc `tabBarVisible` chứ không đọc `scrollY` ──

      Hai vòng trước tôi buộc hàng nút vào VỊ TRÍ cuộn: mờ dần theo 96 điểm đầu,
      rồi nằm im ở 0 cho tới khi bạn về lại đỉnh trang. Người dùng báo lại hai
      lần rằng "không có gì thay đổi", và họ đúng — bản trước cũng buộc vào vị
      trí, chỉ khác con số. Đổi một hằng số trong cùng một cơ chế thì cơ chế vẫn
      thế.

      Thứ làm nên "cách Apple đã làm" không phải đường cong, mà là HƯỚNG. Ở
      Safari, Photos, Mail: chrome đi khi bạn cuộn XUỐNG và quay lại NGAY khi
      bạn cuộn LÊN, ở bất kỳ đâu trong trang — bạn không phải cuộn hết về đỉnh
      để lấy lại các nút. Buộc vào vị trí thì không bao giờ ra được cảm giác đó,
      dù đường cong có đẹp đến mấy.

      ── và vì sao dùng LẠI tín hiệu của thanh tab ──

      `lib/tab-bar-visibility.ts` đã có đúng luật ấy, đã chạy trên luồng UI, đã
      nhớ ĐÍCH nên một cú vuốt mạnh chỉ sinh một lò xo, và đã có hẹn giờ trả
      thanh về khi cuộn dừng hẳn. Nó đang điều khiển thanh tab dưới đáy.

      Viết một bộ đếm hướng thứ hai ở đây là hai luật cho một câu hỏi, và chúng
      sẽ lệch nhau ở lần đầu ai đó chỉnh một bên — chrome trên và chrome dưới
      rời màn hình vào hai lúc khác nhau là thứ đọc ra ngay. Đọc chung một
      shared value thì chúng KHÔNG THỂ lệch, và cái đồng bộ trên–dưới ấy tự nó
      là phần "ra dáng iOS" nhất của thay đổi này.

      Chi phí mỗi khung hình: bằng 0. Quyết định đã được tính sẵn ở `onScroll`
      cho thanh tab; ở đây chỉ đọc kết quả.
    */
    /* Lò xo vọt qua 1 một chút, và `scale`/`opacity` không nên đi theo cú vọt
       đó — kẹp lại rẻ hơn đổi sang timing, vì lò xo mới là thứ cho thanh tab
       cảm giác của nó. */
    const shown = Math.min(Math.max(topChromeVisible.value, 0), 1);
    return {
      opacity: shown,
      /* Mờ hẳn thì thôi nhận chạm: `opacity: 0` KHÔNG tắt cảm ứng, và hàng này
         nằm đúng trên vòng tròn — bấm vào ring mà không có gì xảy ra thì không
         có gì trên màn hình giải thích được. Đọc CHÍNH `shown`, không tính lại
         từ đầu: hai phép tính riêng là hai thứ sẽ lệch. */
      pointerEvents: shown < 0.02 ? ('none' as const) : ('box-none' as const),
      transform: [
        /* Ra HẲN khỏi mép trên. Bản trước nhấc 10 điểm rồi mờ tại chỗ — 10 điểm
           trên một hàng cao 44 là một cái nhích, và mắt đọc cái nhích ấy là
           "bị tắt" chứ không phải "rời đi". */
        { translateY: (shown - 1) * TOP_BAR_LIFT },
        /* Và lùi lại một chút khi đi. Sáu phần trăm đủ để đọc ra "nó ra xa" chứ
           không đọc ra "nó co lại". Nằm trong CÙNG mảng transform nên hai giá
           trị chỉ tốn một lần ghi style. */
        { scale: 0.94 + shown * 0.06 },
      ],
    };
  });

  /**
   * Đã mờ hẳn thì phải thôi ăn cú chạm.
   *
   * `opacity: 0` không tắt cảm ứng — một nút vô hình vẫn nuốt cú bấm, và ở đây
   * nó nằm đúng trên vòng tròn. Reanimated không nội suy `pointerEvents`, nên
   * ngưỡng phải đi qua state React.
   *
   * Chỉ gọi setState ở đúng lúc VƯỢT ngưỡng, không phải mỗi khung hình cuộn:
   * shared value giữ trạng thái trước đó, và một lần render mỗi lần đổi chiều
   * là đủ.
   */

  /*
    `useAnimatedRef` chứ không phải `useRef`: `scrollTo` của Reanimated chỉ nhận
    một animated ref, và tự-cuộn-khi-kéo phải chạy trên luồng UI — ngón tay
    đang giữ một thẻ, nên một chuyến sang JS mỗi khung hình là đúng chỗ không
    được phép có. `.current` vẫn là chính component, nên mọi lời gọi
    `scroller.current?.scrollTo({...})` ở luồng JS không đổi gì.
  */
  const scroller = useAnimatedRef<Animated.ScrollView>();


  /**
   * Vào/ra chế độ sắp xếp, và LUÔN đưa trang về đầu.
   *
   * Một hàm chứ không phải hai lời gọi `setEditMode` rời nhau: cú đưa-về-đầu là
   * phần BẮT BUỘC của việc đổi chế độ, không phải một tiện ích của riêng cái
   * nút bấm nó. Để rời thì lối vào thứ hai — hoặc một lối vào thêm sau này —
   * sẽ quên nó, và người dùng nhận một cú trôi mình không ra lệnh.
   */
  const toggleEdit = useCallback(
    (on: boolean) => {
      Haptics.selectionAsync();
      setEditMode(on);
      setNewGroupName('');
      scroller.current?.scrollTo({ y: 0, animated: true });
    },
    [setEditMode],
  );
  const toggleHero = useCallback((index: number) => {
    Haptics.selectionAsync();
    setExpandedAt((v) => (v === index ? null : index));
  }, []);

  /**
   * Vuốt sang thẻ khác thì thẻ mới bắt đầu ở trạng thái MẶC ĐỊNH.
   *
   * Đóng chi tiết và đưa trang về đầu. Không phải để cho gọn — mà vì thẻ mới
   * chưa từng được mở, nên hiện nó ở trạng thái mở là kể một chuyện không xảy
   * ra. Và vị trí cuộn của thẻ cũ là vị trí trong NỘI DUNG của thẻ cũ; mang nó
   * sang thẻ khác thì nó không còn nghĩa gì.
   */
  const onHeroPageChange = useCallback((index: number) => {
    setExpandedAt(null);
    /* Trang đang xem, để chỉ dựng lớp aura quanh nó — xem chỗ vẽ `AuraLayer`.
       React bỏ qua khi giá trị không đổi, nên một lần vuốt hụt không tốn gì. */
    setHeroPage(index);
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, []);

  /*
    Activity rings. `active_kcal` and `active_minutes` are passed through as
    null-or-number rather than defaulted to 0 here: the card draws a different
    thing for "Health has never reported" than for "Health says you have not
    moved", and `|| 0` at this line would erase the difference before it ever
    reaches the component that cares. The estimate that fills in for a missing
    watch is a separate query — see `useTodayTrainingMinutes`.
  */
  const steps = dailyLog?.steps ?? 0;
  const { data: trainingMin } = useTodayTrainingMinutes();

  // Nutrition
  const kcal = Math.round(Number(dailyLog?.kcal) || 0);
  // Shared with the Nutrition tab, which draws the same card — see
  // `lib/macro-targets.ts`.
  const calorieTarget = calorieTargetFor(profile);
  const macroTargets = macroTargetsFor(profile);

  // Sleep
  const stages = sleep
    ? { deep: sleep.deep_min ?? 0, rem: sleep.rem_min ?? 0, light: sleep.light_min ?? 0 }
    : null;
  const stageSum = stages ? stages.deep + stages.rem + stages.light : 0;
  const sleepTotalMin = stageSum > 0 ? stageSum : Number(dailyLog?.sleep_duration_min) || 0;
  const sleepTargetHours = Number(profile?.sleep_target_hours) || 8;

  const waterTarget = Number(profile?.water_target_ml) || 2500;

  /*
    ── the four ways in, and why they stopped looking alike ──

    These shipped as four identical chips: the same grey `+`, the same hairline
    box, the same near-transparent fill. Nothing but the words told them apart,
    so reading the row meant reading four labels — and this is the row somebody
    uses several times a day, which is exactly the row that should be
    recognisable without reading.

    Each one now carries the glyph the app already uses for that part of itself:
    `flame` is calories wherever they appear, `moon` is sleep, `heart` is
    biometrics, and `pulse` is training load in every assistant suggestion. The
    row teaches nothing new — it just stops hiding what it already knows.

    The `+` is gone with them. Once a chip has its own mark, a plus in front of
    it is a second icon saying something the shape of the row already said.
  */
  const quickActions = [
    { label: i18n.dashLogMealAction, route: '/log-meal' as const, glyph: 'flame' as const },
    { label: i18n.dashLogWorkoutAction, route: '/log-workout' as const, glyph: 'pulse' as const },
    { label: i18n.dashLogSleepAction, route: '/log-sleep' as const, glyph: 'moon' as const },
    { label: i18n.dashEnterBiometrics, route: '/log-biometrics' as const, glyph: 'heart' as const },
  ];

  // Web Index renderWidget — one place mapping WidgetKey → card
  /**
   * Which widget Koa comes up behind when a quest lands.
   *
   * Five quests, five cards, and the mapping is the obvious one: the card you
   * just moved is the card the reaction belongs to. `steps` and `activity` are
   * the same quest seen twice — whichever of the two the person has on their
   * dashboard is the one that plays, and if they have both, both do, which is
   * fine because they are the same news.
   *
   * Everything not in here returns `null` and is wrapped in nothing.
   */
  const PEEK_QUEST: Partial<Record<WidgetKey, QuestKey>> = {
    nutrition: 'meal',
    water: 'water',
    sleep: 'sleep',
    steps: 'steps',
    activity: 'steps',
    training: 'workout',
    'workout-status': 'workout',
  };

  /**
   * One wrapping point for the whole dashboard.
   *
   * The alternative was `<CardPeek>` written into each of the five widgets,
   * which is five places to keep in step and five chances for the next card to
   * be added without one. Wrapping the renderer means a widget only has to be
   * named in `PEEK_QUEST` to take part, and a widget that is not named pays
   * nothing at all — `CardPeek` is not mounted around it.
   */
  const withPeek = (key: WidgetKey, node: React.ReactNode): React.ReactNode => {
    const quest = PEEK_QUEST[key];
    if (!quest || !node) return node;
    return <PeekHost quest={quest}>{node}</PeekHost>;
  };

  /**
   * Màu nền cho từng trang hero.
   *
   * Chỉ những thẻ THẬT SỰ có một màu riêng mới khai ở đây. Thẻ nào không có thì
   * mang màu sẵn sàng của ngày — không phải vì tiện, mà vì đó là màu đúng cho
   * "hôm nay thế nào", và một trang không nói về một phép đo riêng thì vẫn đang
   * nói về hôm nay.
   */
  /**
   * Hai màu cho mỗi trang hero.
   *
   * Một wash tròn của MỘT màu không có hướng — nó sáng ở giữa rồi tối đều ra
   * mọi phía, nên mắt không có gì để đi theo và nó đọc ra đơn điệu. Hai tông
   * lệch tâm chồng nhau cho ra một dải chuyển màu chéo qua khung hình, thứ làm
   * nên "một bầu trời" thay vì "một vệt sáng".
   *
   * Cặp màu chọn theo NGHĨA của trang chứ không theo khẩu vị: sẵn sàng lấy đúng
   * ba màu mà vòng tròn của nó đang dùng, vận động lấy màu vòng Move, dinh
   * dưỡng lấy màu của thẻ nó, nước lấy xanh dương. Nền và con số không được
   * phép nói hai chuyện khác nhau.
   */
  const heroTints = useMemo(
    () =>
      config.heroWidgets.map((key) => {
        /* Bảng ở `constants/ascnd.ts`, không ở đây: trang dinh dưỡng và trang
           tập luyện đọc CÙNG cặp màu, nên một bản sao là một lời hứa sẽ lệch. */
        const own = (PAGE_TINT as Partial<Record<WidgetKey, readonly [PaletteKey, PaletteKey]>>)[key];
        return {
          key,
          status: own ? null : readinessScore != null ? readinessStatus : null,
          tint: own ? c[own[0]] : undefined,
          /* Trang sẵn sàng không khai cặp: nó lấy màu theo trạng thái, và tông
             thứ hai là màu lạnh cạnh nó trên cùng thang. */
          tint2: own ? c[own[1]] : readinessStatus === 'red' ? c.metricOrange : c.metricBlue,
        };
      }),
    [config.heroWidgets, readinessScore, readinessStatus],
  );

  /* Cùng một khoá vẽ ra hai hình dạng tuỳ chỗ nó đứng, và câu hỏi "nó đứng ở
     đâu" chỉ có một chỗ trả lời. */
  const inHero = (key: WidgetKey) => config.heroWidgets.includes(key);
  /* Vị trí của thẻ trong deck — cùng thứ tự mà `CardDeck` nhận children, nên
     `expandedAt` và trang đang xem nói về cùng một con số. */
  const heroIndex = (key: WidgetKey) => config.heroWidgets.indexOf(key);

  const renderWidget = (key: WidgetKey): React.ReactNode => {
    switch (key) {
      case 'readiness':
        return readinessScore != null ? (
            <ReadinessGauge
              detailOpen={expandedAt === heroIndex(key)}
              onToggleDetail={() => toggleHero(heroIndex(key))}
              onOpenDetail={() => nav.push('/biometrics')}
              score={readinessScore}
              status={readinessStatus}
              explain={dailyLog?.readiness_explain}
              recommendation={dailyLog?.readiness_recommendation}
              acwr={dailyLog?.acwr != null ? Number(dailyLog.acwr) : null}
              /* Ba số cho phần NHẬN XÉT, không cho phần tính điểm — điểm đã
                 chấm xong ở `computeReadiness`, thứ không đọc chất lượng.
                 `sleep_quality` khởi tạo bằng 0 khi chưa có đêm nào, và
                 `sleepNote` coi 0 là "chưa chấm" vì thang bắt đầu từ 1. */
              sleepQuality={dailyLog?.sleep_quality != null ? Number(dailyLog.sleep_quality) : null}
              sleepMin={Number(dailyLog?.sleep_duration_min) || 0}
              sleepTargetMin={sleepTargetHours * 60}
            />
        ) : inHero(key) ? (
          /* Trạng thái rỗng phải mang đúng hình dạng của trạng thái đầy — xem
             `EmptyHero`. Một thẻ ngắn giữa bốn trang cao là 250pt đen, và "chưa
             có dữ liệu" khi đó trông hệt như "màn hình bị hỏng". */
          <EmptyHero
            title={i18n.dashReadiness}
            message={i18n.dashReadinessMsg}
            tint={c.readinessYellow}
            icon={Heart}
            detailOpen={expandedAt === heroIndex(key)}
            onToggleDetail={() => toggleHero(heroIndex(key))}
            onOpenDetail={() => nav.push('/biometrics')}
          />
        ) : (
          <GlassCard style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{i18n.dashReadiness}</Text>
            <Text style={styles.emptyMsg}>{i18n.dashReadinessMsg}</Text>
          </GlassCard>
        );
      case 'activity':
        return (
          <ActivityRingsCard
            detailOpen={expandedAt === heroIndex(key)}
            onToggleDetail={() => toggleHero(heroIndex(key))}
            moveKcal={dailyLog?.active_kcal != null ? Number(dailyLog.active_kcal) : null}
            healthMinutes={dailyLog?.active_minutes ?? null}
            loggedMinutes={trainingMin ?? 0}
            steps={steps}
            stepsTarget={stepsGoal}
            /* Offered only where it can work — the button is HealthKit, and
               HealthKit does not exist in Expo Go or on a simulator. */
            /*
              KHÔNG truyền nút kết nối vào hero.

              Hàng "Đồng bộ Apple Health" đã có sẵn ở phần thông tin bên dưới,
              và đó là chỗ của nó: hero trả lời một phép đo, còn kết nối một
              nguồn dữ liệu là một việc bạn làm cho CẢ app chứ không riêng cho
              vòng tròn này. Để cả hai là hai nút cùng một việc ở hai chỗ, và
              cái nằm trên hero thì dính vào một trang mà nó không thuộc về.
            */
            onLogWorkout={() => nav.push('/log-workout')}
          />
        );
      case 'biometrics':
        return <BiometricsCard />;
      case 'sleep':
        if (inHero(key)) {
          return (
            <SleepHero
              totalMin={sleepTotalMin}
              targetHours={sleepTargetHours}
              quality={sleep?.quality != null ? Number(sleep.quality) : null}
              bedtime={sleep?.bedtime}
              waketime={sleep?.waketime}
              detailOpen={expandedAt === heroIndex(key)}
              onToggleDetail={() => toggleHero(heroIndex(key))}
              onOpenDetail={() => nav.push('/sleep-insights')}
            />
          );
        }
        return sleepTotalMin > 0 ? (
          <PressScale onPress={() => { Haptics.selectionAsync(); nav.push('/sleep-insights'); }}>
            <SleepCard
              totalMin={sleepTotalMin}
              targetHours={sleepTargetHours}
              quality={sleep?.quality != null ? Number(sleep.quality) : null}
              bedtime={sleep?.bedtime}
              waketime={sleep?.waketime}
              stages={stages}
            />
          </PressScale>
        ) : (
          <PressScale onPress={() => nav.push('/log-sleep')}>
            <GlassCard style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{i18n.dashSleep}</Text>
              <Text style={styles.emptyMsg}>{i18n.dashSleepMsg}</Text>
            </GlassCard>
          </PressScale>
        );
      case 'steps':
        return <StepsWidget steps={steps} target={stepsGoal} labels={{ title: lang === 'vi' ? 'Bước đi' : 'Steps' }} />;
      case 'nutrition':
        /* Trong deck thì mang vỏ hero. Thẻ danh sách bên dưới vẫn còn nguyên và
           vẫn đúng: ai dời nutrition xuống một nhóm ở chế độ sửa sẽ nhận lại nó.
           Hai hình dạng cho hai chỗ, không phải hai bản của một thứ — xem ghi
           chú đầu `hero-pages.tsx`. */
        if (inHero(key)) {
          return (
            <NutritionHero
              onOpenDetail={() => nav.push('/nutrition')}
              kcal={kcal}
              calorieTarget={calorieTarget}
              protein={Number(dailyLog?.protein_g) || 0}
              carbs={Number(dailyLog?.carbs_g) || 0}
              fat={Number(dailyLog?.fat_g) || 0}
              detailOpen={expandedAt === heroIndex(key)}
              onToggleDetail={() => toggleHero(heroIndex(key))}
            />
          );
        }
        // Both states open the Nutrition tab, whose first segment is the day's
        // diary — the numbers on this card, and under them the meals they came
        // from. The card used to be inert when it had something to say and a
        // shortcut to `/log-meal` only when it was empty, which is backwards:
        // the moment you want more detail is the moment there *is* detail.
        return (
          <PressScale onPress={() => { Haptics.selectionAsync(); nav.push('/nutrition'); }}>
            {kcal > 0 ? (
              <NutritionCard
                kcal={kcal}
                calorieTarget={calorieTarget}
                protein={{ current: Number(dailyLog?.protein_g) || 0, target: macroTargets.protein }}
                carbs={{ current: Number(dailyLog?.carbs_g) || 0, target: macroTargets.carbs }}
                fat={{ current: Number(dailyLog?.fat_g) || 0, target: macroTargets.fat }}
                fiber={{ current: Number(dailyLog?.fiber_g) || 0, target: macroTargets.fiber }}
              />
            ) : (
              <GlassCard style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{i18n.dashNutrition}</Text>
                <Text style={styles.emptyMsg}>{i18n.dashNutritionMsg}</Text>
              </GlassCard>
            )}
          </PressScale>
        );
      case 'water':
        if (inHero(key)) {
          return (
            <WaterHero
              onOpenDetail={() => nav.push('/water')}
              ml={waterMl ?? 0}
              targetMl={waterTarget}
              detailOpen={expandedAt === heroIndex(key)}
              onToggleDetail={() => toggleHero(heroIndex(key))}
            />
          );
        }
        return <WaterWidget ml={waterMl ?? 0} targetMl={waterTarget} labels={{ title: lang === 'vi' ? 'Nước uống' : 'Water' }} />;
      case 'supplements':
        return <SupplementChecklistCard />;
      case 'training':
        return <TrainingCard acwr={dailyLog?.acwr != null ? Number(dailyLog.acwr) : null} />;
      case 'workout-status':
        return <WorkoutStatusCard planned={dailyLog?.workout_count ?? 0} />;
      case 'weight':
        return <WeightCheckinCard profileWeight={profile?.weight_kg != null ? Number(profile.weight_kg) : null} />;
      case 'readiness-trend':
        return <ReadinessTrendCard />;
      case 'ai-tips':
        return <SmartTipsCard />;
      case 'awards':
        return <RecentAwardsCard />;
      default:
        return null;
    }
  };

  return (
    /*
      Today is the one tab that does not go through `<Screen>` — it builds its
      own scroll view because of the edit-mode layout — and so it was the one
      tab with no room light. Every other page has had three pools behind it;
      this one was a flat fill, next to cards whose highlights are drawn to
      agree with a key light at the top-left that was not there.

      Same shape as `screen.tsx`'s tab branch: the light sits in a wrapper
      *outside* the scroll view, so it stays put while the content moves. Light
      that scrolled with the cards would read as a drawing.
    */
    <View
      style={styles.root}
      /*
        Chạm vào bất cứ đâu trên trang là "vẫn còn người ở đây".

        `onTouchStart` NỔI BỌT và KHÔNG giành responder, nên nó thấy mọi cú chạm
        trong cây mà không cướp cử chỉ nào — không nút nào, không cú vuốt deck
        nào, không cú kéo sắp xếp nào bị đụng tới. Một `PanResponder` ở đây thì
        sẽ đụng.

        Cú kéo ScrollView là ngoại lệ duy nhất nó không thấy chắc chắn, nên
        `onBeginDrag` tự gọi `wake` — xem bộ xử lý cuộn.
      */
      onTouchStart={wake}>
      <AmbientLight />
      {/*
        The day's colour, behind everything.

        Outside the scroll view for the same reason `AmbientLight` is: a wash
        that scrolled with the cards would read as a drawing on the page rather
        than as light in the room. It sits after the ambient light and before
        the content, so the three layers are in the order they would be in
        physically — room, colour, things.
      */}
      {/*
        Nền đổi màu theo thẻ bạn đang vuốt tới.

        Một lớp aura cho mỗi trang hero, chồng lên nhau, và độ mờ của chúng
        chạy thẳng từ `deckAt` — cùng shared value mà deck dùng để dịch các
        trang. Nên màu nền BÁM NGÓN TAY chứ không nhảy khi cú vuốt dừng lại:
        vuốt được nửa đường thì nền đã đi được nửa đường.

        Chồng-mờ hai lớp SVG thay vì đổi màu các `Stop` bên trong một lớp, vì
        cách sau phải animate thuộc tính của SVG trên UI thread; cách này chỉ
        là opacity, thứ đã chạy ở đó sẵn.
      */}
      {/*
        Chỉ dựng lớp aura của trang ĐANG XEM và hai trang kề.

        ── vì sao không dựng cả năm ──

        Mỗi `ReadinessAura` là một `<Svg>` phủ kín màn hình với vài gradient
        toả. Cả năm đều mounted nghĩa là năm lớp toàn màn nằm SAU tấm kính của
        tấm nội dung — và mỗi khung hình cuộn, `UIVisualEffectView` phải lấy
        mẫu lại đúng chồng lớp ấy. Bốn trong năm lớp ở opacity 0, tức là bốn
        lớp không vẽ ra gì mà vẫn nằm trong cây.

        ── vì sao ±1 chứ không phải đúng một lớp ──

        Vì phép chồng-mờ chạy theo NGÓN TAY: `AuraLayer` nội suy opacity từ
        `deckAt`, nên lúc vuốt được nửa đường thì trang kề phải ĐANG hiện một
        nửa. Chỉ giữ trang hiện tại là nền nhảy màu khi cú vuốt chốt, đúng thứ
        chú thích ngay trên đây nói ra để tránh.

        Một lần render mỗi lần CHỐT trang, không phải mỗi khung hình: deck báo
        `onPageChange` khi cú vuốt đã dừng (xem `card-deck.tsx`, `settle`), nên
        đường cuộn của Today vẫn không ghi state lần nào.
      */}
      {heroTints.length > 1 ? (
        heroTints.map((t, i) =>
          Math.abs(i - heroPage) <= 1 ? (
            <AuraLayer key={t.key} index={i} at={deckAt}>
              <ReadinessAura status={t.status} tint={t.tint} tint2={t.tint2} />
            </AuraLayer>
          ) : null,
        )
      ) : (
        <ReadinessAura status={readinessScore != null ? readinessStatus : null} />
      )}
      <Animated.ScrollView
      ref={scroller}
      // Transparent, not `styles.root` as before. The wrapper already paints
      // the page colour; painting it again here would paint straight over the
      // light and this change would do nothing at all.
      style={styles.scroller}
      /* Edit mode puts a text field at the very bottom of the page. Without
         this, the first tap on "add" while the keyboard is open is spent
         closing the keyboard, which reads as a button that ignores you. */
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          /* `TOP_BAR_H` + một khoảng cách: chỗ hàng nút từng chiếm khi nó còn là
             con đầu của vùng cuộn. Thiếu nó thì vòng tròn chui lên nằm dưới các
             nút. Cùng token `gap` mà `content` dùng, không phải một số thứ hai
             chọn cho vừa mắt. */
          paddingTop: insets.top + 12 + TOP_BAR_H + spacing.md,
          paddingBottom: BottomTabInset + insets.bottom + spacing.lg,
        },
      ]}
      /*
        Pull to refresh, and where its spinner is drawn.

        The gesture worked and the spinner did not: iOS draws it at the top of
        the *scroll view's frame*, and this scroll view starts at the very top
        of the screen. Its top padding is on the content container, not the
        frame — deliberately, so the ambient light behind it is not clipped —
        so the spinner appeared behind the Dynamic Island and under the status
        scrim's blur. Pulling did reload; there was simply nothing to see, which
        is indistinguishable from a page that has no pull-to-refresh.

        `progressViewOffset` moves the indicator without moving the trigger, and
        it is set to the content's own top padding so the spinner appears
        exactly where the first card begins. Derived from the same number rather
        than a second one chosen to look right — if the padding changes, this
        follows it.

        It is implemented on iOS in this version (`RCTRefreshControl.m` converts
        it out of the parent's coordinate space); it is not Android-only, which
        the docs have historically implied.
      */
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={c.mutedForeground}
          progressViewOffset={insets.top + 12}
        />
      }
      onScroll={onScroll}
      /*
        1, không phải 16 — và đây là chỗ ring bị giật khi vuốt mạnh.

        Hero được GHIM bằng `translateY: min(scrollY, cover)`, nghĩa là nó chỉ
        đứng yên đúng bằng mức `scrollY` được cập nhật. `scrollEventThrottle`
        16 nghĩa là nhiều nhất một sự kiện mỗi 16ms — khoảng 62 lần một giây —
        trong khi màn ProMotion cuộn nội dung ở 120. Nên trang đi 120 bước một
        giây còn vòng tròn đi 62: nó KHÔNG trôi theo, nó nhảy từng nấc so với
        thứ nó phải đứng yên cùng.

        Vuốt nhẹ thì mỗi nấc chỉ vài điểm và mắt không thấy. Vuốt mạnh thì cùng
        8ms ấy là vài chục điểm, và đó đúng là "vuốt mạnh xuống thì ring bị
        giật, vuốt lên cũng giật".

        Đắt hơn thì không: `onScroll` ở đây là worklet của `useAnimatedScrollHandler`,
        chạy trên luồng UI, nên tăng nhịp không thêm một chuyến qua cầu nào.
        Con số 16 là mặc định cho một `onScroll` chạy bằng JS — chỗ mà mỗi sự
        kiện LÀ một chuyến qua cầu — và nó bị chép sang đây cùng cái tên.
      */
      scrollEventThrottle={1}
      contentInsetAdjustmentBehavior="never">

      {!editMode && (
        <>
          {/*
            Chỉ số sẵn sàng là thứ đầu tiên trên trang, và tràn hết bề ngang.

            Nó vốn nằm dưới Koa và bốn nút ghi — tức là dưới hai hàng điều
            khiển, nên thứ bạn mở app ra để xem lại là thứ cuối cùng bạn thấy.
            Các nút vẫn ở đây, chỉ là ở dưới: một nút chờ bạn quyết định làm gì,
            và cái quyết định đó bắt đầu bằng con số này.

            `marginHorizontal` âm để huỷ padding ngang của trang. Deck là thứ
            duy nhất trên màn hình chạm hai mép — đó là cách nó đọc ra là NỀN
            của trang chứ không phải một thẻ nữa trong danh sách thẻ.
          */}
          {/* Bóng của deck, ĐÚNG chỗ deck sắp hiện ra — không phải dưới các nút. */}
          {dayPending ? (
            <View style={styles.heroFull}>
              <TodaySkeleton part="hero" heroWidgets={config.heroWidgets} groups={config.groups} />
            </View>
          ) : null}
          {dayPending || dayFailed || config.heroWidgets.length === 0 ? null : (
            <Animated.View
              style={[styles.heroFull, heroSlide]}
              /*
                Chỉ ghi chiều cao của trạng thái app SẼ MỞ RA — trang đầu, chi
                tiết đóng.

                ── vì sao lỗi này tồn tại ──

                Deck từng cao bằng `Math.max` của mọi trang, tức một hằng số:
                ghi lúc nào cũng ra cùng một số. Bản sửa "khoảng trống dọc" đổi
                nó thành chiều cao của ĐÚNG trang đang xem — đúng cho việc hiển
                thị, và nó lặng lẽ làm con số này thôi là hằng số.

                Từ đó `recordHeight` lưu "deck lúc người dùng rời mắt khỏi nó":
                có thể là trang nước, có thể là một thẻ đang mở chi tiết cao gấp
                đôi. Lần mở app sau, bóng chờ dựng đúng khung ĐÓ rồi deck hiện
                ra ở trang đầu thu lại — người dùng thấy "khung cũ".

                Bóng chờ tồn tại để giữ chỗ cho thứ SẮP hiện ra. Thứ sắp hiện ra
                luôn là trang đầu ở trạng thái đóng, nên đó là chiều cao duy
                nhất đáng lưu.
              */
              onLayout={(e) => {
                if (heroPage !== 0 || expandedAt !== null) return;
                recordHeight(HERO_DECK, e.nativeEvent.layout.height);
              }}>
              {/*
                Hiệu ứng vào nằm ở lớp TRONG, và việc tách hai lớp là bản sửa cho
                "ring cứ giật giật ngay khi mở app".

                ── lỗi ──

                Trước đây một view mang cả hai: `heroSlide` (một
                `useAnimatedStyle` ghi `transform: [{ translateY }]`) và
                `entering={FadeInDown.springify()}` (một layout animation cũng
                ghi `translateY`). Cả hai chạy trên luồng UI và cùng ghi ĐÚNG một
                thuộc tính của ĐÚNG một view, mỗi khung hình đè lên nhau. Suốt
                thời gian lò xo chạy, deck nhảy qua lại giữa hai giá trị.

                Đó là rung do tranh chấp, không phải do đo đạc — nên mọi phép đo
                chiều cao đều sạch trong khi mắt vẫn thấy nó giật.

                ── vì sao harness không thấy ──

                Reanimated không chạy layout animation trên web như trên máy.
                Trace 489 khung hình từ lúc khởi động báo vị trí ring không đổi
                lần nào. Đây là lỗi thứ BA trong phiên này truy về `entering`, và
                cả ba đều vô hình với harness.

                ── cách sửa ──

                Hai view, hai việc: lớp ngoài giữ `heroSlide` và phép đo, lớp
                trong giữ hiệu ứng vào. Không thuộc tính nào bị hai bên cùng ghi.
              */}
              <Animated.View entering={FadeInDown.springify().damping(26).stiffness(180)}>
              <CardDeck
                scrollRef={scroller}
                progress={deckAt}
                expandedAt={expandedAt}
                onPageChange={onHeroPageChange}
                a11yLabel={lang === 'vi' ? 'Chỉ số hôm nay' : "Today's metrics"}>
                {config.heroWidgets.map((key) => (
                  <View key={key}>{withPeek(key, renderWidget(key))}</View>
                ))}
              </CardDeck>
              </Animated.View>
            </Animated.View>
          )}

          {/*
            Phần còn lại của trang, ĐI khi chi tiết mở — chứ không biến mất.

            Câu ở đây từng là "mount có điều kiện chứ không phải `opacity: 0`:
            một khối vô hình vẫn chiếm chiều cao của nó". Vế thứ hai đúng và vẫn
            đúng; vế thứ nhất là một lựa chọn nhị phân sai — giữa "xoá khỏi cây"
            và "để nguyên chỗ", `Expander` là cửa thứ ba: chiều cao mất đi THẬT,
            liên tục, trên cùng một đường cong với phần chi tiết đang mở ra.

            Xem chú thích ở ngay trên `<Expander>` bên dưới cho phép đo.
          */}
          {/*
            Tấm nội dung, trượt ĐÈ lên hero.

            Hero đi xuống bằng nửa tốc độ trang đi lên, nên khi bạn vuốt, tấm
            này bò lên và phủ dần vòng tròn. Mép trên bo tròn và một lề âm cho
            nó bắt đầu ở TRONG hero — nếu nó bắt đầu ở ngay dưới, thì lúc đứng
            yên vẫn có một đường ranh giới, và cả việc này sinh ra là để không
            còn đường nào.

            Nền là BLUR, không phải một lớp phủ đục. Thứ nằm sau tấm này là vòng
            tròn và lớp aura có màu; một lớp phủ đục sẽ xoá chúng, còn blur giữ
            lại hình và màu ở dạng đã nhoè — nên chữ trên tấm đọc được mà vẫn
            thấy mình đang nằm TRÊN cái gì. Đó đúng là "để thông tin không bị lẫn
            với thẻ".

            `liquid-glass.tsx` đã ghi vì sao không dùng một lớp fill trắng ở đây:
            "a flat white fill over moving colour is a sheet of tracing paper:
            the light goes under it and nothing comes through."
          */}
          {/*
            Ở chế độ tập trung KHÔNG vẽ tấm — và nay điều đó là hệ quả của hộp
            cắt cao 0 chứ không phải của một cái cổng.

            Câu cũ ở đây đúng và vẫn được giữ: mọi thứ bên trong đã ẩn mà tấm
            vẫn vẽ thì còn lại một tấm kính rỗng ruột dưới vòng tròn, "một mảnh
            của màn hình khác lọt vào". Khác biệt là ai bảo đảm điều đó. Trước
            là `heroOpen ? null`, tức một khung hình. Nay là `Expander`: chiều
            cao chạy về 0 và `overflow: hidden` thôi vẽ — cùng lúc, cùng đường
            cong với phần chi tiết đang mở.
          */}
          {/*
            ── vì sao cú chạm này từng KHÔNG có chuyển cảnh, và vì sao có bây giờ ──

            Một lần chạm mũi tên đổi BA thứ cùng lúc. Đo trên harness web, thẻ
            sẵn sàng, khung nhìn 402×874:

              · khối chi tiết      +553pt   240ms, inOut(cubic), luồng UI
              · cả dashboard bên dưới  −1.226pt  MỘT khung hình, không gì cả
              · vị trí cuộn        tới −225pt  `scrollTo(animated)`, đường cong riêng

            Chiều cao nội dung trang đi 2.325 → 560 → 1.099: dashboard bị xoá
            SẠCH trước, để lại một cái hố, rồi khối chi tiết mới bò vào lấp. Thứ
            được làm mượt cẩn thận nhất là nửa NHỎ của thay đổi; nửa lớn là một
            nhát cắt. Đó là câu trả lời cho "hiện tại không có trans".

            ── vì sao là `Expander` chứ không phải `FadeOut` ──

            Đoạn từng đứng đây bác `entering`/`exiting` và cả hai lý do vẫn
            đúng, nên không lý do nào bị lật:

              1. "Người dùng vừa bấm; cái họ muốn xem là phần chi tiết chứ không
                 phải phần đang biến mất." Đúng — nên phần này KHÔNG mờ, không
                 tự giới thiệu, không kể gì về mình. Nó chỉ thôi chiếm chỗ, đúng
                 tốc độ mà phần chi tiết chiếm chỗ.
              2. "Một `opacity` trên cả nhóm ấy buộc iOS gộp toàn bộ ra một bề
                 mặt ngoài màn — lượt gộp lớn nhất trong app." Đúng, và
                 `reveal="clip"` tồn tại chính vì lý do ấy: nó KHÔNG viết
                 `opacity` vào style, nên không có khoá nào để iOS thấy mà gộp.
                 Xem `expander.tsx`.

            Vế thứ ba của đoạn cũ — "tháo/dựng vẫn giữ nguyên: chiều cao phải
            mất đi thật" — là lý do DUY NHẤT để xoá khỏi cây, và `Expander` thoả
            nó: hộp cắt cao 0 là chiều cao 0 thật, không phải một khối vô hình
            còn chiếm chỗ. Nên cái phải bỏ không phải hiệu ứng, mà là cú xoá.

            ── và vì sao chúng chắc chắn đi cùng nhau ──

            Cùng một component, cùng `reveal="clip"`, nên cùng `duration.move`
            và cùng `inOut(cubic)`; và cả hai `open` lật trong CÙNG một lần
            commit của `setExpandedAt`. Không có hai con số nào để lệch, vì
            không có con số thứ hai nào được viết ra ở đây.

            ── giá phải trả, nói thẳng ──

            Dashboard nay MOUNT cả lúc đang ở chế độ tập trung. Đổi lại, mỗi cú
            chạm thôi phải tháo rồi dựng lại toàn bộ nó — một chi phí nhọn, rơi
            đúng vào lúc đang có hoạt hoạ chạy. Đổi một chi phí đều lấy việc bỏ
            một cú nhọn đúng lúc là đánh đổi đúng chiều cho cảm giác mượt.
          */}
          {/* Lề âm nằm NGOÀI hộp cắt.

              `styles.sheet` kéo ra hai bên `-spacing.md` để tấm chạm mép màn.
              Đặt lề ấy bên trong một hộp `overflow: hidden` thì chính hộp cắt
              gọt mất `spacing.md` mỗi bên — tấm thôi tràn mép, và không có lỗi
              nào báo. Nên bleed ở lớp ngoài, padding ở lớp trong. */}
          <View style={styles.sheetBleed}>
          <Expander open={!heroOpen} reveal="clip">
          <View style={styles.sheet}>
            {/*
              Blur cũng phải tắt dần ở mép trên, không chỉ lớp phủ.

              Bỏ hai góc bo là bỏ được hình dạng cái thẻ, nhưng mép ngang thì vẫn
              còn: `BlurView` là `absoluteFill`, nên chỗ nó bắt đầu là một hàng
              mà phía trên sắc nét và phía dưới nhoè — một đường kẻ vắt qua màn
              hình dù không có một điểm ảnh viền nào được vẽ ra.

              Mặt nạ dùng ĐÚNG `SCRIM_FADE` với lớp phủ. Một hằng số chi phối cả
              hai nên chúng không thể lệch nhau; hai con số riêng thì hôm nay
              trùng và lệch ngay lần đầu ai đó chỉnh một bên.

              Dựng mặt nạ bằng hai lớp CỐ ĐỊNH theo điểm, không phải một gradient
              phần trăm: tấm cao bao nhiêu là tuỳ số thẻ người dùng bật, và một
              dốc theo phần trăm sẽ mềm hay gắt khác nhau tuỳ cấu hình dashboard.
            */}
            {/*
              Kính CHỈ CAO bằng quãng mà nó còn việc để làm.

              ── vì sao ──

              `MaskedView` này từng là `absoluteFill`, nghĩa là một
              `UIVisualEffectView` cao bằng CẢ dashboard — thường hai tới ba
              màn hình — nằm bên trong ScrollView. Nó trôi theo từng khung hình
              cuộn, nên vùng nền nó lấy mẫu đổi mỗi khung hình, nên nó phải
              blur lại toàn bộ diện tích ấy mỗi khung hình. Đó là món đắt nhất
              còn lại trên đường cuộn sau khi `intensity` thôi chạy theo cuộn.

              ── vì sao cắt được mà không mất gì ──

              Thứ duy nhất SẮC NÉT có thể nằm sau tấm này là hero, và hero bị
              ghim: `translateY = min(scrollY, cover)`, mờ hẳn ở `cover`. Nên
              tính theo hệ toạ độ của chính tấm, hero không bao giờ đi sâu quá
              `cover` điểm kể từ mép trên. Dưới mốc đó, thứ nằm sau tấm chỉ còn
              lớp aura — một wash gradient. `card-deck.tsx` đã ghi đúng lập
              luận này khi bỏ blur của từng trang: "làm mờ một wash gradient thì
              cho ra đúng cái wash đó".

              Phần tương phản cho chữ ở khúc dưới vốn dĩ là của LỚP PHỦ, không
              phải của blur — và lớp phủ vẫn `absoluteFill` như cũ.
            */}
            <MaskedView
              style={[styles.sheetGlass, { height: SCRIM_FADE + cover + GLASS_TAIL }]}
              maskElement={
                <View style={StyleSheet.absoluteFill}>
                  <View style={styles.scrimBand}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <SvgGradient id={sheetMask} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
                          <Stop offset="0.3" stopColor="#fff" stopOpacity="0.22" />
                          <Stop offset="0.65" stopColor="#fff" stopOpacity="0.62" />
                          <Stop offset="1" stopColor="#fff" stopOpacity="1" />
                        </SvgGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${sheetMask})`} />
                    </Svg>
                  </View>
                  <View style={styles.maskBody} />
                  {/*
                    Và nó TẮT DẦN ở đáy chứ không dừng.

                    Cắt chiều cao lớp kính là thứ gỡ được phần lớn chi phí mỗi
                    khung hình, nhưng chỗ nó kết thúc vẫn là một hàng: bên trên
                    nhoè, bên dưới sắc nét. Đó đúng là lỗi mà `status-scrim.tsx`
                    đã gọi tên khi bỏ cái hairline của nó — "một cái kết không
                    được đánh dấu là một vết nhoè mà mắt cứ cố lấy nét vào" — và
                    đúng cái đã bị báo ở hai chỗ khác trên màn này.

                    Dải tắt được CỘNG THÊM vào dưới, không cắt vào phần đang
                    dùng: hộp cao hơn đúng `GLASS_TAIL`, nên quãng blur đầy đủ
                    vẫn là `SCRIM_FADE + cover` như trước. Không mất vùng phủ
                    nào, chỉ thêm một quãng nhạt dần ở nơi phía sau vốn đã chỉ
                    còn wash gradient.

                    Bốn chặng chứ không hai, cùng hình dạng với dải trên và với
                    mặt nạ của `status-scrim.tsx`: một dốc thẳng chạm 0 ở một
                    hàng xác định, và mắt tìm ra đúng hàng đó.
                  */}
                  <View style={styles.maskTail}>
                    <Svg width="100%" height="100%">
                      <Defs>
                        <SvgGradient id={sheetTail} x1="0" y1="0" x2="0" y2="1">
                          <Stop offset="0" stopColor="#fff" stopOpacity="1" />
                          <Stop offset="0.35" stopColor="#fff" stopOpacity="0.62" />
                          <Stop offset="0.7" stopColor="#fff" stopOpacity="0.18" />
                          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
                        </SvgGradient>
                      </Defs>
                      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${sheetTail})`} />
                    </Svg>
                  </View>
                </View>
              }>
              <BlurView intensity={SHEET_BLUR} tint="dark" style={StyleSheet.absoluteFill} />
            </MaskedView>
            {/*
              Lớp phủ tối, và nó phải TỐI DẦN chứ không bắt đầu ở mức đầy.

              Việc nó làm: chữ ở đây nằm trên nền gradient của hero, và một
              gradient thì chỗ đậm chỗ nhạt — cùng một màu chữ đọc rõ ở khúc này
              và mờ ở khúc kia. Một lớp đen mỏng kéo tương phản về một mức duy
              nhất mà vẫn thấy màu phía sau.

              Vì sao chia hai lớp: nếu chỉ một tấm phẳng `absoluteFill`, chỗ nó
              bắt đầu là một ĐƯỜNG NGANG cứng vắt qua màn hình ngay trên Koa —
              đúng thứ đã bị bắt lỗi hai lần ("thẻ vẫn còn bị cắt ngang", "vết
              cắt đầy nè"). Nên: một dải chuyển ở trên với chiều cao CỐ ĐỊNH, rồi
              mới tới phần đặc.

              Cố định theo điểm chứ không theo phần trăm là có chủ ý — tấm này
              cao bao nhiêu là tùy số thẻ người dùng bật, và một dải chuyển theo
              phần trăm sẽ đổi độ dốc theo cấu hình dashboard: cùng một màn hình
              mà người này thấy mềm, người kia thấy gắt.

              Bốn chặng, cùng lập luận với `status-scrim.tsx`: một dốc thẳng
              chạm đáy ở một hàng xác định và mắt tìm ra đúng hàng đó.
            */}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, scrimFade]}>
            <View style={styles.scrimBand}>
              <Svg width="100%" height="100%">
                <Defs>
                  <SvgGradient id="sheetScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#000" stopOpacity="0" />
                    <Stop offset="0.3" stopColor="#000" stopOpacity={SCRIM * 0.22} />
                    <Stop offset="0.65" stopColor="#000" stopOpacity={SCRIM * 0.62} />
                    <Stop offset="1" stopColor="#000" stopOpacity={SCRIM} />
                  </SvgGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheetScrim)" />
              </Svg>
            </View>
            {/* Kề sát chứ KHÔNG chồng lên nhau: hai lớp giờ nằm chung một khối
                có độ mờ riêng, mà độ mờ áp lên từng lớp con — chồng một điểm là
                một hàng bị nhân đôi độ tối, tức đúng cái vệt nó sinh ra để
                tránh. Cả hai đều là số nguyên nên kề sát là kín. */}
            <View style={styles.scrimBody} />
            </Animated.View>
            <View style={styles.rest}>
              {/* Lớp bọc CHỈ để đo được nhân vật đang ở đâu trên màn — xem
                  `settleOffscreen`. Nó không mang style nào, nên không thêm một
                  tầng bố cục nào. */}
              <Animated.View ref={koaRef}>
                <Mascot hold={hold} />
              </Animated.View>

          {/* Quick log actions (web chips row) */}
          <View style={styles.quickRow}>
            {quickActions.map((a) => (
              <PressScale
                key={a.route}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  nav.push(a.route);
                }}>
                {/*
                  The same material as the assistant's state pill — blurred
                  glass with a lit top edge — rather than a flat fill with a
                  border. That pill reads as sitting *on* the page, and the
                  reason is the material: a lit edge and a dark shade at the
                  bottom right are what make a surface look raised on a page
                  this dark. A drop shadow cannot do it, because #070708 under
                  #070708 is nothing.

                  `tint` is the glyph's own colour, washed across the glass from
                  the top-left — where the glyph sits. The pill is lit by the
                  thing it contains.
                */}
                {/*
                  Viên pill KHÔNG còn mang màu của glyph.

                  ── luật, và nó áp cho cả app ──

                  Màu dành cho GIÁ TRỊ, không dành cho LỐI ĐI. Vòng tròn, điểm
                  số, macro, biểu đồ — những thứ mà màu NÓI RA một điều gì đó —
                  giữ nguyên. Chip, nút, viền, ô icon điều hướng thì về đơn sắc.

                  Chú thích trước đây ở đây lập luận "viên pill được thắp bằng
                  chính thứ nó chứa". Câu ấy đẹp và nó là THẨM MỸ, không phải một
                  phép đo — và cái giá của nó đọc được ngay trên hàng này: bốn
                  viên cạnh nhau, bốn hue khác nhau, cho bốn thứ mà cái NHÃN đã
                  nói rõ là gì. Màu ở đó không thêm thông tin nào, chỉ tiêu mất
                  sự kiềm chế.

                  Màu không biến mất — nó DỜI vào glyph, nơi nó phân biệt bốn
                  hành động. Bề mặt thôi tranh phần với thứ nó chứa.

                  ── nhưng `tint` KHÔNG bị gỡ, và đó là chỗ `tools/raised-pill.mjs`
                     đúng một nửa ──

                  Luật ấy đòi mỗi pill có `tint` với lý do "kính không màu là
                  kính xám". Nửa ấy là THẬT ở đây: pill này là `material="blur"`,
                  thứ vốn đã bỏ mép sáng và bóng đổ trong lòng kính, nên lớp
                  wash theo tint là NGUỒN SÁNG CUỐI CÙNG còn lại. Gỡ nó đi là
                  trả pill về nằm bẹt trên trang #070708 — đúng chế độ hỏng mà
                  luật ấy được đo để chặn.

                  Nửa còn lại — "tint phải là màu của glyph" — mới là thứ đổi.
                  Nên: giữ nguyên một nguồn sáng, nhưng là MỘT nguồn duy nhất và
                  trung tính. `colors.primary` là bạc của chính thương hiệu, nên
                  wash đọc ra là ÁNH SÁNG chứ không phải một màu.
                */}
                <LiquidGlass style={styles.quickChip} radius={radius.full} tint={c.primary} material="blur">
                  <View style={styles.quickChipInner}>
                    <Glyph name={a.glyph} size={16} />
                    <Text style={styles.quickChipText}>{a.label}</Text>
                  </View>
                </LiquidGlass>
              </PressScale>
            ))}
          </View>
            </View>

          {/* HealthKit sync (native-only necessity, styled as a quick chip row) */}
          {/* KHÔNG còn `&& !heroOpen`, và ba chỗ trong tấm này đều vậy.

              Chúng nằm TRONG hộp cắt, nên chế độ tập trung đã ẩn chúng bằng
              chiều cao. Giữ thêm một cái cổng riêng thì nội dung biến mất ở
              khung hình đầu trong khi hộp cắt còn đang co — tức là hộp cắt
              chạy 240ms trên một cái vỏ RỖNG, và mắt vẫn thấy đúng nhát cắt mà
              cả thay đổi này sinh ra để bỏ. */}
          {healthAvailable && (
            <PressScale
              style={styles.syncButton}
              disabled={healthSync.isPending}
              onPress={() => healthSync.mutate()}>
              {healthSync.isPending ? (
                <ActivityIndicator color={c.foreground} size="small" />
              ) : (
                <>
                  <Icon icon={Heart} size={14} />
                  <Text style={styles.syncText}>{i18n.nSyncHealth}</Text>
                </>
              )}
            </PressScale>
          )}

          {/* Hero widgets (web heroWidgets: readiness, activity) — cards
              cascade in with a light spring on mount (iOS feel).

              Held back until today's log has resolved, so each card mounts
              once at its final height instead of starting as a placeholder
              and growing — see `dayPending`. */}
          {/*
            Three states, not two.

            `dayPending` already hid the widgets while the day was loading. What
            it could not do is tell a failed read from an empty one: on failure
            `isPending` goes false and `data` stays undefined, so every widget
            fell through to its zero case and the page said `0 kcal` with
            complete confidence. Nothing on screen distinguished that from a day
            nobody had logged yet, and the reasonable thing to do about it — log
            the meal again — is the wrong thing.
          */}
          {dayFailed ? <LoadFailed i18n={i18n} onRetry={onRefresh} busy={refreshing} /> : null}

          {/*
            ── loading is a third thing, and it used to look like nothing ──

            `dayPending` rendered `null`, so from the greeting down the page was
            empty until the query resolved. On a warm cache nobody sees it; on a
            cold launch it is several seconds of an app that looks broken.

            Unhiding the widgets is not the answer — that is the page-jump
            `screen.tsx` documents. The answer is to occupy the space they are
            about to take, at the size they are about to take it, which is why
            `widget-heights.ts` remembers what each one measured rather than
            carrying fifteen constants that go stale the first time a card gains
            a row.
          */}
          {dayPending ? (
            <TodaySkeleton part="groups" heroWidgets={config.heroWidgets} groups={config.groups} />
          ) : null}

          {/*
            The hero cards, as one deck rather than a stack.

            `heroWidgets` was already the list of ring cards and it is already
            ordered by the user in edit mode, so the pages ARE that list — no
            new key, nothing migrated, and a third hero becomes a third page
            without anything here changing.

            One `recordHeight` for the whole slot, under `HERO_DECK`: the
            skeleton has one block to draw where the deck will be, and drawing
            two stacked cards' worth of shape for it would be the page-jump
            that mechanism exists to prevent.
          */}

          {/* Grouped widgets, user-configurable order */}
          {dayPending || dayFailed ? null : config.groups.map((group, gi) => (
            <View key={group.id} style={styles.group}>
              {/*
                Nút Sửa neo vào VỊ TRÍ, không vào một mục cụ thể.

                `gi === 0` chứ không phải `group.id === 'health'`: người dùng
                đổi thứ tự mục, đổi tên mục, xoá mục, thêm mục mới — và cái nút
                phải ở nguyên một chỗ qua tất cả những lần ấy. Neo theo id là
                neo vào một thứ người dùng có quyền làm biến mất, và hôm đó nút
                Sửa cũng biến mất theo, không kèm lỗi nào.
              */}
              <GroupHeader
                icon={group.icon}
                title={group.title[lang] ?? group.title.en}
                action={
                  gi === 0 ? (
                    <EditLayoutButton
                      label={i18n.editLayout}
                      a11yLabel={i18n.a11yEditLayout}
                      onPress={() => toggleEdit(true)}
                    />
                  ) : undefined
                }
              />
              {group.widgets.map((key, wi) =>
                /*
                  Sau khi cascade đã chạy, đây là `View` THUẦN — không phải một
                  `Animated.View` mang `entering={undefined}`.

                  ── lỗi nó sửa ──

                  Đổi thứ tự nhóm xong, tiêu đề nhóm đi tới chỗ mới còn các
                  widget của nó vẫn vẽ ở chỗ cũ: chúng chồng lên thẻ của nhóm
                  khác, và chỗ của chúng ở nhóm mới là một khoảng trống cao
                  bằng đúng chúng. Header và widget là hai con của CÙNG một
                  `<View key={group.id}>`, nên chúng chỉ tách rời được nếu
                  widget mang một `transform` còn kẹt lại.

                  `FadeInDown` là nguồn transform duy nhất ở đây. Một node của
                  Reanimated từng khai layout animation vẫn tham gia vào lượt
                  sắp xếp lại của thư viện kể cả khi prop đã là `undefined` —
                  và `lib/entrance.ts` đã ghi ba lỗi khác nhau trong repo này
                  truy về đúng `entering`, cả ba đều vô hình với bộ kiểm.

                  Một node thôi hoạt hoạ thì thôi là node hoạt hoạ. Sau lần
                  arrival đầu tiên, cây này không còn cần Reanimated chạm vào
                  nữa — nên nó không được là `Animated.View`.
                */
                cascaded ? (
                  <View key={key} onLayout={(e) => recordHeight(key, e.nativeEvent.layout.height)}>
                    {withPeek(key, renderWidget(key))}
                  </View>
                ) : (
                  <Animated.View
                    key={key}
                    onLayout={(e) => recordHeight(key, e.nativeEvent.layout.height)}
                    entering={FadeInDown.springify()
                      .damping(26)
                      .stiffness(180)
                      .delay((config.heroWidgets.length + gi + wi) * 70)}>
                    {withPeek(key, renderWidget(key))}
                  </Animated.View>
                ),
              )}
            </View>
          ))}
          </View>
          </Expander>
          </View>
        </>
      )}

      {/* Edit mode — reorder widgets/groups, add/remove groups (web edit mode) */}
      {/*
          Trang sắp xếp hiện ra bằng một lượt mờ NHẸ, và trang được đưa về đầu.

          Hai thứ khác nhau, cùng một lý do: đây là một lần ĐỔI CHẾ ĐỘ. Cả nội
          dung của trang bị thay, chiều cao đổi đột ngột, và ScrollView sẽ tự
          kẹp vị trí cuộn về mốc gần nhất còn hợp lệ — người dùng thấy một cú
          trôi mình không ra lệnh. `toggleHero` đã gặp và đã sửa đúng chuyện
          này; `tools/hero-scroll.mjs` giữ luật cho nó.

          Và KHÁC với hai hiệu ứng vừa bị gỡ ở vòng trước (tấm nội dung mờ
          đi/mờ lại mỗi lần chạm thẻ chỉ số, cascade thẻ chạy lại mỗi lần đóng):
          ở đó không có chuyển cảnh nào để làm mềm, nội dung chỉ bị che rồi
          hiện lại. Ở đây có thật — bạn vừa rời khỏi dashboard và sang một màn
          khác hẳn. `entrance.ts` nói đúng ranh giới ấy: hiệu ứng vào là để làm
          mềm một chuyển cảnh, và nó chỉ sai khi không có chuyển cảnh nào.

          `gap` lặp lại trên vỏ vì `content` của trang dùng `gap` để giãn các
          con TRỰC TIẾP của nó; gộp mấy đứa con này vào một vỏ là gộp mấy khe
          giãn ấy thành một.
      */}
      {editMode && (
        <View style={styles.editWrap}>
          <Text style={styles.editHint}>
            {lang === 'vi'
              ? 'Sắp xếp lại widget và nhóm theo ý bạn'
              : 'Rearrange widgets and groups to your liking'}
          </Text>
          {/*
            Nhấn giữ một thẻ nhóm rồi kéo để đổi thứ tự — và thứ tự ấy CHÍNH LÀ
            thứ tự trên dashboard, vì cả hai đọc cùng `config.groups`. Không có
            bước "lưu": `setConfig` ghi thẳng, nên thoát chế độ sửa là thấy
            ngay.

            Một cú kéo là vô hình với trình đọc màn hình — VoiceOver không có
            "nhấn giữ rồi trượt lên 120 điểm" — nên đường của người dùng ấy là
            accessibility action trên chính tấm thẻ, khai ngay bên dưới. Hai
            nút mũi tên của NHÓM đã đi cùng lúc nút xoá đi; mũi tên của từng
            WIDGET thì còn, vì widget không kéo được.
          */}
          <DragReorder
            gap={spacing.md}
            onMove={moveGroupTo}
            scrollRef={scroller}
            scrollY={scrollY}
            viewportH={viewportH}
            maxScroll={maxScroll}
            items={config.groups.map((group, gi) => ({
              key: group.id,
              node: (
            <MaybeRemovable
              removable={isCustomGroup(group.id)}
              label={i18n.a11yDelete}
              onRemove={() => removeGroup(group.id)}>
            <GlassCard
              style={styles.editGroup}
              accessibilityLabel={group.title[lang] ?? group.title.en}
              accessibilityActions={[
                { name: 'moveUp', label: i18n.a11yMoveUp },
                { name: 'moveDown', label: i18n.a11yMoveDown },
                /* Cú vuốt là vô hình với VoiceOver, y như cú kéo. Nhóm mặc định
                   không có action này vì nó không xoá được. */
                ...(isCustomGroup(group.id) ? [{ name: 'delete', label: i18n.a11yDelete }] : []),
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === 'moveUp') moveGroup(gi, -1);
                if (e.nativeEvent.actionName === 'moveDown') moveGroup(gi, 1);
                if (e.nativeEvent.actionName === 'delete') removeGroup(group.id);
              }}>
              <View style={styles.editGroupHeader}>
                <GroupIconBadge iconKey={group.icon} />
                <Text style={styles.editGroupTitle}>{group.title[lang] ?? group.title.en}</Text>
                {/*
                  ── hai mũi tên đã đi, và tay nắm thay chỗ chúng ──

                  Apple Music không có mũi tên lên/xuống ở chế độ sửa: một tay
                  nắm `≡` ở mép phải, và thế thôi. Ba nút cạnh nhau cho hai
                  việc (dời, xoá) là chỗ mà hàng này vừa hỏng theo đúng nghĩa
                  đen — tay nắm mới vẽ đè lên nút thùng rác.

                  Người dùng VoiceOver KHÔNG mất gì: "dời lên"/"dời xuống" nay
                  là accessibility ACTION trên chính tấm thẻ — đúng cách iOS
                  làm cho một hàng kéo được — nên chúng vẫn đọc được và vẫn bấm
                  được, chỉ là không còn chiếm hai ô trên màn hình của mọi
                  người.

                  Cả cụm điều khiển trượt vào CÙNG NHAU. Bản trước cho tay nắm
                  trượt vào trong khi thùng rác hiện thẳng — hai thứ cạnh nhau
                  chạy hai kiểu, và đó là phần "kì cục".
                */}
                <EditControls index={gi}>
                  <View style={styles.grip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <View style={styles.gripLine} />
                    <View style={styles.gripLine} />
                    <View style={styles.gripLine} />
                  </View>
                </EditControls>
              </View>
              {group.widgets.length === 0 ? (
                <Text style={styles.editEmpty}>
                  {lang === 'vi' ? 'Nhóm trống' : 'Empty group'}
                </Text>
              ) : (
                group.widgets.map((key, wi) => (
                  <View key={key} style={styles.editRow}>
                    <Text style={styles.editRowLabel}>
                      {WIDGET_META[key]?.label[lang] ?? key}
                    </Text>
                    <ArrowBtn
                      icon={ChevronUp}
                      label={i18n.a11yMoveUp}
                      disabled={wi === 0}
                      onPress={() => moveWidget(group.id, wi, -1)}
                    />
                    <ArrowBtn
                      icon={ChevronDown}
                      label={i18n.a11yMoveDown}
                      disabled={wi === group.widgets.length - 1}
                      onPress={() => moveWidget(group.id, wi, 1)}
                    />
                  </View>
                ))
              )}
            </GlassCard>
            </MaybeRemovable>
              ),
            }))}
          />

          {/* Add group (web AddGroupInline) */}
          {/*
            This row is the last thing in edit mode, under every group card, so
            the keyboard opens straight over it and over the button beside it.
            Today builds its own ScrollView rather than going through `Screen`,
            so nothing above it was going to handle that.
          */}
          <View style={styles.addGroupRow}>
            <TextInput
              style={styles.addGroupInput}
              placeholder={lang === 'vi' ? 'Tên nhóm mới…' : 'New group name…'}
              placeholderTextColor={c.mutedForeground}
              value={newGroupName}
              onChangeText={setNewGroupName}
              onSubmitEditing={() => {
                addGroup(newGroupName);
                setNewGroupName('');
              }}
            />
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yAdd}
              style={[styles.addGroupBtn, !newGroupName.trim() && styles.editDisabled, ]}
              disabled={!newGroupName.trim()}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                addGroup(newGroupName);
                setNewGroupName('');
              }}>
              <Icon icon={Plus} size={18} color={c.primaryForeground} />
            </PressScale>
          </View>

          <PressScale
            style={styles.resetBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              resetConfig();
            }}>
            <Icon icon={RotateCcw} size={14} color={c.mutedForeground} />
            <Text style={styles.resetText}>
              {lang === 'vi' ? 'Khôi phục mặc định' : 'Reset to default'}
            </Text>
          </PressScale>
        </View>
      )}
      </Animated.ScrollView>
      {/*
        Hàng nút GHIM, không cuộn theo trang.

        Nó từng là con đầu của ScrollView, nên nó vừa mờ đi vừa TRÔI LÊN cùng nội
        dung — hai chuyển động cho một thứ, và cái trôi là cái mắt bám. Kiểu của
        Apple (Music, Settings) là bar đứng yên rồi tự mờ tại chỗ: chuyển động duy
        nhất là chuyển động của chính nó.

        Ra khỏi vùng cuộn thì phải trả lại ba thứ:
          • chỗ nó từng chiếm trong dòng chảy — `TOP_BAR_H` cộng vào paddingTop
          • quyền chạm khi đã mờ — `pointerEvents` nằm trong chính `topBar`
          • thứ tự vẽ — nó là con SAU ScrollView, vì anh em xếp theo thứ tự nguồn

        `pointerEvents="box-none"` để vùng trống hai bên không nuốt cú chạm rơi
        xuống hero phía dưới.
      */}
      <Animated.View style={[styles.headerBar, { top: insets.top + 12 }, topBar]}>
        {/*
          Ngày và lời chào đều đã bỏ.

          Ngày nói lại thứ thanh trạng thái ngay phía trên đã nói. Lời chào nói
          tên bạn cho chính bạn nghe. Cả hai từng là hai dòng ĐẦU TIÊN của
          trang, tức nửa giây đầu tiên tiêu vào hai câu không đổi được quyết
          định nào. Chỗ đó giờ là chỉ số sẵn sàng.

          ── và chỗ trống ấy giờ là dấu hiệu của app ──

          Sau khi bỏ hai dòng kia, ô này là một `<View>` RỖNG chỉ còn việc đẩy
          hàng nút sang phải. Nó vẫn giữ đúng việc ấy — `flex: 1` không đổi —
          nhưng nay nó cũng nói app này là app nào, ở đúng nơi mọi app khác nói
          điều đó và mắt đã biết tìm.

          Nó không chạm được và không nhận cú chạm: `headerBar` là
          `pointerEvents="box-none"`, nên cú chạm rơi vào khoảng trống bên cạnh
          logo vẫn đi xuống hero phía dưới như trước.
        */}
        <View style={styles.headerText}>
          <BrandLockup />
        </View>
        <View style={styles.headerButtons}>
          {/* The streak sits before the buttons because it is a *reading*, not
              an action — and it is only ever here, in the bar you land on. */}
          {!editMode && <StreakChip />}
          {editMode && (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yDoneEditing}
            accessibilityState={{ selected: true }}
            style={[styles.squareBtn, styles.squareBtnActive]}
            onPress={() => toggleEdit(false)}>
            <Icon icon={Check} size={20} color={c.primary} />
          </PressScale>
          )}
          {!editMode && (
            <>
              {/*
                ── the AI button that used to sit here is gone ──

                It was a `Sparkles` that pushed `/ai-coach`, and it was the only
                path in the app that jumped *past* the Health Assistant into a
                bare chat. Every other route is assistant → coach, which is the
                flow the two screens were built around: the hub first, the
                conversation after, with today's questions already in hand.

                Its destination had also become the worse one. Since the coach
                stopped raising the keyboard on arrival, that button landed you
                on an empty transcript with the burden of thinking of a
                question — while one tap on the assistant's coach card asks
                something specific about today's numbers.

                And the tab bar's search island is on screen at that exact
                moment, a thumb away, going somewhere better. Two AI buttons on
                one screen pointing at two different screens is the confusion
                this app has already spent a day removing once.

                What is lost: the one-tap route for somebody who just wants to
                type. That is now two taps through the assistant, and the same
                two taps ask a better question.
              */}
              {/*
                Settings, và đây là lối vào DUY NHẤT.

                Chú thích trước đây ở đúng chỗ này ghi: *"It is also the fifth
                tab now, so this is a second way in rather than the only one"*.
                Câu ấy đã thôi đúng và không ai sửa. `app-tabs.tsx` nói ngược
                lại, bằng chữ: *"four tabs, and Settings is not one of them…
                It is reached from the Today header, where its button had
                always been."*

                Ghi lại ở đây vì tôi đã tin câu cũ và đưa nó cho người dùng như
                một dữ kiện khi hỏi họ nên gộp kiểu nào — tức là một chú thích
                lệch khỏi mã đã trực tiếp lái một quyết định sản phẩm. Đó đúng
                là chế độ hỏng mà repo này đi săn, và lần này nó bắt được chính
                tôi.

                Hệ quả cho cái gộp bên dưới: chạm thứ hai vào bánh răng là
                đường duy nhất tới Cài đặt trong cả app, nên nhánh
                `nav.push('/settings')` không phải một tiện ích — mất nó là
                mất hẳn màn hình. `tools/tool-merge.mjs` canh đúng điều đó.
              */}
              {/*
                Avatar: một chạm, vào Cài đặt.

                Nó từng mang hai việc — chạm một mở nút chỉnh sửa ra, chạm hai
                mới đi — hồi nút chỉnh sửa còn nấp sau nó. Nút ấy nay nằm ở
                hàng tiêu đề mục đầu tiên, nên ở đây không còn gì để mở ra, và
                một nút hai việc mà việc thứ nhất đã biến mất chỉ còn là một
                cú chạm thừa.

                Gỡ nó cũng trả lại thứ đã mất: Cài đặt KHÔNG có lối vào nào
                khác — `app-tabs.tsx` chỉ dựng bốn Trigger — nên hai chạm ở đây
                là hai chạm trong cả app.
              */}
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.a11ySettings}
                style={styles.avatarBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  nav.push('/settings');
                }}>
                <AccountAvatar name={profile?.name} email={user?.email} />
              </PressScale>
            </>
          )}
        </View>
      </Animated.View>
      {/*
        Last child, after the scroll view: siblings stack in source order, so a
        strip written above it would be painted underneath and cover nothing.
      */}
      <StatusScrim />
    </View>
  );
}

/**
 * Cụm điều khiển của chế độ sửa, trượt vào từ mép phải.
 *
 * ── vì sao trượt, và vì sao CẢ CỤM ──
 *
 * Bản trước cho cả trang sắp xếp một lượt `FadeIn`. Người dùng gọi nó là "kì",
 * và đúng: mờ cả trang đọc ra như trang vừa được TẢI LẠI, trong khi thứ vừa
 * xảy ra là bạn đổi chế độ của một trang vẫn đang ở đó.
 *
 * Apple Music làm ngược lại: trang đứng yên, và những điều khiển MỚI trượt vào
 * từ mép phải, lệch nhau một nhịp ngắn. Chuyển động chỉ nằm ở thứ vừa xuất
 * hiện, nên nó nói đúng một điều — "đây là những nút bạn vừa mở ra".
 *
 * Bản sau đó cho riêng tay nắm trượt vào trong khi thùng rác hiện thẳng: hai
 * thứ cạnh nhau chạy hai kiểu, và đó là phần kì cục thứ hai. Nên cái trượt
 * phải là CẢ CỤM.
 *
 * Lệch 40ms mỗi nhóm: đủ để đọc ra một hàng chứ không phải một khối, đủ ngắn
 * để nhóm cuối không phải chờ. Bốn nhóm là 120ms cho toàn bộ.
 */
/**
 * Nhóm do người dùng tạo thì vuốt được để xoá; nhóm mặc định thì không bọc gì.
 *
 * ── vì sao vuốt chứ không phải một nút ──
 *
 * Một nút xoá đứng thường trực cạnh tên nhóm là một thao tác không hoàn tác
 * được, đặt ngang hàng với hai thao tác vô hại (dời, đổi tên), trên một hàng
 * người ta lướt qua. iOS đặt xoá sau một cú vuốt đúng vì lý do ấy: nó đòi một
 * cử chỉ có chủ đích, và nó cho người ta thấy hậu quả (viên đỏ) trước khi buông
 * tay.
 *
 * Mở được từ CẢ HAI mép, vì ở đây cú vuốt là đường DUY NHẤT — không còn nút xoá
 * nào trên màn hình — và một đường duy nhất thì không nên bắt người dùng đoán
 * đúng chiều.
 *
 * ── vì sao KHÔNG bọc nhóm mặc định ──
 *
 * Không phải để "vô hiệu hoá": bọc rồi chặn ở `onAction` vẫn cho thẻ trượt
 * theo ngón tay và vẫn hiện viên đỏ, tức vẫn hứa một việc rồi nuốt lời. Không
 * bọc thì không có gì để trượt, và câu trả lời là im lặng ngay từ đầu.
 */
function MaybeRemovable({
  removable,
  label,
  onRemove,
  children,
}: {
  removable: boolean;
  label: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  if (!removable) return <>{children}</>;
  return (
    <SwipeRow bothEdges icon={CircleMinus} label={label} onAction={onRemove}>
      {children}
    </SwipeRow>
  );
}

/**
 * Cụm nút của một nhóm, trượt vào từ phải khi chế độ sắp xếp mở.
 *
 * Lò xo từng là `{ damping: 22, stiffness: 240 }` — quy ra bounce 0,29, sát
 * trần `.bouncy` của iOS. Với `translateX` 28 điểm thì cái nảy ấy đưa cụm nút
 * VƯỢT QUA chỗ của nó khoảng 8 điểm rồi kéo ngược lại. Một cái điều khiển đang
 * đi vào chỗ cố định của nó thì dừng ở chỗ ấy; nảy qua rồi về đọc ra là nó
 * chưa biết mình đứng đâu.
 *
 * `snappy` giữ lại chút sức nặng — đây vẫn là một cú trượt vào, không phải một
 * cú hiện ra — nhưng vượt quá chỉ còn ~4 điểm.
 */
function EditControls({ index, children }: { index: number; children: React.ReactNode }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withDelay(index * 40, withSpring(1, spring(0.4, BOUNCE.snappy)));
  }, [enter, index]);
  const style = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateX: (1 - enter.value) * 28 }],
  }));
  return (
    <Animated.View style={[styles.editControls, style]}>{children}</Animated.View>
  );
}

function ArrowBtn({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: typeof ChevronUp;
  /** "Move up" / "Move down" — a chevron alone says nothing to a reader */
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      // 30pt drawn; 7 of slop brings the target to 44, the HIG floor
      hitSlop={7}
      disabled={disabled}
      style={[styles.arrowBtn, disabled && styles.editDisabled]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}>
      <Icon icon={icon} size={15} color={c.mutedForeground} />
    </PressScale>
  );
}

/**
 * Một lớp nền, sáng lên đúng bằng mức trang của nó đang ở giữa màn hình.
 *
 * Không phải một phép nội suy giữa hai MÀU, mà là hai lớp chồng nhau mờ dần
 * vào nhau. Đổi màu bên trong một gradient SVG nghĩa là animate thuộc tính của
 * SVG trên UI thread; chồng-mờ chỉ là opacity, thứ vốn đã chạy ở đó.
 */
function AuraLayer({
  index,
  at,
  children,
}: {
  index: number;
  at: SharedValue<number>;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(at.value - index), [0, 1], [1, 0], 'clamp'),
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {children}
    </Animated.View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  // See the note at the top of the return — transparent so `AmbientLight`,
  // which sits behind this in the wrapper, is not painted over.
  scroller: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: spacing.md, gap: spacing.md },
  /* Cancels the page's own horizontal padding so the deck reaches both edges.
     Tied to the same token the padding uses, not a second copy of the number —
     change `content` and this follows it. */
  heroFull: {
    marginHorizontal: -spacing.md,
    /*
      Chỗ cho tấm nội dung đè lên, và nó phải là KHOẢNG TRỐNG chứ không phải
      hàng pip.

      Tấm bắt đầu ở trong hero bằng một lề âm. Không có phần đệm này thì thứ nó
      đè lên đầu tiên là hàng chấm chỉ trang — đo trên ảnh: pip bị cắt còn một
      chấm mờ. Đệm đúng bằng độ chồng lấn thì hàng pip bị đẩy lên khỏi vùng bị
      che, và tấm ăn vào nền chứ không ăn vào điều khiển.

      ── và "đúng bằng" là KHÔNG đủ ──

      Đệm bằng đúng `spacing.xl` thì mép trên của tấm rơi vào ĐÚNG hàng pixel
      cuối cùng của hàng chấm: không chồng lên, nhưng cũng không chừa một điểm
      nào. Mà mép ấy là chỗ lớp phủ tối bắt đầu — ở trạng thái nghỉ nó đã đậm
      `SCRIM_REST` rồi — nên các chấm ngồi ngay trên một vùng tối đặc và đọc ra
      là "bị một đường kẻ đen cắt qua", đúng như đã báo kèm ảnh.

      Nên đệm là độ chồng lấn CỘNG một khoảng thở cho chính hàng chấm. Cái
      trước cho tấm chỗ để ăn vào; cái sau giữ hàng chấm ở ngoài mép đó.
    */
    paddingBottom: spacing.xl + spacing.md,
  },
  /* Cùng khoảng cách dọc mà `content` cấp, vì khối này thay chỗ cho các con
     trực tiếp của nó chứ không thêm một tầng bố cục mới. */
  rest: { gap: spacing.md },
  /*
    Mép trên bo tròn, và một lề ÂM để nó bắt đầu ở trong hero.

    `overflow: 'hidden'` là bắt buộc chứ không phải để cho gọn: không có nó thì
    lớp blur tràn ra ngoài bốn góc bo và cái bo tròn không còn nghĩa gì.

    Lề ngang âm cho tấm chạm hai mép màn hình giống hero — một tấm hẹp hơn thứ
    nó đang đè lên sẽ để lộ hai dải hero ở hai bên và thành ba đường thẳng đứng
    thay vì một mặt phẳng.
  */
  /* Hộp của lớp kính: neo TRÊN, cao theo `SCRIM_FADE + cover` — xem ghi chú ở
     chỗ dùng. Không `bottom`, vì chiều cao ở đây là cả điểm của thay đổi. */
  sheetGlass: { position: 'absolute', left: 0, right: 0, top: 0 },
  scrimBand: { position: 'absolute', left: 0, right: 0, top: 0, height: SCRIM_FADE },
  /* Trắng đặc = giữ nguyên; cùng mốc với `scrimBody` nên blur và lớp phủ kết
     thúc dải chuyển ở đúng một hàng. */
  /* Dừng trên dải tắt, không chạm đáy hộp — nếu nó còn `bottom: 0` thì trắng
     đặc sẽ đè lên chính dải đang làm việc tắt dần. */
  maskBody: { position: 'absolute', left: 0, right: 0, top: SCRIM_FADE, bottom: GLASS_TAIL, backgroundColor: '#fff' },
  maskTail: { position: 'absolute', left: 0, right: 0, bottom: 0, height: GLASS_TAIL },
  scrimBody: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCRIM_FADE,
    bottom: 0,
    backgroundColor: `rgba(0, 0, 0, ${SCRIM})`,
  },
  /*
    Hai lề âm của tấm, tách ra khỏi `sheet` — và việc tách là bắt buộc, không
    phải để cho gọn.

    `sheet` nay nằm trong hộp cắt của `Expander`, và hộp ấy là `overflow:
    hidden`. Một `marginHorizontal: -spacing.md` bên TRONG một hộp cắt thì bị
    chính hộp ấy gọt: tấm thôi chạm hai mép màn, để lộ hai dải hero ở hai bên —
    đúng "ba đường thẳng đứng thay vì một mặt phẳng" mà lề âm sinh ra để bỏ. Không
    có lỗi nào báo, và cả hai lề vẫn nằm nguyên trong style.

    Nên bleed ở lớp NGOÀI hộp cắt, padding ở lớp trong. `tools/hero-focus.mjs`
    giữ luật này.
  */
  sheetBleed: { marginHorizontal: -spacing.md, marginTop: -spacing.xl },
  sheet: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    /*
      KHÔNG bo góc trên, và không có nó thì tấm này thôi là một cái thẻ.

      Hai góc bo cộng một mép ngang là ba cạnh của một hình chữ nhật, và mắt tự
      khép cạnh thứ tư: người xem thấy một TẤM đặt lên hero chứ không thấy trang
      tiếp tục chảy xuống. Vuốt qua lại thì cái tấm đó đứng im trong khi nội dung
      dưới nó đổi, và chỗ nối đọc ra như hai màn hình ghép lại.

      `overflow: 'hidden'` thì giữ, nhưng vì lý do khác lý do cũ: lớp blur và lớp
      phủ đều là `absoluteFill`, nên không cắt thì chúng tràn ra ngoài hộp.
    */
    overflow: 'hidden',
  },

  // Header (web: date 13px muted / greeting 22px bold, name silver)
  /* Ghim: cùng lề ngang với `content` nên các nút thẳng hàng với nội dung bên
     dưới, và `top` là cùng con số `paddingTop` của content dùng. */
  headerBar: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerText: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: c.foreground, marginTop: 2 },
  greetingName: { color: c.primary },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  squareBtn: {
    /* Cùng con số với `TOP_BAR_H`: hàng cao bằng nút, và phần đệm bù cho chỗ
       hàng từng chiếm được tính từ đó. Hai bản sao sẽ lệch. */
    width: TOP_BAR_H,
    height: TOP_BAR_H,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.border, 0.3),
    backgroundColor: alpha(c.secondary, 0.2),
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Cùng dấu chân với `squareBtn` — vùng chạm và chiều cao hàng vẫn do
     `TOP_BAR_H` quyết định — nhưng KHÔNG viền, KHÔNG nền, KHÔNG bo góc: mặt
     tròn do `AccountAvatar` tự vẽ, và một ô bo 16 nằm sau một vòng tròn là hai
     hình chồng nhau. */
  avatarBtn: { width: TOP_BAR_H, height: TOP_BAR_H, alignItems: 'center', justifyContent: 'center' },
  squareBtnActive: { backgroundColor: alpha(c.primary, 0.2), borderColor: alpha(c.primary, 0.4) },

  // Quick chips (web: rounded-xl bordered secondary/20)
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  /*
    A pill, and 44 points tall.

    `radius.sm` made these read as small buttons; the pill is what the
    assistant's chips already are, and matching it means the app has one shape
    for "a thing you tap to go somewhere" instead of two.

    The height is Apple's floor for a touch target, and it was 36. That is not a
    rounding error — `tools/tap-targets.mjs` exists in this repository because
    of exactly this, and its note quotes the same 44. A row used several times a
    day is the last place to be eight points short.
  */
  /* The glass carries the shape; the padding lives inside it — the same split
     the assistant's state pill uses. */
  quickChip: {
    borderRadius: radius.full,
  /* A firmer edge than a card's.

     `glass.border` is 12% white at half a point, and that is right for a large
     panel sitting in the aura on the assistant screen, where there is light
     behind the glass for the edge to catch. Today has `AmbientLight`, which is
     much quieter, and a pill is a fraction of a card's area — the same hairline
     that outlines a whole panel disappears around something this small. So the
     edge is carried here, where the surface is little and the light behind it
     is low. */
  borderColor: alpha(m.ink, 0.22),
  borderWidth: 1,
  },
  quickChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: spacing.md,
  },
  quickChipText: { ...type.footnote, fontWeight: '600', color: c.foreground },

  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(c.border, 0.3),
    backgroundColor: alpha(c.secondary, 0.2),
  },
  syncText: { fontSize: 13, fontWeight: '500', color: c.foreground },

  // Groups (web WidgetGroupSection)
  group: { gap: spacing.sm + 4, marginTop: spacing.xs },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 4 },
  groupIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: alpha(c.foreground, 0.8) },
  /* Nút Sửa. Nhạt hơn tiêu đề một bậc và KHÔNG mang màu nhấn — cùng luật đã áp
     cho các viên chip và cho avatar: màu dành cho GIÁ TRỊ, không dành cho LỐI
     ĐI. Cỡ 13 để nó ngồi dưới tiêu đề 14 trong cùng một hàng chứ không tranh
     chỗ với nó. */
  groupAction: { fontSize: 13, fontWeight: '500', color: c.mutedForeground },
  /* `xs` (4 điểm) chứ không phải `sm`: icon và chữ ở đây là MỘT nhãn, không
     phải hai thứ cạnh nhau. Rộng hơn thì chúng rời ra và cái icon đọc ra như
     của mục bên trái. */
  groupActionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: 4 },

  // Empty states (web EmptyState)
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.7, color: c.mutedForeground },
  emptyMsg: { fontSize: 13, color: 'rgba(107,107,107,0.8)', textAlign: 'center', maxWidth: 220, lineHeight: 19 },


  // Edit mode (web widget-group edit)
  editHint: { fontSize: 13, color: c.mutedForeground, textAlign: 'center', marginTop: spacing.xs },
  editGroup: { gap: spacing.sm },
  /* Lặp `gap` của `content`: gộp mấy đứa con vào một vỏ là gộp mấy khe giãn
     mà `content` vốn đặt giữa chúng thành một. */
  editWrap: { gap: spacing.md },
  /* Cụm nút bên phải hàng tiêu đề nhóm. `gap` bằng đúng `gap` của hàng, nên
     việc gom chúng vào một vỏ không đổi khoảng cách nào. */
  editControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  /* Tay nắm ba vạch. Cùng dấu chân với `arrowBtn` (30pt) để hàng không lệch
     nhịp, nhưng KHÔNG viền không nền: nó là kết cấu chứ không phải một nút —
     cả tấm thẻ mới là vùng kéo. */
  grip: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', gap: 3 },
  gripLine: { width: 15, height: 1.5, borderRadius: 1, backgroundColor: alpha(c.foreground, 0.34) },
  editGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editGroupTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: c.foreground },
  editEmpty: { fontSize: 12, color: c.mutedForeground, fontStyle: 'italic', paddingVertical: 4 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm,
    backgroundColor: alpha(c.secondary, 0.4),
  },
  editRowLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: c.foreground },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: alpha(m.ink, 0.06),
  },
  editDisabled: { opacity: 0.3 },
  addGroupRow: { flexDirection: 'row', gap: spacing.sm },
  addGroupInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: alpha(c.primaryForeground, 0.5),
    paddingHorizontal: spacing.md,
    color: c.foreground,
    fontSize: 15,
  },
  addGroupBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: radius.md,
  },
  resetText: { fontSize: 13, fontWeight: '500', color: c.mutedForeground },
}));

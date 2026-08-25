import { useQueryClient } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  Apple,
  Check,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Heart,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedScrollHandler,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
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
import { PeekHost } from '@/components/ascnd/card-peek';
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
import { duration } from '@/constants/motion';
import { HERO_RING, colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
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
import { useWidgetConfig, WIDGET_META, type WidgetKey } from '@/hooks/use-widget-config';
import { CardDeck } from '@/components/ascnd/card-deck';
import { NutritionHero, SleepHero, WaterHero } from '@/components/ascnd/hero-pages';
import { HERO_DECK, recordHeight } from '@/lib/widget-heights';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';
import { handleTabScroll } from '@/lib/tab-bar-visibility';

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
 * Quãng cuộn mà hero mờ hết trong đó: hai phần ba màn hình.
 *
 * Neo vào CHIỀU CAO MÀN HÌNH chứ không vào đường kính vòng tròn, và đó là một
 * đổi ý có lý do. Vòng tròn cùng cỡ trên mọi máy, nên lấy nó làm đơn vị thì trên
 * một máy nhỏ hero tắt sau khi đã cuộn gần hết trang, còn trên máy lớn nó tắt
 * khi mới đi được một phần tư — cùng một con số, hai cảm giác khác nhau.
 *
 * "Hai phần ba những gì đang nhìn thấy" thì giống nhau ở mọi máy.
 */
const HERO_GONE_FRACTION = 0.66;

/* `intensity` là một prop chứ không phải một style, nên nó phải đi qua
   `animatedProps`; `useAnimatedStyle` không chạm tới được. */
const ABlurView = Animated.createAnimatedComponent(BlurView);

const GROUP_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  '❤️': { icon: Heart, color: '#ff4d6d' },
  '🍎': { icon: Apple, color: colors.readinessGreen },
  '💪': { icon: Dumbbell, color: colors.metricOrange },
  '✨': { icon: Sparkles, color: colors.metricPurple },
  '📌': { icon: Pin, color: colors.metricBlue },
};

/** Neon-tinted icon chip for a widget group */
function GroupIconBadge({ iconKey }: { iconKey: string }) {
  const meta = GROUP_ICONS[iconKey] ?? GROUP_ICONS['📌'];
  return (
    <View style={[styles.groupIconBadge, { backgroundColor: `${meta.color}1f` }]}>
      <Icon icon={meta.icon} size={13} color={meta.color} />
    </View>
  );
}

/** Section header — web WidgetGroupSection: icon chip + semibold title */
function GroupHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.groupHeader}>
      <GroupIconBadge iconKey={icon} />
      <Text style={styles.groupTitle}>{title}</Text>
    </View>
  );
}

export default function TodayScreen() {
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
  const { data: sleep } = useTodaySleep();
  const { data: waterMl } = useTodayWater();
  const { available: healthAvailable, sync: healthSync } = useHealthSync();
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const queryClient = useQueryClient();
  const { config, editMode, setEditMode, moveWidget, moveGroup, removeGroup, addGroup, resetConfig } =
    useWidgetConfig();
  const { goal: stepsGoal } = useStepsGoal();
  // Reminders are dated one-shots, so the schedule has to be rebuilt as the day
  // is lived — see `useReminderSync`.
  useReminderSync();
  const [newGroupName, setNewGroupName] = useState('');

  // Pull-to-refresh (web PullToRefresh: invalidate everything)
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    // The gesture has no button to press, so the tap it never gets is repaid
    // here: the pull is confirmed the moment it takes, not when data lands.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await queryClient.invalidateQueries();
    setRefreshing(false);
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
  const [heroOpen, setHeroOpen] = useState(false);

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
  /* Đọc một lần ở JS, dùng trong worklet như một hằng số — không phải shared
     value, vì chiều cao màn hình không đổi giữa hai frame. */
  const gone = useWindowDimensions().height * HERO_GONE_FRACTION;
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
    /* Thanh tab vẫn cần con số này ở JS thread — nó ẩn/hiện bằng state React. */
    runOnJS(handleTabScroll)(e.contentOffset.y);
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
  /* Chế độ tập trung tắt hẳn hiệu ứng theo cuộn.

     Khi chi tiết đang mở thì hero VÀ khối số của nó chính là nội dung — cuộn
     xuống là để đọc tiếp, không phải để rời đi. Làm mờ thứ người ta đang đọc là
     trả lời sai câu hỏi họ vừa hỏi. */
  const focusSV = useSharedValue(0);
  useEffect(() => {
    focusSV.value = heroOpen ? 1 : 0;
  }, [heroOpen, focusSV]);

  const heroSlide = useAnimatedStyle(() => {
    if (focusSV.value === 1) return { transform: [{ translateY: 0 }, { scale: 1 }], opacity: 1 };
    return {
    transform: [
      /*
        Hero đi cùng trang, và MỜ là toàn bộ chuyển động của nó.

        ── ba lần tôi làm hỏng chỗ này ──

        Đầu tiên là 0.5: hero trôi ngược lại nửa tốc độ, và người dùng nói nó
        chạy quá nhiều. Rồi 0.12, rồi 0.05 — vẫn là trôi, chỉ chậm hơn. Rồi tôi
        đọc "đứng yên" theo nghĩa đen và đặt hệ số 1 để ghim cứng nó vào màn
        hình; nó ghim thật, và nó sai cảm giác.

        Bản người dùng khen là bản KHÔNG có hệ số nào cả: hero cuộn đi như mọi
        thứ khác trên trang, và thứ duy nhất xảy ra với nó là mờ dần rồi biến
        mất. Không có gì trôi ngược, không có gì bị ghim — chỉ có một trang cuộn
        bình thường và một thứ tan đi đúng lúc nó không còn cần thiết.

        `translateY` giữ nguyên trong mảng chứ không bỏ, vì `scale` cũng ở đây và
        một mảng transform lúc có lúc không cùng một khoá là cách nhanh nhất để
        Reanimated nội suy nhầm.
      */
      { translateY: 0 },
      { scale: interpolate(scrollY.value, [HERO_HOLD, gone], [1, 0.97], 'clamp') },
    ],
    opacity: interpolate(scrollY.value, [HERO_HOLD, gone], [1, 0], 'clamp'),
    };
  });

  /* Và tấm đục dần lên theo đúng quãng đó: lúc đứng yên nó gần như trong suốt
     để thấy được mình đang nằm trên cái gì, cuộn hết thì nó là một mặt phẳng
     để chữ không phải cạnh tranh với bất cứ thứ gì. */
  const sheetBlur = useAnimatedProps(() => {
    if (focusSV.value === 1) return { intensity: 12 };
    return {
    /* Tấm đục dần theo ĐÚNG quãng hero mờ, nên hai thứ là một chuyển động chứ
       không phải hai cái chạy lệch nhau. */
    intensity: interpolate(scrollY.value, [HERO_HOLD, gone], [12, 44], 'clamp'),
    };
  });
  const toggleHero = useCallback(() => {
    Haptics.selectionAsync();
    setHeroOpen((v) => !v);
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
        const pair: Partial<Record<WidgetKey, [string, string]>> = {
          activity: [colors.metricOrange, colors.metricPurple],
          nutrition: [colors.readinessGreen, colors.metricOrange],
          water: [colors.metricBlue, colors.metricCyan],
        };
        const own = pair[key];
        return {
          key,
          status: own ? null : readinessScore != null ? readinessStatus : null,
          tint: own?.[0],
          /* Trang sẵn sàng không khai cặp: nó lấy màu theo trạng thái, và tông
             thứ hai là màu lạnh cạnh nó trên cùng thang. */
          tint2: own?.[1] ?? (readinessStatus === 'red' ? colors.metricOrange : colors.metricBlue),
        };
      }),
    [config.heroWidgets, readinessScore, readinessStatus],
  );

  /* Cùng một khoá vẽ ra hai hình dạng tuỳ chỗ nó đứng, và câu hỏi "nó đứng ở
     đâu" chỉ có một chỗ trả lời. */
  const inHero = (key: WidgetKey) => config.heroWidgets.includes(key);

  const renderWidget = (key: WidgetKey): React.ReactNode => {
    switch (key) {
      case 'readiness':
        return readinessScore != null ? (
            <ReadinessGauge
              detailOpen={heroOpen}
              onToggleDetail={toggleHero}
              onOpenDetail={() => router.push('/biometrics')}
              score={readinessScore}
              status={readinessStatus}
              explain={dailyLog?.readiness_explain}
              recommendation={dailyLog?.readiness_recommendation}
              acwr={dailyLog?.acwr != null ? Number(dailyLog.acwr) : null}
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
            detailOpen={heroOpen}
            onToggleDetail={toggleHero}
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
            onLogWorkout={() => router.push('/log-workout')}
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
              detailOpen={heroOpen}
              onToggleDetail={toggleHero}
              onOpenDetail={() => router.push('/sleep-insights')}
            />
          );
        }
        return sleepTotalMin > 0 ? (
          <PressScale onPress={() => { Haptics.selectionAsync(); router.push('/sleep-insights'); }}>
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
          <PressScale onPress={() => router.push('/log-sleep')}>
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
              onOpenDetail={() => router.push('/nutrition')}
              kcal={kcal}
              calorieTarget={calorieTarget}
              protein={Number(dailyLog?.protein_g) || 0}
              carbs={Number(dailyLog?.carbs_g) || 0}
              fat={Number(dailyLog?.fat_g) || 0}
              detailOpen={heroOpen}
              onToggleDetail={toggleHero}
            />
          );
        }
        // Both states open the Nutrition tab, whose first segment is the day's
        // diary — the numbers on this card, and under them the meals they came
        // from. The card used to be inert when it had something to say and a
        // shortcut to `/log-meal` only when it was empty, which is backwards:
        // the moment you want more detail is the moment there *is* detail.
        return (
          <PressScale onPress={() => { Haptics.selectionAsync(); router.push('/nutrition'); }}>
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
              onOpenDetail={() => router.push('/water')}
              ml={waterMl ?? 0}
              targetMl={waterTarget}
              detailOpen={heroOpen}
              onToggleDetail={toggleHero}
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
    <View style={styles.root}>
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
      {heroTints.length > 1 ? (
        heroTints.map((t, i) => (
          <AuraLayer key={t.key} index={i} at={deckAt}>
            <ReadinessAura status={t.status} tint={t.tint} tint2={t.tint2} />
          </AuraLayer>
        ))
      ) : (
        <ReadinessAura status={readinessScore != null ? readinessStatus : null} />
      )}
      <Animated.ScrollView
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
        { paddingTop: insets.top + 12, paddingBottom: BottomTabInset + insets.bottom + spacing.lg },
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
          tintColor={colors.mutedForeground}
          progressViewOffset={insets.top + 12}
        />
      }
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentInsetAdjustmentBehavior="never">
      {/* Greeting + actions (web Index header) */}
      <View style={styles.headerRow}>
        {/*
          Ngày và lời chào đều đã bỏ.

          Ngày nói lại thứ thanh trạng thái ngay phía trên đã nói. Lời chào nói
          tên bạn cho chính bạn nghe. Cả hai từng là hai dòng ĐẦU TIÊN của
          trang, tức nửa giây đầu tiên tiêu vào hai câu không đổi được quyết
          định nào. Chỗ đó giờ là chỉ số sẵn sàng, và hàng này chỉ còn các nút.
        */}
        <View style={styles.headerText} />
        <View style={styles.headerButtons}>
          {/* The streak sits before the buttons because it is a *reading*, not
              an action — and it is only ever here, in the bar you land on. */}
          {!editMode && <StreakChip />}
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={editMode ? i18n.a11yDoneEditing : i18n.a11yEditLayout}
            accessibilityState={{ selected: editMode }}
            style={[styles.squareBtn, editMode && styles.squareBtnActive]}
            onPress={() => {
              Haptics.selectionAsync();
              setEditMode(!editMode);
              setNewGroupName('');
            }}>
            <Icon
              icon={editMode ? Check : Pencil}
              size={editMode ? 20 : 17}
              color={editMode ? colors.primary : 'rgba(237,237,237,0.7)'}
            />
          </PressScale>
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
              {/* Settings, back where it was. It is also the fifth tab now, so
                  this is a second way in rather than the only one — kept
                  because it is where the hand already goes on this page. */}
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.a11ySettings}
                style={styles.squareBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.push('/settings');
                }}>
                <Icon icon={Settings} size={20} color="rgba(237,237,237,0.7)" />
              </PressScale>
            </>
          )}
        </View>
      </View>

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
              onLayout={(e) => recordHeight(HERO_DECK, e.nativeEvent.layout.height)}
              entering={FadeInDown.springify().damping(26).stiffness(180)}>
              <CardDeck progress={deckAt}>
                {config.heroWidgets.map((key) => (
                  <View key={key}>{withPeek(key, renderWidget(key))}</View>
                ))}
              </CardDeck>
            </Animated.View>
          )}

          {/*
            Phần còn lại của trang, biến mất khi chi tiết mở.

            Mount có điều kiện chứ không phải `opacity: 0`: một khối vô hình vẫn
            chiếm chiều cao của nó, nên trang sẽ có một vùng trống bằng cả
            dashboard bên dưới vòng tròn. Hiệu ứng ra/vào lo phần chuyển động;
            việc gỡ khỏi cây lo phần chiều cao.
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
          <View style={styles.sheet}>
            <ABlurView animatedProps={sheetBlur} tint="dark" style={StyleSheet.absoluteFill} />
          {!heroOpen ? (
            <Animated.View
              style={styles.rest}
              entering={FadeIn.duration(duration.appear)}
              exiting={FadeOut.duration(duration.toggle)}>
              <Mascot />

          {/* Quick log actions (web chips row) */}
          <View style={styles.quickRow}>
            {quickActions.map((a) => (
              <PressScale
                key={a.route}
                accessibilityRole="button"
                accessibilityLabel={a.label}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(a.route);
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
                <LiquidGlass style={styles.quickChip} radius={radius.full} tint={GLYPH_TINT[a.glyph][1]}>
                  <View style={styles.quickChipInner}>
                    <Glyph name={a.glyph} size={16} />
                    <Text style={styles.quickChipText}>{a.label}</Text>
                  </View>
                </LiquidGlass>
              </PressScale>
            ))}
          </View>
            </Animated.View>
          ) : null}

          {/* HealthKit sync (native-only necessity, styled as a quick chip row) */}
          {/* `!heroOpen` cùng với mọi thứ khác trong tấm: nó nằm ngoài cái cổng
              đó nên ở chế độ tập trung nó là dòng DUY NHẤT còn sót lại dưới
              vòng tròn — đúng cái "loạn thông tin" mà chế độ này sinh ra để
              dọn. */}
          {healthAvailable && !heroOpen && (
            <PressScale
              style={styles.syncButton}
              disabled={healthSync.isPending}
              onPress={() => healthSync.mutate()}>
              {healthSync.isPending ? (
                <ActivityIndicator color={colors.foreground} size="small" />
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
          {dayPending && !heroOpen ? (
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
          {dayPending || dayFailed || heroOpen ? null : config.groups.map((group, gi) => (
            <View key={group.id} style={styles.group}>
              <GroupHeader icon={group.icon} title={group.title[lang] ?? group.title.en} />
              {group.widgets.map((key, wi) => (
                <Animated.View
                  key={key}
                  onLayout={(e) => recordHeight(key, e.nativeEvent.layout.height)}
                  entering={FadeInDown.springify()
                    .damping(26)
                    .stiffness(180)
                    .delay((config.heroWidgets.length + gi + wi) * 70)}>
                  {withPeek(key, renderWidget(key))}
                </Animated.View>
              ))}
            </View>
          ))}
          </View>
        </>
      )}

      {/* Edit mode — reorder widgets/groups, add/remove groups (web edit mode) */}
      {editMode && (
        <>
          <Text style={styles.editHint}>
            {lang === 'vi'
              ? 'Sắp xếp lại widget và nhóm theo ý bạn'
              : 'Rearrange widgets and groups to your liking'}
          </Text>
          {config.groups.map((group, gi) => (
            <GlassCard key={group.id} style={styles.editGroup}>
              <View style={styles.editGroupHeader}>
                <GroupIconBadge iconKey={group.icon} />
                <Text style={styles.editGroupTitle}>{group.title[lang] ?? group.title.en}</Text>
                <ArrowBtn
                  icon={ChevronUp}
                  label={i18n.a11yMoveUp}
                  disabled={gi === 0}
                  onPress={() => moveGroup(gi, -1)}
                />
                <ArrowBtn
                  icon={ChevronDown}
                  label={i18n.a11yMoveDown}
                  disabled={gi === config.groups.length - 1}
                  onPress={() => moveGroup(gi, 1)}
                />
                <ArrowBtn
                  icon={Trash2}
                  label={i18n.a11yDelete}
                  disabled={config.groups.length <= 1}
                  onPress={() => removeGroup(group.id)}
                />
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
          ))}

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
              placeholderTextColor={colors.mutedForeground}
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
              <Icon icon={Plus} size={18} color={colors.primaryForeground} />
            </PressScale>
          </View>

          <PressScale
            style={styles.resetBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              resetConfig();
            }}>
            <Icon icon={RotateCcw} size={14} color={colors.mutedForeground} />
            <Text style={styles.resetText}>
              {lang === 'vi' ? 'Khôi phục mặc định' : 'Reset to default'}
            </Text>
          </PressScale>
        </>
      )}
      </Animated.ScrollView>
      {/*
        Last child, after the scroll view: siblings stack in source order, so a
        strip written above it would be painted underneath and cover nothing.
      */}
      <StatusScrim />
    </View>
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
      <Icon icon={icon} size={15} color={colors.mutedForeground} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
    */
    paddingBottom: spacing.xl,
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
  sheet: {
    marginHorizontal: -spacing.md,
    marginTop: -spacing.xl,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },

  // Header (web: date 13px muted / greeting 22px bold, name silver)
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  headerText: { flex: 1, minWidth: 0 },
  greeting: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.foreground, marginTop: 2 },
  greetingName: { color: colors.primary },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  squareBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  squareBtnActive: { backgroundColor: 'rgba(168,175,189,0.2)', borderColor: 'rgba(168,175,189,0.4)' },

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
  borderColor: 'rgba(255,255,255,0.22)',
  borderWidth: 1,
  },
  quickChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 44,
    paddingHorizontal: spacing.md,
  },
  quickChipText: { ...type.footnote, fontWeight: '600', color: colors.foreground },

  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(43,43,49,0.3)',
    backgroundColor: 'rgba(24,24,27,0.2)',
  },
  syncText: { fontSize: 13, fontWeight: '500', color: colors.foreground },

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
  groupTitle: { fontSize: 14, fontWeight: '600', color: 'rgba(237,237,237,0.8)' },

  // Empty states (web EmptyState)
  emptyCard: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.7, color: colors.mutedForeground },
  emptyMsg: { fontSize: 13, color: 'rgba(107,107,107,0.8)', textAlign: 'center', maxWidth: 220, lineHeight: 19 },


  // Edit mode (web widget-group edit)
  editHint: { fontSize: 13, color: colors.mutedForeground, textAlign: 'center', marginTop: spacing.xs },
  editGroup: { gap: spacing.sm },
  editGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  editGroupTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.foreground },
  editEmpty: { fontSize: 12, color: colors.mutedForeground, fontStyle: 'italic', paddingVertical: 4 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(24,24,27,0.4)',
  },
  editRowLabel: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.foreground },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  editDisabled: { opacity: 0.3 },
  addGroupRow: { flexDirection: 'row', gap: spacing.sm },
  addGroupInput: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(7,7,8,0.5)',
    paddingHorizontal: spacing.md,
    color: colors.foreground,
    fontSize: 15,
  },
  addGroupBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
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
  resetText: { fontSize: 13, fontWeight: '500', color: colors.mutedForeground },
});

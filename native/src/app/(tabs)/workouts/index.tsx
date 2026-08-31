import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { ChevronDown, ChevronRight, ChevronUp, Dumbbell, Plus } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useRise } from '@/lib/entrance';

import { Glyph } from '@/components/ascnd/assistant-icons';
import { PressScale } from '@/components/ascnd/press-scale';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { EmptyState } from '@/components/ascnd/empty-state';
import { Screen } from '@/components/ascnd/screen';
import { Measured, SK, WorkoutsSkeleton } from '@/components/ascnd/skeleton';
import { PAGE_TINT, colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutSession, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useExercises, useDeleteWorkoutTemplate, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { MuscleArt } from '@/components/ascnd/muscle-art';
import { SessionRow, sessionListStyles } from '@/components/ascnd/session-row';
import { newestFirst, TemplateList } from '@/components/ascnd/template-list';
import { TodayTraining } from '@/components/ascnd/today-training';
import { muscleArtKeysFor, type MuscleArtKey } from '@/lib/muscle-group';

/**
 * The tiles, in the order a body is worked rather than alphabetically.
 *
 * Push, pull, then the two arms, then the trunk, then everything below the
 * waist. Alphabetical would put Abs first and Triceps next to Shoulders, which
 * is an order that serves the spelling and nobody else.
 *
 * The names are written here rather than taken from `i18n.muscleChest` and its
 * siblings, because those are the *stored* labels — changing one has to keep
 * matching data already filed under it, and a tile caption has no such
 * obligation.
 */
const MUSCLE_TILES: { key: MuscleArtKey; vi: string; en: string }[] = [
  /* The first six are what the grid shows collapsed — two rows of three — so
     they are the six biggest movements rather than the first six alphabetically
     or the order they were typed in. Legs sat seventh and would have been
     hidden behind Calves, which is a menu with the main course missing. */
  { key: 'chest', vi: 'Ngực', en: 'Chest' },
  { key: 'back', vi: 'Lưng', en: 'Back' },
  { key: 'legs', vi: 'Chân', en: 'Legs' },
  { key: 'shoulders', vi: 'Vai', en: 'Shoulders' },
  { key: 'biceps', vi: 'Tay trước', en: 'Biceps' },
  { key: 'triceps', vi: 'Tay sau', en: 'Triceps' },
  { key: 'abs', vi: 'Bụng', en: 'Abs' },
  { key: 'glutes', vi: 'Mông', en: 'Glutes' },
  { key: 'calves', vi: 'Bắp chân', en: 'Calves' },
  { key: 'cardio', vi: 'Tim mạch', en: 'Cardio' },
];

/** Two rows of three — what the library shows before you open it up. */
const TILES_COLLAPSED = 6;

/** How many of the saved workouts the tab shows before "See all" takes over. */
const PREVIEW = 3;

/**
 * The training tab, Plan first.
 *
 * It began as a faithful port of the web `/workouts` page: a template manager,
 * with Exercises and Create beside it and a "Weekly Plan" link at the bottom.
 * That order was the web page's, and it put the thing somebody opens daily
 * behind the things they open occasionally — first as a footer, then as a pill,
 * always one navigation away.
 *
 * Plan is a card at the top now, and a page of its own — `/workouts/plan`,
 * nested under this tab so the tab bar stays while you are in it. The card
 * answers the question the tab gets asked in passing (is today a training day,
 * which one) and the page holds everything that does not fit on a line.
 *
 * It was embedded here whole for one commit, which was worse than both: a
 * single scroll carrying a week strip, a state pill, a music row and a day
 * panel of number boxes *and* a button row, a muscle grid, a workout list and a
 * session list is a page with two subjects, where everything below the fold
 * belongs to whichever one you were not looking for.
 *
 * What follows the card are the things you reach *from* training rather than
 * the training itself: log a session, ask how one lift is going, browse the
 * exercise library, build a new workout, and the two lists — the workouts you
 * have saved and the sessions you have done.
 */
export default function WorkoutsScreen() {
  /* Lần vẽ đầu thì hiện ngay — xem `useRise`. */
  const rise = useRise();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const vi = lang === 'vi';
  /* `isPending` là trạng thái thứ BA mà khối bên dưới trước đây không có. Nếu
     chỉ hỏi `isError` thì "đang tải" và "đã tải xong, không có gì" thành cùng
     một nhánh, và nhánh ấy nói rằng người dùng chưa từng lưu buổi tập nào. */
  const { data: templates, isError: templatesFailed, isPending: templatesPending } = useWorkoutTemplates();
  // The library already loads on the Exercises screen and is cached under the
  // same key, so the grid costs a read only the first time either is opened.
  const { data: exercises, isError: exercisesFailed } = useExercises();
  // Recent sessions needs no failure notice of its own: the block only renders
  // when there are sessions, so a failed read makes it absent rather than
  // wrong — and it fails alongside the templates above it, which do say so.
  const { data: sessions } = useWorkoutSessions(14);

  /**
   * One retry for the tab — the same gesture as pull-to-refresh, as a button.
   */
  const queryClient = useQueryClient();
  const [retrying, setRetrying] = useState(false);
  const retry = useCallback(async () => {
    setRetrying(true);
    await queryClient.invalidateQueries();
    setRetrying(false);
  }, [queryClient]);
  const del = useDeleteWorkoutTemplate();
  const delSession = useDeleteWorkoutSession();

  const confirmDelete = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(i18n.nDeleteTemplate, '', [
      { text: i18n.nCancel, style: 'cancel' },
      {
        text: i18n.nDeleteTemplate,
        style: 'destructive',
        /* The delete reports when it matched no rows — see `lib/write-result.ts`.
           Without an ear the row would vanish, the refetch would put it back,
           and nobody would be told why. */
        onPress: () => del.mutate(id, { onError: (e: Error) => toast.fail(e) }),
      },
    ]);
  };

  /**
   * Name what goes. Two sessions in a week are often the same template on
   * different days, so the name alone does not identify one — the date is what
   * makes a mistap catchable by reading the alert rather than by noticing the
   * chart afterwards.
   */
  const confirmDeleteSession = (id: string, date_time: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(i18n.nDeleteSession, i18n.nDeleteSessionMsg.replace('{x}', label), [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () =>
          delSession.mutate(
            { id, date_time },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                toast.success(i18n.deleted);
              },
              onError: (e: Error) => toast.fail(e),
            },
          ),
      },
    ]);
  };

  /*
    "Templates (0)" and "No templates yet — tap + to create your first" is
    encouragement for a new account and a lie about one whose templates simply
    did not load. Acting on it means rebuilding routines that already exist.

    The header row stays: its buttons open Exercises, the builder and the log
    screen, none of which depend on the read that failed. Taking away working
    navigation because a list did not arrive would be a second problem.
  */
  return (
    <Screen refreshable title={i18n.workoutsTitle} aura={PAGE_TINT.activity}>
      {/*
        Hôm nay, và cái nút.

        Tab này từng mở ra với NĂM đích đến ngang hàng nhau — thẻ Plan, ba pill
        (tiến bộ, thư viện, tạo mới) và một thanh "Ghi buổi tập" — và không cái
        nào nói cho bạn biết nên bấm cái nào. Đó là một BẢNG CHỌN, không phải
        một luồng. Việc hằng ngày, bắt đầu buổi tập của hôm nay, không hề có nút
        riêng: bạn phải tự biết rằng đường vào nó là chạm thẻ Plan, tìm đúng
        ngày, rồi cuộn xuống panel.

        Một khối, một hành động chính, bốn trạng thái nói bốn câu khác nhau —
        xem `today-training.tsx`. Thanh "Ghi buổi tập" không biến mất: nó là
        hành động của khối này ở những ngày không có kế hoạch.
      */}
      <TodayTraining />

      {/*
        The workout list — its own section, headed like the library above it.

        Three rows, newest first, and the rest behind "See all". A tab is a
        summary: the workout you saved a minute ago is the one you came back
        for, and the twelfth one you wrote in March is not worth the scroll it
        costs everyone else. Three is the number the section can show without
        pushing the recent sessions off the screen.

        "See all" is always there, count regardless — the same as the exercise
        library's directly above it, and for the same reason: it leads somewhere
        that does *more*, not somewhere that shows more. With three saved it is
        still the only place with a search field and the create button. That is
        what keeps it from being the chevron-that-does-nothing this list was
        rebuilt to get rid of.
      */}
      {/*
        `rise` bắt đầu ĐƯỢC DÙNG ở đây.

        `useRise()` được gọi từ lâu và kết quả không đi tới đâu — một hook chạy
        mỗi lần vẽ để trả về một giá trị không ai đọc, kèm chú thích nói rằng
        lần vẽ đầu hiện ngay, mô tả một cascade không tồn tại. Đúng cái bẫy repo
        này ghi lại nhiều lần: chú thích sống lâu hơn thứ nó mô tả.

        Chỗ nó thuộc về là đây. Khối này CHỜ dữ liệu — lúc đầu là bóng, rồi mới
        thành danh sách — nên nó mount vào một màn hình đã ở đó, và đó chính là
        ca `useRise` sinh ra để phục vụ. Ở lần vẽ đầu (`rise` trả về undefined)
        không có gì chạy, nên cú trượt native của iOS vẫn là thứ duy nhất mang
        màn hình vào.
      */}
      {templatesPending ? (
        <WorkoutsSkeleton />
      ) : templates && templates.length > 0 ? (
        <Animated.View entering={rise(0)}>
        <Measured id={SK.workoutTemplates} style={styles.tplSection}>
          <View style={styles.libHead}>
            {/* The count is safe here in a way it was not in the old header:
                this block only renders when the read succeeded and returned
                something, so it can never print the "(0)" that would be a claim
                about a list that simply did not arrive. */}
            <Text style={styles.sectionLabel}>
              {i18n.nYourWorkouts} ({templates.length})
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync();
                nav.push('/templates');
              }}>
              <Text style={styles.libAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
            </Pressable>
          </View>

          <TemplateList
            templates={newestFirst(templates).slice(0, PREVIEW)}
            wUnit={wUnit}
            wl={wl}
            i18n={i18n}
            onDelete={confirmDelete}
          />

          {/*
            "Tạo mới" thuộc về DANH SÁCH nó tạo vào, không thuộc về một hàng
            pill ở đầu trang.

            Nó từng là nút đặc duy nhất trên tab, đứng cạnh hai pill điều hướng
            ở ngay dưới tiêu đề — tức là thứ nổi bật nhất màn hình lại là việc
            người ta làm vài tuần một lần. Đặt nó ở cuối danh sách buổi tập thì
            nó ở đúng chỗ bạn nhận ra mình thiếu một buổi, và nút đặc trên tab
            còn lại đúng MỘT cái: bắt đầu buổi tập của hôm nay.
          */}
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.workoutsCreateNew}
            style={styles.addRow}
            onPress={() => {
              Haptics.selectionAsync();
              nav.push('/workout-builder');
            }}>
            <Icon icon={Plus} size={15} color={colors.primary} strokeWidth={2.5} />
            <Text style={styles.addRowText}>{i18n.workoutsCreateNew}</Text>
          </PressScale>
        </Measured>
        </Animated.View>
      ) : templatesFailed ? (
        <LoadFailed i18n={i18n} onRetry={retry} busy={retrying} />
      ) : (
        /* The hint used to read "nhấn + để tạo mẫu tập đầu tiên", which points
           at a button somewhere else on the page and makes the reader go and
           find it. The button is here now. */
        <EmptyState
          icon={Dumbbell}
          companion
          title={i18n.workoutsNoTemplates}
          action={{ label: i18n.workoutsCreateNew, onPress: () => nav.push('/workout-builder') }}
        />
      )}

      {/*
        Hai nhóm còn lại rời khỏi tab, mỗi nhóm một trang.

        Kế hoạch, kho và nhật ký là ba VAI TRÒ khác nhau, và xếp cả ba xuống
        cùng một cuộn là lý do tab này đọc ra rối: bốn tiêu đề mục giống hệt
        nhau, mỗi cái kèm một "Xem tất cả", không cái nào nói cái nào quan
        trọng hơn.

        Nay tab gốc chỉ giữ thứ bạn LÀM hôm nay, lớn nhất và trước nhất. Thư
        viện bài tập và lịch sử buổi tập là thứ bạn TRA CỨU — chúng đi cùng nhau
        sang `/workouts/library`, sau lưng một hàng cao 56 điểm. Kế hoạch tuần
        là trang riêng của nó và vào bằng dải ngày trong thẻ Hôm nay.

        Một hàng, một vai trò, và diện tích đúng bằng tầm quan trọng.
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nLibraryHistory}
        style={styles.toolRow}
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/workouts/library');
        }}>
        <Glyph name="dumbbell" size={17} />
        <View style={styles.toolRowCopy}>
          <Text style={styles.toolRowText}>{i18n.nLibraryHistory}</Text>
          {sessions && sessions.length > 0 ? (
            <Text style={styles.toolRowSub}>
              {i18n.nSessionCount.replace('{n}', String(sessions.length))}
            </Text>
          ) : null}
        </View>
        <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
      </PressScale>

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nToolsInsight}
        style={styles.toolRow}
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/exercise-insight');
        }}>
        <Glyph name="gauge" size={17} />
        <View style={styles.toolRowCopy}>
          <Text style={styles.toolRowText}>{i18n.nToolsInsight}</Text>
        </View>
        <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
      </PressScale>

    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  /* Tiêu đề mục và "Xem tất cả" của nó, một hàng. */
  libHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  libAll: { ...type.footnote, color: colors.primary },
  /* Hàng "tạo mới" ở cuối danh sách.

     KHÔNG dùng viền đứt nét: `tools/training-card.mjs` đã ghi lại rằng trên iOS
     `borderStyle: 'dashed'` bị từ chối khi bốn cạnh khác màu, và nó không vẽ
     nét liền thay thế — nó không vẽ gì cả. Bản đầu của hàng này đúng như vậy và
     luật bắt được. */
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radius.md,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    backgroundColor: glass.bg,
  },
  addRowText: { ...type.footnote, fontWeight: '600', color: colors.primary },
  /* Hàng dẫn đi chỗ khác: hình dạng của một hàng Cài đặt, vì đó đúng là việc nó
     làm — nó không mang nội dung nào của riêng nó. */
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  toolRowCopy: { flex: 1, minWidth: 0, gap: 1 },
  toolRowText: { ...type.body, color: colors.foreground },
  toolRowSub: { ...type.caption, color: colors.mutedForeground },
  tplSection: { gap: spacing.sm },
});


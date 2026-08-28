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
 * The exercise library, entered by body part.
 *
 * ── why it is here ──
 *
 * The library was reachable only through an "Exercises" button in the header
 * row, which is a word next to two other words. A person opening this tab wants
 * to train something, and the thing they want to train is a body part — so the
 * way in is a picture of that body part with the count of what is filed under
 * it.
 *
 * The button stays. This is a second door to the same room, not a replacement,
 * and somebody who has learned where the button is should not have to relearn.
 *
 * ── every group, every time ──
 *
 * All ten exist, including the ones with nothing filed under them yet. The grid
 * is a menu of what the app knows about as much as a view of what is in the
 * library, and a menu that changes shape as exercises are added is one you have
 * to re-read every visit — the chest tile moving because calves appeared is
 * motion that means nothing.
 *
 * A group with no *art* still gets no tile. That is a different thing: the
 * missing piece there is a picture, not a shelf.
 *
 * ── six of them, until you ask for ten ──
 *
 * Ten tiles three across is four rows of a 64pt drawing over two lines of type
 * — around 440pt, most of a phone screen, for a section that is a *door* to the
 * library rather than the library itself. Collapsed to the first two rows it is
 * a menu you take in at a glance, and the toggle underneath restores the rest.
 *
 * This does not contradict the paragraph above. What that forbids is the grid
 * rearranging itself as data arrives; the order here is fixed forever and
 * collapsing only hides its tail, so expanding puts every tile back exactly
 * where it was. The order was changed once, when this was added, so that the
 * six always-visible ones are the six biggest movements — hiding Chân while
 * showing Bắp chân would have been a menu with the main course missing.
 *
 * ── the counts are real, or they are absent ──
 *
 * Each tile counts what is actually filed under it. If the read failed, the
 * count is left off rather than printed as zero — "0 bài" is a claim about the
 * library, and the claim would be wrong. Same rule the templates header above
 * already follows.
 */
function MuscleGrid({
  exercises,
  failed,
  vi,
}: {
  exercises: { muscle_group: string | null }[];
  /** the library did not load — show the shelves, do not claim they are empty */
  failed: boolean;
  vi: boolean;
}) {
  const i18n = useI18n();
  const [open, setOpen] = useState(false);
  /*
    Grouped by *art*, not by stored name.

    `muscle_group` is free text written by two screens in two languages — the
    builder stores "Quads", the library stores "Chân trước" — so counting by the
    raw string would put the same shelf on two tiles. Folding to the art key
    first is what makes one tile mean one body part.
  */
  const counts = new Map<MuscleArtKey, number>();
  for (const e of exercises) {
    // `Lưng/Chân` is two groups and both are true, so the deadlift is counted
    // under each. The tiles therefore sum to more than the library holds — a
    // tile says how many exercises work that muscle, not how many are filed
    // there and nowhere else.
    for (const key of muscleArtKeysFor(e.muscle_group)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }


  return (
    <View style={styles.libSection}>
      <View style={styles.libHead}>
        <Text style={styles.sectionLabel}>{i18n.nToolsExercises}</Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            Haptics.selectionAsync();
            nav.push('/exercises');
          }}>
          <Text style={styles.libAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
        </Pressable>
      </View>
      <View style={styles.libGrid}>
        {(open ? MUSCLE_TILES : MUSCLE_TILES.slice(0, TILES_COLLAPSED)).map((t) => {
          const n = counts.get(t.key) ?? 0;
          return (
            <PressScale
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={
                failed ? (vi ? t.vi : t.en) : `${vi ? t.vi : t.en}, ${n} ${vi ? 'bài' : 'exercises'}`
              }
              style={styles.libTile}
              onPress={() => {
                Haptics.selectionAsync();
                // The art key, not the caption: the caption is a display string
                // and the library has to match against every spelling of the
                // group, which is what the key stands for.
                nav.push({ pathname: '/exercises', params: { group: t.key } });
              }}>
              <MuscleArt group={t.key} size={64} />
              <Text style={styles.libName} numberOfLines={1}>{vi ? t.vi : t.en}</Text>
              {failed ? null : (
                <Text style={styles.libCount}>
                  {n} {vi ? 'bài' : n === 1 ? 'exercise' : 'exercises'}
                </Text>
              )}
            </PressScale>
          );
        })}
      </View>

      {/* Says which way it goes and how much is behind it — "Xem thêm" alone is
          a button whose result you have to press it to find out. */}
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.libToggle}
        onPress={() => {
          Haptics.selectionAsync();
          setOpen((v) => !v);
        }}>
        <Text style={styles.libToggleText}>
          {open
            ? vi ? 'Thu gọn' : 'Show less'
            : vi
              ? `Xem thêm ${MUSCLE_TILES.length - TILES_COLLAPSED} nhóm`
              : `Show ${MUSCLE_TILES.length - TILES_COLLAPSED} more`}
        </Text>
        <Icon icon={open ? ChevronUp : ChevronDown} size={14} color={colors.primary} />
      </PressScale>
    </View>
  );
}

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
  const { data: templates, isError: templatesFailed } = useWorkoutTemplates();
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
      {templates && templates.length > 0 ? (
        <View style={styles.tplSection}>
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
        </View>
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
        The newest three, and the rest behind "Xem tất cả".

        This listed every session of the last fortnight. Train four times a week
        and the tab ended in eight rows of log — a summary that was mostly not a
        summary, and the longest thing on the page for anybody training
        regularly, which is to say for the people the tab is for.

        Three, like the workout list directly above it, and the same header
        shape: the two sections were already siblings and now they behave like
        it. `/sessions` groups the rest by month with a volume total, which is
        the question a training log actually gets asked.
      */}
      {sessions && sessions.length > 0 && (
        <Animated.View style={styles.sessionsWrap} entering={rise(templates?.length ?? 0)}>
          <View style={styles.libHead}>
            <Text style={styles.sectionLabel}>
              {i18n.nHistory} ({sessions.length})
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => {
                Haptics.selectionAsync();
                nav.push('/sessions');
              }}>
              <Text style={styles.libAll}>{vi ? 'Xem tất cả' : 'See all'}</Text>
            </Pressable>
          </View>
          <View style={sessionListStyles.group}>
            {sessions.slice(0, PREVIEW).map((s, i) => (
              <View key={s.id}>
                {i > 0 ? <View style={sessionListStyles.sep} /> : null}
                <SessionRow
                  session={s}
                  wUnit={wUnit}
                  lang={lang}
                  i18n={i18n}
                  onDelete={confirmDeleteSession}
                />
              </View>
            ))}
          </View>
        </Animated.View>
      )}

      {/*
        Hai cánh cửa, ở cuối, và mỗi cánh chỉ còn MỘT.

        Thư viện bài tập từng có BA lối vào trên cùng một trang: một pill ở hàng
        đầu, một tiêu đề mục "Thư viện bài tập" kèm "Xem tất cả", và mười ô cơ
        thể — cả ba nằm trong vòng hai trăm điểm của nhau. Chú thích của chính
        lưới ô đã thừa nhận: "This is a second door to the same room."

        Lưới ô là một ý hay và nó vẫn ở đây, nhưng nó là một CÁNH CỬA chứ không
        phải nội dung: mười ô, mỗi ô một hình 64 điểm trên hai dòng chữ, là thứ
        cao nhất trên tab, cho một thư viện người ta mở thỉnh thoảng. Nên nó
        xuống cuối, sau hai thứ bạn thật sự tới đây để làm, và pill trùng lặp ở
        đầu trang thì bỏ.

        "Tiến bộ từng bài" xuống cùng, vì nó là PHÂN TÍCH chứ không phải tập:
        câu hỏi "bench của tôi đang thế nào" được hỏi sau buổi tập, không phải
        trước. Nó vẫn ở tab này chứ không sang Tiến trình, vì câu hỏi ấy được
        hỏi trong lúc nhìn vào việc tập — và `entry-points.mjs` tồn tại vì app
        này từng dựng một căn phòng chỉ có cửa biến mất.
      */}
      <MuscleGrid exercises={exercises ?? []} failed={exercisesFailed} vi={vi} />

      <PressScale
        accessibilityRole="button"
        accessibilityLabel={i18n.nToolsInsight}
        style={styles.toolRow}
        onPress={() => {
          Haptics.selectionAsync();
          nav.push('/exercise-insight');
        }}>
        <Glyph name="gauge" size={17} />
        <Text style={styles.toolRowText}>{i18n.nToolsInsight}</Text>
        <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
      </PressScale>

    </Screen>
  );
}

const styles = StyleSheet.create({
  /* They no longer hug the right.
     `flex-end` was right while the row was "browse" and "create" — a pair of
     tools belonging to the list below them. It is the page's set of doorways
     now and reads left to right like one, so it starts at the left margin and
     wraps from there. */
  /*
    Flat siblings, wrapping on their own.

    Two of them used to sit inside a grouping `<View>`, which has no styling of
    its own and one visible effect: the group is a single flex item, so it wraps
    as a block. With the pills at 44pt that put one button on the first row and
    two on the second, leaving a long empty gap. Flat, they pack.
  */
  sectionLabel: { fontSize: 14, fontWeight: '600', color: colors.foreground },
  /* Hàng "tạo mới" ở cuối danh sách.

     KHÔNG dùng viền đứt nét: `tools/training-card.mjs` đã ghi lại rằng trên
     iOS `borderStyle: 'dashed'` bị từ chối khi bốn cạnh khác màu, và nó không
     vẽ nét liền thay thế — nó không vẽ gì cả. Bản đầu của hàng này đúng là như
     vậy, và luật bắt được. Viền liền cùng chất với các thẻ khác, còn việc "đây
     là chỗ để THÊM" do dấu cộng và màu chữ nói. */
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
  /* Hàng công cụ ở đáy trang: hình dạng của một hàng Cài đặt, vì đó đúng là
     việc nó làm — dẫn đi chỗ khác, không mang nội dung nào của riêng nó. */
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  toolRowText: { ...type.body, color: colors.foreground, flex: 1 },
  /*
    Pills, and 44 points tall.

    These were 34 — ten points under Apple's floor for a touch target, on the
    three ways into this tab. `tools/tap-targets.mjs` exists in this repository
    because of that exact number, and its note quotes the same 44.

    The border colour is passed in per button, from the glyph's own tint, the
    way the assistant's chips work and the way Today's log row now works. One
    rule for "a tinted pill you tap", three screens, no fourth palette.
  */
  /* The glass carries the shape; padding lives inside — the split the
     assistant's state pill uses. */
  /* The filled one keeps its fill — it is the only button on the page that
     makes something new — but takes the same pill and the same height, so the
     row reads as three of a kind with one of them emphasised. */
  /* Full width, 52 tall, and a shade more border than the pills above it.
     It is the thing this tab is for, and it had been the flattest control on
     the page. */
  /* Taller than the pills above it — it is what this tab is for. */
  libSection: { gap: spacing.sm },
  libHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  libAll: { ...type.footnote, color: colors.primary },
  libGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* Full width and centred, so it reads as the end of the grid rather than as
     an eleventh tile that lost its picture. */
  libToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 38,
    borderRadius: radius.md,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
    backgroundColor: glass.bg,
  },
  libToggleText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  /*
    Three across. Two makes each tile large enough to show the drawing's
    striations, which is detail nobody reads on a tile; four shrinks the figure
    to the point where chest and shoulders are the same picture.

    `31%` with an 8pt gap rather than `flex: 1`, because a last row holding one
    tile would stretch that tile across the screen.
  */
  /*
    The same surface as every other card, not a colour invented for this grid.

    It had a hand-picked `rgba(24,24,27,0.35)` fill and a `rgba(43,43,49,0.35)`
    border, which is a *fourth* dark in a screen that already has three, and it
    is what made the section read as pasted in from somewhere else. `glass` is
    what the templates, the sessions and every card on every other tab are made
    of; a tile made of it belongs to the app whether or not anyone can say why.
  */
  libTile: {
    width: '31%',
    alignItems: 'center',
    gap: 1,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  // From the type scale rather than ad-hoc sizes, for the same reason.
  libName: { ...type.footnote, fontWeight: '600', color: colors.foreground, marginTop: 4 },
  libCount: { ...type.caption, color: colors.mutedForeground },
  /* The list's own section, spaced like the library's above it. */
  tplSection: { gap: spacing.sm },
  sessionsWrap: { gap: spacing.sm },
  sessionsCard: { paddingVertical: 4 },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  sessionBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  sessionInfo: { flex: 1, minWidth: 0, gap: 2 },
  sessionName: { fontSize: 14, fontWeight: '500', color: colors.foreground },
  sessionMeta: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'], textTransform: 'capitalize' },
  rpeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,145,48,0.12)',
  },
  rpeText: { fontSize: 11, fontWeight: '600', color: colors.metricOrange, fontVariant: ['tabular-nums'] },
  // 28pt of ink with hitSlop 10 on top — 48pt of target, past the 44pt minimum
  sessionDel: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});

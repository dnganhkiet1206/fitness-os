import * as Haptics from 'expo-haptics';
import { nav } from '@/lib/nav';
import { CheckCircle2, ChevronLeft, ChevronRight, Dumbbell, Moon, Plus, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { BOUNCE, duration, spring } from '@/constants/motion';
import { PressScale } from '@/components/ascnd/press-scale';
import { MusicLaunch } from '@/components/ascnd/music-launch';
import { Icon } from '@/components/ascnd/icon';
import { DayPlan } from '@/components/ascnd/day-plan';
import {
  DAY_LONG_EN,
  DAY_LONG_VI,
  DAY_SHORT_EN,
  DAY_SHORT_VI,
  STATE_STYLE,
  WeekStrip,
  dayStateOf,
} from '@/components/ascnd/week-strip';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useRoutineDays, useUpsertRoutineDay, useWorkoutTemplates } from '@/hooks/use-library';
import { getLocale } from '@/lib/i18n';
import { localDateStr, routineIndex, weekDates } from '@/lib/local-date';

/**
 * Plan — the training week, in full.
 *
 * ── what it used to be, and why that was not enough ──
 *
 * Seven cards, each carrying a weekday, a dropdown reading either "Rest" or a
 * template's name, and a Deload switch. It was a *form for editing the routine*
 * and it worked as one. It was not a picture of your week.
 *
 * What it could not answer is everything you actually open this screen for. Is
 * today a training day. Have I done it. What is Wednesday going to cost me —
 * six exercises or nine, forty minutes or seventy, is it the heavy one. The
 * name of a template is not an answer to any of those; it is a label you have
 * to already know the meaning of.
 *
 * Every one of those answers was already in the database and none of them was
 * on this screen. The exercises are stored on the template, the sessions are
 * stored with their dates, and the arithmetic — volume, duration, effort — was
 * already written for the builder.
 *
 * ── the strip picks the day; the day is the page ──
 *
 * The dates across the top were decorative for one commit — today marked, a dot
 * where there was training, and nothing happened when you touched them. The
 * argument for that was that every day they named was already a card below, so
 * a tap would only be a second route to something on screen.
 *
 * That argument was wrong in a way worth writing down. Seven summary cards can
 * only ever be summaries: six exercises fit in a card, twenty-two *sets* do
 * not, and sets are what you are looking at when you are actually training. So
 * the seven cards could never become the thing you use mid-workout, and the
 * strip that could have got you to one day was doing nothing.
 *
 * Now it picks. One day is open at a time, in full — every set, with somewhere
 * to tick it off — and the strip carries the week: today ringed, the selected
 * day filled, and a dot under each day saying where it stands.
 *
 * ── the states ──
 *
 * Done, to do, not trained, rest. "Not trained" is deliberately flat — a past
 * training day with no session is a fact and the app does not get to have an
 * opinion about it, so no red and no warning glyph, the same muted grey as
 * everything else that is simply over. The rule itself lives in `week-strip`,
 * with the drawing that both this page and the training tab's card share.
 *
 * ── nothing was taken away ──
 *
 * Assigning a workout, marking a day as rest and toggling deload are all still
 * here, in the sheet behind the pencil. Seven `Switch`es down the screen were
 * seven controls to read past, and deload is a thing you set once a month; on
 * the day it is now a badge, which is what a rarely-changed state looks like.
 *
 * ── where it lives ──
 *
 * `/workouts/plan` — a page of its own, inside the training tab rather than on
 * the root stack. That distinction is the whole point and it is visible: a root
 * push covers the `UITabBarController` entirely, so Plan would leave the tab
 * bar behind and stop being *in* the tab in any sense a person can see. Nested,
 * the bar stays, Tập luyện stays lit, and back returns to the tab's own page.
 *
 * It has no `<Screen>` of its own for the same reason it is not a section: the
 * page that mounts it is the scaffold, and two nested would give the route two
 * scroll views and two safe areas.
 */

/**
 * How far the arrows go, and why there is a wall at all.
 *
 * `routine_days` is `UNIQUE(user_id, day_of_week)` — seven rows, no date
 * column. The plan is a *repeating weekly pattern*, so stepping back a week
 * does not show you the plan you were following then; it shows today's plan
 * laid over that week's dates, with the real sessions underneath it. That is
 * useful for a week or a month — it is how you see what you actually did
 * against what you intend to do — and it gets steadily less true the further
 * back it goes, because the further back you go the more likely it is the plan
 * has changed since.
 *
 * Four weeks each way is the range where the reading is worth having. It is
 * also what bounds the query: the sessions window below is widened to reach the
 * oldest visible date, and an unbounded arrow would be an unbounded fetch.
 */
const WEEKS_BACK = 4;
const WEEKS_FORWARD = 4;

export function WeekPlan({ initialDay }: { initialDay?: number | null }) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
  const { data: days } = useRoutineDays();
  const { data: templates, isError: templatesFailed } = useWorkoutTemplates();
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const upsert = useUpsertRoutineDay();
  const [picking, setPicking] = useState<number | null>(null);
  /*
    ── sheet phải DÂNG LÊN, và nó cần sống qua cả lúc đi ra ──

    `animationType="fade"` cũ làm cả tấm nền lẫn sheet hiện ra TẠI CHỖ. Một
    bottom sheet không có điểm xuất phát thì không đọc ra là "một lớp vừa được
    kéo lên từ mép dưới"; nó chỉ xuất hiện. Đó là thứ Apple không bao giờ làm
    với sheet — trong HIG, sheet là một tấm TRƯỢT VÀO từ cạnh nó neo.

    Nhưng `<Modal>` gỡ cây con ngay khi `visible` thành false, nên một hiệu ứng
    đi ra sẽ không kịp chạy: sheet biến mất tức thì rồi mới tới lượt tấm nền.
    Vì thế `mounted` tách khỏi `picking`: `picking` là câu hỏi "đang chọn ngày
    nào", còn `mounted` là "cây con còn phải tồn tại bao lâu nữa".

    Cùng cách `mascot-unlock.tsx` đã dựng — `animationType="none"` rồi
    Reanimated lo cả hai chiều.
  */
  const [mounted, setMounted] = useState(false);
  const t = useSharedValue(0);
  /*
    Chiều cao là một SHARED VALUE, không phải một `useRef`.

    `useAnimatedStyle` chạy trên luồng UI; một ref của React sống ở luồng JS và
    Reanimated không bảo đảm `.current` đọc được từ worklet — nó "chạy được"
    trong dev rồi hỏng lặng lẽ ở chỗ khác. Shared value là thứ được thiết kế để
    hai luồng cùng thấy.
  */
  const sheetH = useSharedValue(320);
  const closing = useRef(false);
  /* Hẹn giờ gỡ cây con. Giữ lại để HUỶ được: mở lại trong lúc nó đang đếm thì
     cú gỡ cũ vẫn nổ và sheet biến mất ngay sau khi vừa dâng lên. */
  const unmountAt = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picking === null) return;
    closing.current = false;
    if (unmountAt.current) {
      clearTimeout(unmountAt.current);
      unmountAt.current = null;
    }
    setMounted(true);
    /*
      Nền mờ theo TIMING, tấm theo LÒ XO — hai vật khác chất thì đi khác nhau.
      Một lớp mực không có khối lượng nên nó không nảy; một tấm thì có.

      `BOUNCE.smooth` (0) chứ không `snappy`: một sheet nảy lên rồi lún xuống
      đọc ra là vui tính, và đây là hộp thoại hỏi "ngày này tập gì". Apple
      trình bày sheet không có overshoot nhìn thấy được.

      0,46 giây là chu kỳ CẢM NHẬN của `spring(duration, bounce)` — xem
      `constants/motion.ts`, công thức WWDC23 hai tham số.
    */
    t.value = withSpring(1, spring(0.46, BOUNCE.smooth));
  }, [picking, t]);

  /*
    Lối RA nhanh hơn lối vào, và bằng timing chứ không lò xo.

    iOS đóng sheet dứt khoát hơn lúc mở: mở là một lời mời, đóng là một câu trả
    lời đã xong. Một lò xo đi xuống còn kéo theo đuôi lún, tức tấm còn nấn ná
    sau khi người dùng đã quyết.
  */
  /*
    `duration.move` (240), không phải một con số tôi tự chọn.

    Bản đầu viết 220, và `tools/motion.mjs` đỏ đúng câu nó cần nói: "đặt tên
    cho một con số không làm nó thoát khỏi thang". Thang có bốn nhịp và mỗi
    nhịp có một VAI; vai ở đây là `move` — "một mặt trượt về một vị trí mới",
    đúng thứ tấm này đang làm khi nó tụt xuống khỏi mép.
  */
  const EXIT_MS = duration.move;
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setPicking(null);
    t.value = withTiming(0, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) });
    unmountAt.current = setTimeout(() => setMounted(false), EXIT_MS + 20);
  }, [t]);

  /* Rời màn giữa chừng thì hẹn giờ vẫn còn treo và sẽ gọi `setMounted` trên
     một component đã gỡ. */
  useEffect(() => () => {
    if (unmountAt.current) clearTimeout(unmountAt.current);
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: t.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    /* Đi đúng CHIỀU CAO CỦA CHÍNH NÓ, đo qua `onLayout`: một hằng số sẽ hoặc
       để hở một dải sheet ở mép dưới lúc bắt đầu (danh sách dài), hoặc bắt nó
       đi thừa một quãng vô hình (danh sách ngắn) và cú dâng ra chậm giả tạo. */
    transform: [{ translateY: (1 - t.value) * sheetH.value }],
  }));
  /*
    The day the page was opened on.

    `initialDay` is what the training tab's card passes when you tap a cell on
    it — tapping Thursday there and landing on today would be the card lying
    about what it does. With nothing passed it opens on today, which is the day
    you came here for on six days out of seven. `routineIndex` rather than a
    stored preference: the right default changes every midnight, and a
    remembered one would be wrong by morning.
  */
  const [selected, setSelected] = useState(() => initialDay ?? routineIndex(new Date()));
  /** 0 is the week you are in. Negative is behind you. */
  const [weekOffset, setWeekOffset] = useState(0);

  const anchor = new Date();
  anchor.setDate(anchor.getDate() + weekOffset * 7);
  const dates = weekDates(anchor);

  /*
    The window follows the arrows.

    Fourteen days covers the current week from any day inside it — Sunday is six
    days from Monday — with a week of slack, and it is the window every other
    screen already asks for, so at rest this reuses a cache that is usually
    warm. Step back and it has to reach further or the week you are looking at
    comes back with no sessions in it at all, which the strip would draw as
    seven "not trained" dots: a claim about your training built out of a query
    bound that did not move.

    `7 * (1 - weekOffset)` is the distance to the Monday of the oldest visible
    week from *today*, worst case (today is Sunday), rounded up to whole weeks.
  */
  const { data: sessions } = useWorkoutSessions(Math.max(14, 7 * (1 - weekOffset)));

  const vi = lang === 'vi';
  const longNames = vi ? DAY_LONG_VI : DAY_LONG_EN;
  const shortNames = vi ? DAY_SHORT_VI : DAY_SHORT_EN;

  const todayStr = localDateStr();
  const trained = new Set((sessions ?? []).map((s) => localDateStr(new Date(s.date_time))));

  const locale = getLocale(lang);
  /* The week you are in says so; every other week is named by its dates,
     because "3 weeks ago" is arithmetic the reader has to do to find out
     whether it is the week they mean. */
  const rangeLabel =
    weekOffset === 0
      ? i18n.nThisWeek
      : `${dates[0].toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${dates[6].toLocaleDateString(
          locale,
          { day: 'numeric', month: 'short' },
        )}`;

  /*
    Tên nào xuất hiện nhiều hơn một lần trong chính danh sách này.

    Tính từ `templates` chứ không hỏi máy chủ: mơ hồ là chuyện của DANH SÁCH
    đang bày ra, không phải của cả bảng. Hai buổi trùng tên nhưng chỉ một cái
    lọt vào đây thì không có gì để phân biệt cả.
  */
  const dupNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of templates ?? []) seen.set(t.name, (seen.get(t.name) ?? 0) + 1);
    return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
  }, [templates]);

  /**
   * Dòng phụ của một hàng trong bộ chọn.
   *
   * `n bài` luôn có vì nó hữu ích mọi lúc — nó nói buổi tập ấy NẶNG cỡ nào mà
   * không phải mở ra xem. Ngày tạo chỉ thêm vào khi tên bị trùng: đó là lúc
   * duy nhất người đọc cần một thứ để tách hai hàng ra, và rải ngày lên mọi
   * hàng khi không có gì để tách là thêm nhiễu chứ không thêm nghĩa.
   */
  const templateMeta = (t: { name: string; exercises: unknown; created_at?: string | null }) => {
    const n = Array.isArray(t.exercises) ? t.exercises.length : 0;
    const count = vi ? `${n} bài` : `${n} exercise${n === 1 ? '' : 's'}`;
    if (!dupNames.has(t.name) || !t.created_at) return count;
    const made = new Date(t.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
    return `${count} · ${vi ? `tạo ${made}` : `added ${made}`}`;
  };

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));
  const templateFor = (id: string | null | undefined) =>
    id ? templates?.find((t) => t.id === id) ?? null : null;
  const hasWork = Array.from({ length: 7 }, (_, i) => {
    const d = byDay.get(i);
    return !!d?.template_id && !d?.is_rest;
  });

  const assign = (dayOfWeek: number, templateId: string | null) => {
    /* KHÔNG rung ở đây — `useUpsertRoutineDay` rung trong `onMutate`, tức cùng
       khoảnh khắc này. Hai chỗ cùng rung thì người dùng thấy hai lần; đó đúng
       lỗi mà `use-water.ts` đã ghi lại và chủ dự án đã báo một lần. */
    const d = byDay.get(dayOfWeek);
    upsert.mutate({
      day_of_week: dayOfWeek,
      template_id: templateId,
      is_rest: !templateId,
      // Marking a day as rest should not silently drop a deload that was set on
      // it; the day is still part of the week's plan either way.
      is_deload: d?.is_deload ?? false,
    });
    /* `close()`, không phải `setPicking(null)`: chọn xong cũng là một lối ra,
       và một lối ra không chạy hiệu ứng sẽ để `mounted` kẹt lại — sheet đứng
       nguyên trên màn. Mọi đường thoát khỏi sheet này đều đi qua một cửa. */
    close();
  };

  const toggleDeload = (dayOfWeek: number, isDeload: boolean) => {
    const d = byDay.get(dayOfWeek);
    upsert.mutate({
      day_of_week: dayOfWeek,
      is_deload: isDeload,
      template_id: d?.template_id ?? null,
      is_rest: d?.is_rest ?? true,
    });
  };

  const step = (by: number) => {
    Haptics.selectionAsync();
    setWeekOffset((o) => Math.max(-WEEKS_BACK, Math.min(WEEKS_FORWARD, o + by)));
  };

  const dStr = localDateStr(dates[selected]);
  const openDay = byDay.get(selected);
  const openTpl = templateFor(openDay?.template_id);
  const state = dayStateOf(!!openTpl && !openDay?.is_rest, dStr, todayStr, trained);
  const look = STATE_STYLE[state];
  const stateLabel =
    state === 'rest'
      ? i18n.nRoutineRestDay
      : state === 'done'
        ? i18n.nRoutineDone
        : state === 'missed'
          ? i18n.nRoutineMissed
          : i18n.nRoutineTodo;

  return (
    <>
      {/*
        Which week, and the way through them.

        The same shape the weekly review already uses for the same job — two
        32pt buttons around a centred label — so somebody who has moved through
        weeks on one screen already knows how on this one.
      */}
      {/*
        Tiêu đề tuần và dải lịch là MỘT khối, không phải hai anh em rời.

        Trước đây chúng là hai con trực tiếp của `Screen`, nên khe giữa chúng là
        khe mà `Screen` đặt giữa các KHỐI của trang — đo trên ảnh chụp 3× là
        ~49pt. Khe ấy đúng cho hai khối khác nhau và sai ở đây: dòng "Tuần này"
        không phải một khối riêng, nó là nhãn của chính dải lịch bên dưới.

        Ảnh mẫu chủ dự án gửi không có dòng tiêu đề nào — cả khối lịch ở đó chỉ
        là một hàng ngày. Bỏ hẳn thì mất đường sang tuần khác, nên thứ bỏ là
        KHOẢNG CÁCH: gộp lại một khối, khe 10, và dòng tiêu đề thôi trôi lơ lửng
        ở giữa một vùng trống cao hơn chính cái lịch.
      */}
      <View style={styles.weekBlock}>
      <View style={styles.weekNav}>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yPrevWeek}
          hitSlop={8}
          disabled={weekOffset <= -WEEKS_BACK}
          style={[styles.navBtn, weekOffset <= -WEEKS_BACK && styles.navBtnOff]}
          onPress={() => step(-1)}>
          <Icon icon={ChevronLeft} size={16} color={c.mutedForeground} />
        </PressScale>
        <Text style={styles.weekLabel}>{rangeLabel}</Text>
        <PressScale
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yNextWeek}
          hitSlop={8}
          disabled={weekOffset >= WEEKS_FORWARD}
          style={[styles.navBtn, weekOffset >= WEEKS_FORWARD && styles.navBtnOff]}
          onPress={() => step(1)}>
          <Icon icon={ChevronRight} size={16} color={c.mutedForeground} />
        </PressScale>
      </View>

      <WeekStrip
        dates={dates}
        hasWork={hasWork}
        selected={selected}
        todayStr={todayStr}
        trained={trained}
        longNames={longNames}
        shortNames={shortNames}
        onPick={setSelected}
      />
      </View>

      <View style={styles.dayHead}>
        <Text style={styles.dayName}>{longNames[selected]}</Text>
        {openDay?.is_deload ? (
          <View style={styles.deloadBadge}>
            <Text style={styles.deloadText}>{i18n.nDeload}</Text>
          </View>
        ) : null}
        <View style={styles.headSpacer} />
        <View style={[styles.statePill, { backgroundColor: look.wash(c, m) }]}>
          <Icon icon={look.icon} size={12} color={c[look.tint]} />
          <Text style={[styles.stateText, { color: c[look.tint] }]}>{stateLabel}</Text>
        </View>
      </View>

      {/*
        The shortcut out to music, on the screen where somebody is actually
        training.

        `/log-workout` has one too, but that screen is where a session gets
        *recorded* — which for a lot of people is afterwards. This is the panel
        you tick sets off on while you are in the middle of it, so it is the
        screen where "put something on" is a live thought rather than a
        retrospective one.

        Only on a day that has work in it. A music row under a rest day is
        offering to soundtrack nothing.
      */}
      {!openDay?.is_rest && openDay?.template_id ? <MusicLaunch /> : null}

      {/*
        Keyed by the date, not by the weekday.

        The panel keeps live state — which sets are ticked, what rest each one
        is on — and reads a stored resume point for the day it is showing.
        Without a key, moving from Monday to Tuesday would reuse the mounted
        instance and its ticks, and the storage read would land a moment later
        on top of a panel that had already shown somebody else's workout as
        half done.

        It was the weekday index, which was enough while there was one week. It
        is not now: this Monday and last Monday are both `0`, so stepping back a
        week would have kept the mounted panel and shown one Monday's ticks
        against the other Monday's date. The date string is unique across every
        week the arrows can reach.
      */}
      <DayPlan
        key={dStr}
        dateStr={dStr}
        template={openTpl}
        isRest={!!openDay?.is_rest}
        sessions={(sessions ?? []).filter((sn) => localDateStr(new Date(sn.date_time)) === dStr)}
        i18n={i18n}
        onEdit={() => setPicking(selected)}
      />

      {/*
        One day, everything about it.

        The old sheet picked a template and nothing else; deload lived out on
        the card. Both belong to the same question — what is this day — so they
        are asked in the same place.
      */}
      <Modal
        visible={mounted}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={close}>
        {/*
          `accessible={false}` ở cả hai tấm: chúng là vùng NUỐT CHẠM, không phải
          nút. React Native đặt `accessible: accessible !== false` cho mọi
          `Pressable` (`Pressable.js:252`), và tài liệu trợ năng của nó nói phần
          tử ấy "groups its children into a single selectable component" — nên
          tấm nền gộp cả sheet thành MỘT nút không tên, và VoiceOver không vào
          được hàng chọn buổi tập nào, cũng không tới được công tắc deload.

          Tấm trong thậm chí không có `onPress`: nó tồn tại đúng để chặn cú
          chạm rơi xuống tấm nền. Một thứ không làm gì cả mà lại là nút duy nhất
          trình đọc màn hình thấy được là trường hợp rõ nhất của lỗi này.

          Nút "đóng" ở hàng tiêu đề bên dưới là điều kiện để đặt được cờ này:
          bỏ tấm nền khỏi cây trợ năng khi sheet chưa có lối ra có nhãn là nhốt
          người dùng VoiceOver lại — tệ hơn hẳn lỗi đang sửa.
        */}
        <Animated.View style={[styles.pickerBackdropFill, backdropStyle]} pointerEvents="none" />
        <Pressable accessible={false} style={styles.pickerBackdrop} onPress={close}>
          <Animated.View
            style={sheetStyle}
            onLayout={(e) => {
              sheetH.value = e.nativeEvent.layout.height;
            }}>
          <Pressable accessible={false} style={styles.pickerSheet}>
            {/* Lối ra có nhãn, đặt trong hàng tiêu đề ĐÃ CÓ nên không thêm một
                điểm chiều cao nào. Cùng mẫu với sheet bộ sưu tập ở `shop.tsx`:
                tiêu đề `flex: 1`, nút đóng nằm cuối hàng. */}
            <View style={styles.pickerHead}>
              <Text style={styles.pickerTitle}>{picking !== null ? longNames[picking] : ''}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={i18n.a11yClose}
                /* 14 điểm vẽ ra — cùng cỡ với chữ X của `help-button.tsx`, và
                   vừa đúng bằng chiều cao dòng của tiêu đề, nên hàng KHÔNG cao
                   thêm một điểm nào (đo: 0 điểm ảnh lệch). 15 điểm hitSlop mỗi
                   phía đưa vùng chạm lên 44, sàn của HIG, mà không cần một cái
                   đĩa nền. */
                hitSlop={15}
                style={styles.pickerClose}
                onPress={close}>
                <Icon icon={X} size={14} color={c.mutedForeground} />
              </Pressable>
            </View>

            <ScrollView style={styles.pickerScroll} keyboardShouldPersistTaps="handled">
              {/*
                Build one, from here.

                This sheet used to offer the workouts you had already saved and
                nothing else, so an empty account met "Chưa lưu buổi tập nào —
                tạo một cái trước đã": a dead end that names the thing to do and
                gives you no way to do it. The builder is one row up now, and it
                carries the day with it — `assignDay` — so saving lands the
                workout on the day you were looking at instead of dropping you
                back here to pick it a second time.
              */}
              <Pressable
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                onPress={() => {
                  const day = picking;
                  if (day === null) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  close();
                  nav.push({ pathname: '/workout-builder', params: { assignDay: String(day) } });
                }}>
                <View style={styles.pickerRowInner}>
                  <Icon icon={Plus} size={16} color={c.primary} strokeWidth={2.5} />
                  <Text style={styles.pickerNew}>{i18n.nPlanNewWorkout}</Text>
                </View>
              </Pressable>

              <View style={styles.pickerSep} />

              <Pressable
                style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                onPress={() => picking !== null && assign(picking, null)}>
                <View style={styles.pickerRowInner}>
                  <Icon icon={Moon} size={16} color={c.mutedForeground} />
                  <Text style={styles.pickerRest}>{i18n.nRoutineRestDay}</Text>
                </View>
                {picking !== null && !byDay.get(picking)?.template_id ? (
                  <Icon icon={CheckCircle2} size={16} color={c.primary} />
                ) : null}
              </Pressable>

              {/*
                ── hai hàng CÙNG TÊN là một danh sách không chọn được ──

                Người dùng chụp màn hình này: bộ chọn bày "Tập Ngực" hai lần,
                không gì phân biệt. Trùng tên là trạng thái HỢP LỆ — chú thích
                của `useCreateWorkoutTemplate` đã ghi thẳng "two workouts are
                allowed to share a name" — và chính chú thích ấy đã lường trước
                mối nguy: "the second one would silently schedule the first".
                Nó lường cho MÃ; ở đây người mới là bên chọn nhầm.

                Nên mỗi hàng có một dòng phụ. `n bài` luôn hiện vì nó hữu ích
                mọi lúc; NGÀY TẠO chỉ hiện khi có hàng khác trùng tên — thêm
                thông tin đúng lúc có mơ hồ, chứ không rải ngày lên mọi hàng
                khi chẳng có gì để phân biệt.
              */}
              {(templates ?? []).map((t) => (
                <Pressable
                  key={t.id}
                  style={({ pressed }) => [styles.pickerRow, pressed && styles.pickerRowPressed]}
                  onPress={() => picking !== null && assign(picking, t.id)}>
                  <View style={styles.pickerRowInner}>
                    {/* Không truyền màu: để `iconTint` quyết, như bảy chỗ vẽ
                        cái tạ còn lại. `colors.primary` ở đây vừa đi vòng qua
                        bảng tint vừa dùng màu HÀNH ĐỘNG CHÍNH cho một icon
                        trang trí — hàng này đã bấm được rồi, icon không cần
                        nói lại. */}
                    <Icon icon={Dumbbell} size={16} />
                    <View style={styles.pickerText}>
                      <Text style={styles.pickerName} numberOfLines={1}>{t.name}</Text>
                      <Text style={styles.pickerMeta} numberOfLines={1}>{templateMeta(t)}</Text>
                    </View>
                  </View>
                  {picking !== null && byDay.get(picking)?.template_id === t.id ? (
                    <Icon icon={CheckCircle2} size={16} color={c.primary} />
                  ) : null}
                </Pressable>
              ))}

              {/*
                A failed read is not "you have no workouts".

                This is a picker inside a sheet, so the full failure card would
                not fit and would be the wrong shape anyway — one line of text
                is replacing one line of text. What matters is that the line
                stops making a claim about the account when the truth is that
                the list could not be read.
              */}
              {templatesFailed ? (
                <Text style={styles.pickerEmpty}>{i18n.nLoadFailed}</Text>
              ) : !templates || templates.length === 0 ? (
                <Text style={styles.pickerEmpty}>{i18n.nRoutineNoTemplates}</Text>
              ) : null}
            </ScrollView>

            {/* Deload applies to a day that has training on it; on a rest day
                there is nothing to lighten. */}
            {picking !== null && byDay.get(picking)?.template_id ? (
              <View style={styles.deloadRow}>
                <View style={styles.deloadCopy}>
                  <Text style={styles.deloadLabel}>{i18n.nDeload}</Text>
                </View>
                <Switch
                  value={byDay.get(picking)?.is_deload ?? false}
                  onValueChange={(v) => toggleDeload(picking, v)}
                  trackColor={{ true: c.readinessYellow, false: c.secondary }}
                />
              </View>
            ) : null}
          </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const stylesFor = makeStyles((c, m) => ({
  // ── which week ──
  weekBlock: { gap: 10 },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  /*
    Không còn ô nền xám.

    Ảnh mẫu chủ dự án gửi không có nút điều hướng nào; cả khối lịch ở đó chỉ là
    một hàng ngày. Bỏ hẳn hai nút thì mất đường sang tuần khác — một khả năng,
    không phải một trang trí — nên thứ bỏ đi là CÁI NỀN, không phải cái nút.

    Hai ô `alpha(m.ink, 0.05)` là hai khối xám đặc nhất trên đầu màn, và chúng
    đứng cạnh một dải lịch mà mọi ngày chưa chọn đều mờ. Mắt đọc thứ tự theo độ
    đậm, nên cặp nút ấy đang to tiếng hơn chính cái lịch.

    Vùng chạm KHÔNG đổi: hộp vẫn 32 và `hitSlop` vẫn 8 ở chỗ gọi, tức 48 — trên
    sàn 44 của Apple. Bỏ nền là bỏ mực, không phải bỏ chỗ để ngón tay đặt vào.
  */
  navBtn: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Still drawn, still 32pt, just faded — a button that disappears at the end
     of the range takes the label with it as the row re-centres. */
  navBtnOff: { opacity: 0.3 },
  /*
    Nhãn tuần là CHROME, không phải nội dung.

    Ảnh chụp 3× cho thấy nó là phần tử to tiếng nhất của cả khối: 13pt đậm, màu
    chữ chính, căn giữa, rộng nhất hàng — trong khi ảnh mẫu chủ dự án gửi không
    có dòng tiêu đề nào ở đó. Và ở tuần hiện tại nó nói "Tuần này", điều mà cái
    viên đặc dưới nó đã nói rồi.

    Nên nó xuống 11pt và màu chữ mờ: vẫn đọc được (5,68:1 trên giấy, 5,24:1
    trong phòng tối — trên sàn 4,5 của chữ nhỏ), vẫn trả lời được "tuần nào",
    nhưng thôi tranh phần với chính cái lịch.
  */
  weekLabel: { ...type.caption, fontWeight: '600', color: c.mutedForeground, minWidth: 130, textAlign: 'center' },

  // ── the open day ──
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.xs },
  dayName: { ...type.headline, color: c.foreground },
  headSpacer: { flex: 1 },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  stateText: { ...type.caption, fontWeight: '600' },
  deloadBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(230,185,61,0.18)',
  },
  deloadText: { ...type.caption, color: c.readinessYellow, fontWeight: '600' },


  // ── the day sheet ──
  /*
    ── LỚP 'rgba(0,0,0,0.6)' NÀY Ở LẠI, và đó là một phân loại, không phải bỏ sót ──

    Nó KHÔNG phải một token của bản tối sống sót. Nó là ĐEN dùng đúng nghĩa đen:
    việc của một lớp nền sau sheet là lấy bớt ánh sáng khỏi thứ phía sau, và
    lấy bớt ánh sáng thì cả trên giấy lẫn trong phòng tối đều là làm tối đi.
    iOS cũng làm mờ nền sau sheet bằng đen ở cả hai giao diện.

    Khác hẳn một lớp phủ TRÊN một bề mặt — thứ mà trên nền đen thì cộng sáng
    còn trên giấy thì trừ sáng, và là lý do 106 chỗ kia phải đổi.
  */
  /*
    Màu của tấm nền tách sang một lớp RIÊNG nằm dưới.

    Nếu để `backgroundColor` trên chính `Pressable` rồi cho nó `opacity`, cả
    cây con — kể cả sheet — mờ theo, vì `opacity` áp cho cả nhóm. Tách ra thì
    lớp mực mờ dần một mình còn tấm thì dâng lên với độ đục đầy đủ, đúng như
    hai vật khác nhau phải cư xử.
  */
  pickerBackdropFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: spacing.md,
  },
  pickerSheet: {
    backgroundColor: c.card,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  /* Hàng tiêu đề mang luôn `paddingBottom` mà tiêu đề từng tự giữ, nên nút đóng
     canh giữa theo CHỮ chứ không theo chữ-cộng-khoảng-đệm. */
  pickerHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs },
  pickerTitle: {
    flex: 1,
    ...type.caption,
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
    paddingHorizontal: spacing.sm,
  },
  /* Lề phải bằng `paddingHorizontal` của tiêu đề, nên hai đầu hàng thụt vào
     bằng nhau. */
  pickerClose: { marginRight: spacing.sm },
  /* Bounded, because the list is as long as the number of workouts you have
     saved — at a dozen it would otherwise push the deload row off the bottom of
     the screen, and the sheet has no way to scroll to it. */
  pickerScroll: { maxHeight: 320 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  pickerRowPressed: { backgroundColor: c.secondary },
  pickerRowInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  /* Making a workout and choosing one are two different acts, so a line
     between them rather than a fourth row that looks like the other three. */
  pickerSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginHorizontal: spacing.sm,
    marginVertical: 2,
  },
  pickerNew: { ...type.body, color: c.primary, fontWeight: '600' },
  pickerRest: { ...type.body, color: c.mutedForeground },
  pickerText: { flex: 1, minWidth: 0, gap: 1 },
  pickerName: { ...type.body, color: c.foreground, flexShrink: 1 },
  pickerMeta: { ...type.caption, color: c.mutedForeground },
  pickerEmpty: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', padding: spacing.md },
  deloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  deloadCopy: { flex: 1 },
  deloadLabel: { ...type.body, color: c.foreground },
}));

import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { nav } from '@/lib/nav';
import { Coins, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useMascot } from '@/hooks/use-mascot';
import { useMascotEmotion } from '@/hooks/use-mascot-emotion';
import { useKoaContext, refreshKoaContext } from '@/hooks/use-koa-context';
import { noticeAmplitude, presenceMotion } from '@/lib/koa-idle';
import { emitKoa } from '@/lib/koa-stage';
import { localDateStr } from '@/lib/local-date';
import { onUserScopedReset } from '@/lib/user-scoped-reset';
import type { MascotEmotion } from '@/lib/mascot-emotion';
import { noteAsked, notePraised } from '@/lib/personal-model';
import { useMascotInventory, useMascotWallet } from '@/hooks/use-mascot-room';
import { levelFromXp } from '@/lib/mascot-room';
import { useI18n } from '@/hooks/use-app-settings';
import { useInteracting } from '@/lib/interaction';

/**
 * Koa đã tới nơi trong phiên này chưa.
 *
 * Ở phạm vi module vì component bị THÁO mỗi lần người dùng mở thẻ chỉ số —
 * state của nó chết theo, nên nó không nhớ được gì. Xem lập luận đầy đủ ở chỗ
 * dùng, trong `useEffect` "tới nơi".
 *
 * Đặt lại khi đổi tài khoản: máy khác người dùng thì đây là một Koa khác, và
 * họ xứng đáng được thấy nó tới nơi. `tools/*` có luật đòi mọi state phạm vi
 * module phải đăng ký ở đây, và luật ấy đúng cả với một thứ chỉ mang tính
 * trang trí như cờ này.
 */
let arrived = false;
onUserScopedReset(() => {
  arrived = false;
});

/**
 * The companion on the home screen — present according to the day, not on a
 * loop.
 *
 * ── what this used to be, and why it changed ──
 *
 * It floated for ever, swayed ±9° for ever, and fired a random quirk — a hop,
 * a double-nod, or a full 360° flip — every six to fourteen seconds, gated on
 * nothing but the tab being focused. The face had been state-driven for a
 * while; the body was not, so the two halves of one character disagreed. At
 * eleven at night, with the day logged, Koa wore the `sleep` face and did a
 * backflip every ten seconds.
 *
 * Now the body reads the same state the face does. Two kinds of movement and
 * no third: a **breath** whose depth and pace come from the emotion, and a
 * **notice** — one movement when the state actually changes, sized by how big
 * the change was. The rules are `lib/koa-idle.ts`, kept out of here so they can
 * be run through a week of states and read.
 *
 * The flip did not disappear; it moved to the tap. A somersault somebody asked
 * for is delight, and the same somersault on a timer is wallpaper.
 *
 * Everything still stops when the tab loses focus — an unwatched buddy costs
 * nothing — and Reanimated's own `ReduceMotion.System` default means every
 * `withTiming`/`withSpring`/`withRepeat` below already honours the accessibility
 * setting without being told to.
 */
export function Mascot({
  /**
   * Đông cứng đồng hồ của nhân vật trong lúc trang đang cuộn.
   *
   * ── vì sao nó phải tới từ BÊN NGOÀI ──
   *
   * `KoaFigure` chạy một `useFrameCallback` nuôi 36 vòng chuyển động, ở nhịp
   * của màn hình (tới 120 khung hình một giây), và chú thích của chính nó gọi
   * đó là "cost driver của cả nhân vật: mọi lớp có hiệu ứng đều tính lại khi nó
   * nhích". Cổng duy nhất của đồng hồ ấy là `animated`, mà `animated` ở đây là
   * `focused` — đúng, nhưng đang xem dashboard thì luôn true. Nên suốt mỗi cú
   * cuộn, cái rig ấy vẫn chạy hết công suất trên đúng luồng UI đang phải trộn
   * lại sáu lớp kính mờ và ba `useAnimatedStyle`.
   *
   * `mascot-room.tsx` đã gặp và đã sửa đúng lỗi này, và ghi lại bằng một câu:
   * *"một cú cuộn (bắt đầu và dừng) là phần còn lại của cú giật"*. Cơ chế có
   * sẵn từ đó — `scrollPause` xuyên qua `MascotFigure` xuống `KoaFigure`, đọc
   * trên luồng UI nên nhân vật đứng hình ngay ở khung hình cú kéo bắt đầu, và
   * đồng hồ là bộ tích luỹ nên lúc chạy tiếp không nhảy. Thứ duy nhất còn
   * thiếu là chưa ai nối nó ở dashboard.
   *
   * Không bắt buộc: các màn không cuộn (ô trống, màn ăn mừng) bỏ qua và nhân
   * vật thở như cũ.
   */
  scrollPause,
}: {
  scrollPause?: SharedValue<boolean>;
} = {}) {
  const i18n = useI18n();
  /*
    `focused` giờ mang HAI câu hỏi: màn có đang xem không, VÀ tay có đang chạm
    vào cái gì không.

    Đo được (`tools/frame-churn.mjs`, trong lúc vuốt deck ở Dashboard): 73 lượt
    sửa mỗi khung hình, trong đó 89% là mascot — một svg 54×68 với 26 nhóm
    `<g>` — còn chính cú vuốt chỉ được 10%. Trên iOS mỗi nhóm là một lớp Core
    Animation và cập nhật là vẽ lại.

    Gộp vào `focused` thay vì thêm một cờ thứ hai, vì `focused` đã gác đúng ba
    chỗ cần gác (hai `useEffect` và `animated=` truyền xuống figure). Thêm cờ
    riêng thì lần sau ai đó sửa một chỗ sẽ quên hai chỗ kia — đúng lỗi mà ghi
    chú ở `scrollPause` bên `index.tsx` đã cảnh báo: "hai cờ riêng cho một câu
    hỏi là hai thứ sẽ lệch nhau".
  */
  const screenFocused = useIsFocused();
  const interacting = useInteracting();
  const focused = screenFocused && !interacting;
  const { enabled, mascot, message, messageGap, messageIsReaction, mood } = useMascot();
  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const quests = useDailyQuests();
  const koaCtx = useKoaContext();
  const [bubbleVisible, setBubbleVisible] = useState(true);
  const level = levelFromXp(wallet?.xp ?? 0);

  /*
    The same emotion the figure is drawing. Reading it here is what ends the
    disagreement: `MascotFigure` resolves it internally for the face, so the
    body was the only part of the character that had never been told.
  */
  const emotion = useMascotEmotion();
  /* Something is genuinely for the user: coins already earned and uncollected,
     or a sentence on screen nobody has read. Not a performance — it only stops
     the breath settling all the way down. */
  const waiting = (quests.unclaimedCoins > 0 || (!!message && bubbleVisible)) && quests.ready;
  const presence = presenceMotion(emotion, waiting);
  // The buddy wears its purchased outfit everywhere, not just in its room
  const equippedOutfits = new Set(
    (inventory ?? []).filter((r) => r.equipped).map((r) => r.item_key),
  );
  // Visible gains: the buddy grows a touch with every room level
  const levelScale = Math.min(1 + (level - 1) * 0.02, 1.2);

  const hover = useSharedValue(0); // 0..1 (0 = ground, 1 = top of float)
  /*
    How far the breath travels, in points — a shared value and not a plain read
    of `presence.floatPt`.

    Measured in a browser, the first version of this was wrong in a way no
    static rule saw: the *pace* came from the state and the *depth* was still
    the literal `-7` this file shipped with, so asleep and wide awake both rose
    exactly seven points. `tools/koa-breath.mjs` caught it — 7.00px at two in
    the afternoon and 7.00px at eleven at night, with the periods correctly
    2851ms and 5256ms.

    It is a shared value because a plain number in the closure would be frozen:
    `useAnimatedStyle` evaluates its initial style once and only ever updates it
    from the shared values in the mapper — see `tools/measured-worklet.mjs` and
    the macro bars that sat full on an empty day.
  */
  const travel = useSharedValue(0);
  /* 0..1 — bắt đầu ở 1 nếu Koa đã tới nơi rồi trong phiên này. Xem `arrived`. */
  const entrance = useSharedValue(arrived ? 1 : 0);
  const nod = useSharedValue(0); // deg rotateX
  const droop = useSharedValue(0); // deg — forward slump, from the state
  const spin = useSharedValue(0); // deg rotateY for flips
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const bubble = useSharedValue(0);

  /*
    Tới nơi MỘT LẦN mỗi phiên, không phải mỗi lần được dựng lại.

    ── lỗi ──

    `useEffect(…, [])` đọc ra là "một lần", nhưng nó là một lần MỖI LẦN MOUNT.
    Trên Today, `<Mascot>` nằm trong tấm nội dung, mà tấm ấy bị tháo khỏi cây
    khi người dùng mở thẻ chỉ số. Nên mỗi lần ĐÓNG thẻ, Koa dựng lại và diễn
    lại màn tới nơi: `entrance` về 0 — thứ nhân vào `scale` bên dưới — nên nó
    biến mất HẲN trong 350ms rồi mới bung lò xo trở lại.

    Người dùng báo đúng chỗ này sau khi hai hiệu ứng kia đã được gỡ: "nửa dưới
    dashboard fade in/out mỗi lần chạm thì hiện tại vẫn còn bị ở chỗ koa".

    ── vì sao là biến ở phạm vi module ──

    Cùng lập luận với `cascaded` ở Today: một hiệu ứng vào kể chuyện "cái này
    vừa tới", đúng ở lần mở app và sai ở mọi lần sau, vì nó chưa đi đâu cả — nó
    chỉ bị che. Nhưng ở đây cái cờ không thể là state của chính component:
    component ấy bị THÁO, nên state của nó chết theo.

    `<Mascot>` có đúng MỘT chỗ gọi (`app/(tabs)/index.tsx`), nên "một lần mỗi
    phiên" và "một lần cho chỗ gọi này" là cùng một câu — biến module không mơ
    hồ ở đây như nó sẽ mơ hồ nếu có hai chỗ dựng.

    Và `entrance` phải khởi tạo bằng 1 chứ không phải chạy một animation về 1:
    `useAnimatedStyle` lấy style đầu từ giá trị lúc dựng, nên khởi tạo bằng 0
    rồi mới sửa là một khung hình Koa ở scale 0 — đúng cái nháy đang phải bỏ.
  */
  useEffect(() => {
    if (arrived) return;
    arrived = true;
    entrance.value = withDelay(350, withSpring(1, { stiffness: 200, damping: 13 }));
  }, [entrance]);

  /*
    ── the breath ──

    One loop, and its two numbers come from the state rather than from here.
    `floatPt: 0` is a real answer — a flat, tired character does not rise at all
    — so the loop is not started, and the value is put back to rest instead of
    being left wherever the last state's breath had reached.
  */
  useEffect(() => {
    if (!focused || presence.floatPt === 0) {
      cancelAnimation(hover);
      hover.value = withTiming(0, { duration: 400 });
      return;
    }
    const half = presence.breathMs / 2;
    hover.value = withRepeat(
      withSequence(
        withTiming(1, { duration: half, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: half, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    return () => {
      // a repeat runs until it is cancelled — leaving the tab is not enough
      cancelAnimation(hover);
      hover.value = 0;
    };
  }, [focused, presence.floatPt, presence.breathMs, hover]);

  useEffect(() => {
    /* Eased rather than snapped: the depth of a breath changing is itself a
       small piece of information, and a step change reads as a glitch. */
    travel.value = withTiming(presence.floatPt, { duration: duration.swap });
  }, [presence.floatPt, travel]);

  // The slump belongs to the state now, not to one of the three moods.
  useEffect(() => {
    droop.value = withSpring(presence.droopDeg, { stiffness: 120, damping: 14 });
  }, [presence.droopDeg, droop]);

  /*
    ── the notice ──

    The whole of the character's spontaneity, and none of it is spontaneous:
    one movement when the state changes, sized by how far it moved. The random
    quirk timer that used to live here is gone, and with it the 360° flip on a
    stranger's schedule — a movement on a timer means nothing, which is the only
    kind this removes. The flip is on the tap instead.

    `seen` starts as `null` so the first reading is a baseline rather than a
    change: on mount the entrance spring is already playing, and a notice over
    the top of it is the character reacting to having appeared.
  */
  const seen = useRef<MascotEmotion | null>(null);
  useEffect(() => {
    const amp = noticeAmplitude(seen.current, emotion);
    seen.current = emotion;
    if (amp === 0 || !focused) return;
    /* A look up and back — the movement of noticing, scaled. Bigger changes
       also get a small lift, which is what makes waking up for a celebration
       read differently from settling into `rested`. */
    nod.value = withSequence(
      withTiming(-6 - amp * 10, { duration: 180, easing: Easing.out(Easing.quad) }),
      withSpring(0, { stiffness: 180, damping: 12 }),
    );
    if (amp > 0.5) {
      squashY.value = withSequence(
        withTiming(0.94, { duration: 90 }),
        withSpring(1.06, { stiffness: 380, damping: 10 }),
        withSpring(1, { stiffness: 260, damping: 14 }),
      );
      squashX.value = withSequence(
        withTiming(1.06, { duration: 90 }),
        withSpring(0.95, { stiffness: 380, damping: 10 }),
        withSpring(1, { stiffness: 260, damping: 14 }),
      );
    }
  }, [emotion, focused, nod, squashX, squashY]);

  useEffect(() => {
    bubble.value = withSpring(bubbleVisible && message ? 1 : 0, { stiffness: 260, damping: 20 });
  }, [bubbleVisible, message, bubble]);

  /* The one place an ask counts as having been made: on screen, in a bubble
     somebody can read. The learner is fed from here rather than from the hook
     that writes the sentence — see `noteAsked`. */
  useEffect(() => {
    if (!bubbleVisible || !message) return;
    /* A reaction is neither an ask nor the day's praise — it is a comment on
       something that just happened, and recording it as either corrupts a
       different system. */
    if (messageIsReaction) return;
    if (messageGap) noteAsked(messageGap, localDateStr());
    /* No gap and a sentence anyway means the day is finished and this is the
       praise — recorded here, on screen, for the same reason the ask is. */
    else notePraised(localDateStr());
  }, [bubbleVisible, message, messageGap, messageIsReaction]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 320 },
      { translateY: -hover.value * travel.value },
      { rotateY: `${spin.value}deg` },
      { rotateX: `${nod.value + droop.value}deg` },
      { scale: entrance.value * levelScale },
      { scaleX: squashX.value },
      { scaleY: squashY.value },
    ],
  }));

  // Ground shadow: shrinks and fades as the character floats up — the
  // classic depth cue that sells "hovering above a surface"
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(hover.value, [0, 1], [0.45, 0.18]) * entrance.value,
    transform: [{ scaleX: interpolate(hover.value, [0, 1], [1, 0.72]) }],
  }));

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: bubble.value,
    transform: [{ scale: 0.9 + bubble.value * 0.1 }, { translateY: (1 - bubble.value) * 8 }],
  }));

  if (!enabled) return null;

  /*
    ── the tap is the one thing the person starts, and it ignored them ──

    `koa_greeted` has been in the event vocabulary, with a decision branch and a
    night-versus-day face, since the engine was written. Nothing emitted it. So
    the only interaction Koa has — touching the figure — ran this fixed
    animation and nothing else: the same 360° flip at three in the morning while
    the character wore the `sleep` face, the same flip for somebody back after a
    fortnight away, the same flip for somebody in the middle of a load spike.

    Now the tap announces itself and the engine answers, which is the entire
    point of having an engine. `decide` reads `ctx.state` for the two situations
    that change the reply — see the `koa_greeted` branch — and falls through to
    the plain wave at confidence `none`, so a five-day-old account is greeted
    exactly as a stranger should be.

    ── once a day, and why that is the honest id ──

    `emitKoa` dedupes on the id, and taps repeat. A per-tap id would fill the
    persisted ring buffer with forty greetings and evict the medals it exists to
    remember; a fixed id would fire once per install. Per day is what the moment
    actually is: *the first time you said hello today*. Every tap after it still
    gets the jump and still opens the room — the flip is the acknowledgement
    that a touch landed, and that is not a thing to ration.
  */
  const poke = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    emitKoa(
      { id: `greet:${localDateStr()}`, kind: 'koa_greeted', magnitude: 0.35 },
      refreshKoaContext(koaCtx),
    );
    // Excited jump: anticipation squash → stretch up → land with a flip
    squashY.value = withSequence(
      withTiming(0.78, { duration: 90 }),
      withSpring(1.18, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 13 }),
    );
    squashX.value = withSequence(
      withTiming(1.18, { duration: 90 }),
      withSpring(0.88, { stiffness: 420, damping: 8 }),
      withSpring(1, { stiffness: 260, damping: 13 }),
    );
    spin.value = withSequence(
      withDelay(80, withTiming(360, { duration: 560, easing: Easing.out(Easing.cubic) })),
      withTiming(0, { duration: 0 }),
    );
    setBubbleVisible(true);
    // A tap now leads into the buddy's gym room (quests, coins, shop)
    setTimeout(() => nav.push('/mascot-room'), 320);
  };

  return (
    <View style={styles.row} pointerEvents="box-none">
      <Pressable onPress={poke} hitSlop={8}>
        <View style={styles.stage}>
          {/* Ground shadow */}
          <Animated.View style={[styles.groundShadow, shadowStyle]} />
          <Animated.View style={[styles.body, bodyStyle]}>
            <MascotFigure
              mascot={mascot}
              size={54}
              mood={mood}
              level={level}
              equippedOutfits={equippedOutfits}
              animated={focused}
              scrollPause={scrollPause}
            />
          </Animated.View>
        </View>
      </Pressable>

      <View style={styles.side}>
        {message && (
          <Animated.View
            style={[styles.bubble, bubbleStyle]}
            pointerEvents={bubbleVisible ? 'auto' : 'none'}>
            <Text style={styles.bubbleText}>{message}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDismiss} hitSlop={10} onPress={() => setBubbleVisible(false)} style={styles.bubbleClose}>
              <Icon icon={X} size={11} color={colors.mutedForeground} />
            </Pressable>
          </Animated.View>
        )}

        {/*
          ── today's five, on the home screen ──

          The quests were never missing — five of them, with coins and XP, have
          paid out since the room shipped. What was missing is that the only
          place you could see them was inside the room, so the whole economy was
          invisible to anybody who never tapped the buddy. Duolingo puts the
          daily goal on the home screen and in the widget for exactly this
          reason: a goal you cannot see is not a goal.

          Five dots and a count, no labels. The labels are in the room, one tap
          away, and five named quests here would be a second to-do list on a
          screen that already is one — the widgets above *are* the day. This
          says only how much of it is done.

          `ready` gates it: an unread day computes as five unfinished quests,
          and `0/5` shown to somebody who logged all morning is worse than
          showing nothing.
        */}
        {quests.ready ? (
          <View style={styles.quests}>
            <View style={styles.dots}>
              {/* `quests.active`, not the whole catalogue: an account with no
                  step source drops the steps quest, and a dot that can never
                  light is worse than no dot. */}
              {quests.active.map((key) => (
                <View
                  key={key}
                  style={[styles.dot, quests.done[key] && styles.dotOn]}
                />
              ))}
            </View>
            <Text style={styles.questCount}>
              {quests.doneCount}/{quests.total}
            </Text>
            {/* The badge is the point of the whole strip: coins already earned
                and sitting uncollected, which nothing outside the room has ever
                said. Absent when there is nothing waiting — a permanent badge
                is decoration. */}
            {quests.unclaimedCoins > 0 ? (
              <View style={styles.coinPill}>
                <Icon icon={Coins} size={11} color={colors.readinessYellow} />
                <Text style={styles.coinText}>+{quests.unclaimedCoins}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* The bubble and the strip share the column beside the buddy, so the strip
     sits under whatever Koa is saying rather than beside it. */
  side: { flex: 1, minWidth: 0, gap: 6 },
  quests: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dots: { flexDirection: 'row', gap: 5 },
  /* 7pt, and the unfilled one is a ring rather than a faint disc: an unfinished
     quest should read as an empty slot, not as a dimmer version of a full one. */
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dotOn: { backgroundColor: colors.readinessGreen, borderColor: colors.readinessGreen },
  questCount: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,217,61,0.12)',
  },
  coinText: { fontSize: 11, fontWeight: '700', color: colors.readinessYellow },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stage: {
    width: 74,
    height: 80,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  aura: {
    position: 'absolute',
    top: 6,
    width: 58,
    height: 58,
    borderRadius: 29,
    opacity: 0.16,
    transform: [{ scale: 1.25 }],
  },
  groundShadow: {
    position: 'absolute',
    bottom: 2,
    width: 44,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000',
  },
  body: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  bubble: {
    /* No `flex: 1` any more. It was a direct child of the row and needed to
       take the remaining width; it is now inside a column, where `flex: 1`
       stretches it *vertically* and pushes the quest strip off the bottom. The
       column stretches it to full width on its own. */
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderBottomLeftRadius: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleText: {
    ...type.footnote,
    color: colors.foreground,
    flex: 1,
    lineHeight: 18,
  },
  bubbleClose: {
    padding: 2,
  },
  bubbleCloseText: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
});

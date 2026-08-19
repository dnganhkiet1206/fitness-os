import {
  Backpack,
  Cat,
  Check,
  Coins,
  Crown,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Ghost,
  Gift,
  Glasses,
  Headphones,
  LayoutGrid,
  Medal,
  Moon,
  Shirt,
  Snowflake,
  Star,
  Swords,
  Trophy,
  Utensils,
  Wind,
  type LucideIcon,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressScale } from '@/components/ascnd/press-scale';
import { fireCelebration } from '@/components/ascnd/award-celebration';
import { EnergyRing } from '@/components/ascnd/energy-ring';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { MascotScene } from '@/components/ascnd/mascot-scene';
import { RankJourney } from '@/components/ascnd/rank-journey';
import { ShortcutRow } from '@/components/ascnd/shortcut-row';

import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAwards, useWeeklyChallenges } from '@/hooks/use-extras';
import { useMascot } from '@/hooks/use-mascot';
import { habitFor, usePersonalModel } from '@/lib/personal-model';
import { DEV_EMOTIONS, setDevEmotion } from '@/hooks/use-mascot-emotion';
import {
  useBuyItem,
  useBuyFreeze,
  useClaimReward,
  useDailyStreak,
  useMascotInventory,
  useMascotWallet,
  useToggleEquip,
} from '@/hooks/use-mascot-room';
import { useDailyQuests } from '@/hooks/use-daily-quests';
import { useTodayWater } from '@/hooks/use-water';
import { useDailyLog, useProfile, useTodaySleep } from '@/hooks/useTodayData';
import { CHALLENGE_TEXT } from '@/lib/gamification-i18n';
import { localDateStr } from '@/lib/local-date';
import {
  DAILY_QUESTS,
  CHALLENGE_REWARD,
  ENERGY_SIGNALS,
  FREEZE_MAX,
  FREEZE_PRICE,
  LEVEL_XP,
  RANKS,
  SHOP_CATEGORIES,
  STREAK_XP,
  levelFromXp,
  nextRank,
  questRefKey,
  rankForLevel,
  streakCoins,
  type Collection,
  type QuestKey,
} from '@/lib/mascot-room';
import { toast } from '@/lib/toast';




// The five daily signals that power the buddy's energy meter
const SIGNAL_META: Record<QuestKey, { icon: LucideIcon; color: string; labelKey: 'nRoomSigMeal' | 'nRoomSigWorkout' | 'nRoomSigWater' | 'nRoomSigSleep' | 'nRoomSigSteps' }> = {
  meal: { icon: Utensils, color: colors.metricOrange, labelKey: 'nRoomSigMeal' },
  workout: { icon: Dumbbell, color: '#e6485c', labelKey: 'nRoomSigWorkout' },
  water: { icon: Droplets, color: colors.metricCyan, labelKey: 'nRoomSigWater' },
  sleep: { icon: Moon, color: colors.metricPurple, labelKey: 'nRoomSigSleep' },
  steps: { icon: Footprints, color: colors.readinessGreen, labelKey: 'nRoomSigSteps' },
};

// Rank → celebration tier (the confetti overlay speaks bronze/…/platinum)
const RANK_TIER: Record<string, string> = {
  rookie: 'bronze',
  active: 'bronze',
  prime: 'silver',
  peak: 'gold',
  apex: 'platinum',
  legend: 'platinum',
};

/**
 * How far past the stage's bottom edge it still counts as on screen, in points.
 *
 * The mount state is decided at rest from the final offset, and this margin
 * keeps the room mounted for a little past its own bottom, so settling in a
 * slight overscroll — or just below the fold — does not unmount and then
 * remount it. The room's clocks restart from zero on remount, and this keeps
 * that restart safely out of view.
 */
const STAGE_KEEP_ALIVE = 120;

/** Floating "+N coins" that rises off the scene on every claim */
function CoinBurst({ trigger, amount }: { trigger: number; amount: number }) {
  const y = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    if (trigger === 0) return;
    y.value = 0;
    op.value = 0;
    op.value = withSequence(
      withTiming(1, { duration: 160 }),
      withDelay(420, withTiming(0, { duration: 520 })),
    );
    y.value = withTiming(-70, { duration: 1080, easing: Easing.out(Easing.quad) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: y.value }],
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.burstWrap, style]}>
      <View style={styles.burstPill}>
        <Icon icon={Coins} size={15} />
        <Text style={styles.burstText}>+{amount}</Text>
      </View>
    </Animated.View>
  );
}

/** Which i18n key names each habit in the "Koa has noticed" line. */
const LEARNED_LABEL: Record<QuestKey, 'nThingMeal' | 'nThingWorkout' | 'nThingWater' | 'nThingSleep' | 'nThingSteps'> = {
  meal: 'nThingMeal',
  workout: 'nThingWorkout',
  water: 'nThingWater',
  sleep: 'nThingSleep',
  steps: 'nThingSteps',
};

export default function MascotRoomScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { mascot, message, mood } = useMascot();
  // A stack screen stays mounted under whatever is pushed on top of it, so
  // without this the room keeps animating behind the shop, the settings
  // page and every other push.
  const focused = useIsFocused();

  const { data: wallet } = useMascotWallet();
  const { data: inventory } = useMascotInventory();
  const { data: streakData } = useDailyStreak();
  const streak = streakData?.count ?? 0;

  /* The one habit worth saying out loud: the strongest clock Koa has found.
     Not a list — a list of five inferences reads as surveillance, and one
     reads as somebody paying attention. */
  const loggedToday = streakData?.loggedToday ?? false;
  const freezeHeld = streakData?.held ?? 0;
  const freezeUsed = streakData?.frozen.length ?? 0;
  const freezeFull = freezeHeld >= FREEZE_MAX;
  const buyFreeze = useBuyFreeze();

  const personal = usePersonalModel();
  const learned = useMemo(() => {
    const found = (Object.keys(personal.hours) as QuestKey[])
      .map((q) => ({ q, h: habitFor(q) }))
      .filter((x): x is { q: QuestKey; h: NonNullable<ReturnType<typeof habitFor>> } => x.h != null)
      .sort((a, b) => b.h.strength - a.h.strength)[0];
    if (!found) return null;
    const hh = Math.floor(found.h.hour) % 24;
    const mm = Math.round((found.h.hour - Math.floor(found.h.hour)) * 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(Math.min(mm, 59)).padStart(2, '0')}`;
    return i18n.nRoomLearned
      .replace('{what}', i18n[LEARNED_LABEL[found.q]] as string)
      .replace('{time}', clock);
  }, [personal.hours, i18n]);
  const claim = useClaimReward();
  const buy = useBuyItem();
  const equip = useToggleEquip();

  const { data: dailyLog } = useDailyLog();
  const { data: profile } = useProfile();
  const { data: waterMl } = useTodayWater();
  const { data: sleep } = useTodaySleep();
  const { data: challenges } = useWeeklyChallenges();
  const { data: awards } = useAwards();

  const [celebrate, setCelebrate] = useState(0);
  const [flex, setFlex] = useState(0);
  const [burst, setBurst] = useState({ id: 0, amount: 0 });

  /**
   * Whether the stage is on screen, so the room can unmount once it is not —
   * a long stretch spent reading the quests below should not keep the room
   * animating out of sight, which is where the original heat came from.
   *
   * **This is only ever changed once a scroll has settled, never mid-scroll.**
   * The room is already frozen for the whole of a scroll (`scrollPause`), so
   * keeping it mounted through a flick costs nothing — and unmounting it *while*
   * the flick is in flight tears down four canvases and their frame callbacks
   * in the middle of the gesture, which a fast flick felt as a catch. So the
   * flick just carries the frozen room along, and the mount state is
   * re-evaluated from the resting position when it stops.
   */
  const [stageBottom, setStageBottom] = useState(0);
  const [stageOnScreen, setStageOnScreen] = useState(true);
  /** last scroll offset, read at rest to decide the mount state — never renders */
  const lastY = useRef(0);

  /**
   * Whether the page is being scrolled right now — a **shared value**, not React
   * state, on purpose.
   *
   * Everything that animates in the room reads it on the UI thread and holds its
   * current frame while it is true (the buddy's clock and every one of the
   * room's loop clocks). Writing it from the scroll callbacks freezes the whole
   * scene on the frame the drag begins with **no React render** — an earlier
   * version drove this through `useState`, and re-rendering the whole page twice
   * a scroll (start and stop) was the last of the stutter. Nothing here is
   * conditionally rendered on it, so a shared value is all it needs to be.
   *
   * `onScrollBeginDrag` sets it the instant a drag begins, before the first
   * frame moves; the timer clears it a breath after the last scroll event,
   * which covers momentum too. The scene freezes and resumes with no jump — the
   * clocks are accumulators (see `loop-clock.ts`).
   */
  const scrollPause = useSharedValue(false);
  const scrollIdle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markScrolling = () => {
    scrollPause.value = true;
    if (scrollIdle.current) clearTimeout(scrollIdle.current);
    // longer than the 64ms scroll-event throttle, so momentum keeps it alive
    scrollIdle.current = setTimeout(() => {
      scrollPause.value = false;
      // Only now, at rest, decide whether the room stays mounted — never
      // mid-flick. React ignores a set to the current value, so this is free
      // when nothing changed.
      if (stageBottom > 0) {
        setStageOnScreen(lastY.current < stageBottom + STAGE_KEEP_ALIVE);
      }
    }, 120);
  };

  useEffect(() => () => {
    if (scrollIdle.current) clearTimeout(scrollIdle.current);
  }, []);

  const onStageLayout = (ev: LayoutChangeEvent) => {
    const { y, height } = ev.nativeEvent.layout;
    setStageBottom(y + height);
  };

  const onPageScroll = (ev: NativeSyntheticEvent<NativeScrollEvent>) => {
    lastY.current = ev.nativeEvent.contentOffset.y;
    markScrolling();
  };
  const [devEmo, setDevEmo] = useState<string | null>(null); // dev-only emotion override
  const welcomeTried = useRef(false);

  const balance = wallet?.balance ?? 0;
  const claimed = wallet?.claimed ?? new Set<string>();
  const owned = new Set((inventory ?? []).map((r) => r.item_key));
  const equippedOutfits = new Set(
    (inventory ?? []).filter((r) => r.equipped).map((r) => r.item_key),
  );

  /* "Done" is defined once, in `use-daily-quests`, because Today shows the same
     five now — see that file for why it moved out of this screen. */
  const { done: questDone, active: activeQuests, today, stepsGoal } = useDailyQuests();

  const reward = (refKey: string, amount: number, reason: string, xpGain: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const prevXp = wallet?.xp ?? 0;
    claim.mutate(
      { refKey, amount, reason },
      {
        onSuccess: () => {
          // Every claim floats its coins off the scene
          setBurst({ id: Date.now(), amount });
          const prevLevel = levelFromXp(prevXp);
          const newLevel = levelFromXp(prevXp + xpGain);
          if (newLevel > prevLevel) {
            // Level-up gets the double-bicep flex instead of the jump
            setFlex((f) => f + 1);
            const prevR = rankForLevel(prevLevel);
            const newR = rankForLevel(newLevel);
            if (newR.key !== prevR.key) {
              // Crossing a rank boundary is a full confetti moment
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              fireCelebration({
                title: newR.name[lang],
                description: i18n.nRoomRankUp.replace('{r}', newR.name[lang]),
                icon: 'trophy',
                tier: RANK_TIER[newR.key] ?? 'gold',
              });
            } else {
              toast.success(i18n.nRoomLevelUp.replace('{n}', String(newLevel)));
            }
          } else {
            setCelebrate((c) => c + 1);
          }
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };


  // First visit: a welcome purse so the shop is playable right away
  // (idempotent via the 'welcome' ref_key — granted exactly once)
  useEffect(() => {
    if (!wallet || wallet.claimed.has('welcome') || welcomeTried.current) return;
    welcomeTried.current = true;
    claim.mutate(
      { refKey: 'welcome', amount: 300, reason: 'welcome bonus' },
      {
        onSuccess: () => toast.success(i18n.nRoomWelcome.replace('{n}', '300')),
        /*
          ── a failed welcome has to be retried, and it could not be ──

          `welcomeTried` is set before the call so a re-render cannot grant
          twice, and nothing put it back. A refused claim therefore stayed
          refused for as long as this screen was mounted, and the screen it
          leaves behind is the worst version of itself: a shop with
          thirty-nine things in it and a balance of **zero**, on the very first
          visit, with no word about why.

          The grant is idempotent — `ref_key: 'welcome'` is unique per account,
          so `earn_mascot_coins` pays it once however many times it is asked.
          Which makes clearing the latch on failure free, and leaving it set
          pure loss.

          Same correction `useStreakGuard` already carries, and the same one
          `use-quest-autoclaim` needed: mark before the call, unmark when the
          call comes back refused.
        */
        onError: () => {
          welcomeTried.current = false;
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const completedWeekly = (challenges ?? []).filter((c) => c.completed);

  // Buddy level from quest XP (purchases grant none, so it never drops)
  const xp = wallet?.xp ?? 0;
  const level = levelFromXp(xp);
  /**
   * How wide the shop's stage band may draw.
   *
   * From the window rather than from a layout pass: the band is inside a
   * `<Modal>`, which does not report a useful width until after it has
   * animated in, and a band that resizes on the second frame reads as a jump.
   * `sheetPad` is the sheet's own horizontal padding, doubled.
   */
  const sheetW = Dimensions.get('window').width - spacing.md * 2;
  const intoLevel = xp % LEVEL_XP;
  const rank = rankForLevel(level);
  const upcomingRank = nextRank(level);

  // The shop grid: the current tab, narrowed to the picked category, common
  // first (rarity, then price) so a page reads cheap → dear. "Đặc biệt" is the
  // seasonal shelf (the `special` flag); every other category is by slot, and a
  // seasonal item shows under both.

  // Sets that are complete and not yet claimed — the badge on the collections door

  // Live daily energy — how many of the five signals are met today (from
  // real logs, never claims), so the buddy visibly mirrors the day
  const energyCount = ENERGY_SIGNALS.filter((k) => questDone[k]).length;
  const energyHeadline =
    energyCount === 0
      ? i18n.nRoomEnergyEmpty
      : energyCount >= ENERGY_SIGNALS.length
        ? i18n.nRoomEnergyFull
        : energyCount >= 3
          ? i18n.nRoomEnergyMid
          : i18n.nRoomEnergyLow;

  const streakRefKey = `d:${today}:streak`;
  const streakBonus = streakCoins(streak);

  return (
    <Screen
      back
      transparentHeader
      onScroll={onPageScroll}
      // freeze the buddy the instant a drag begins, before the first frame
      // translates — waiting for the first onScroll would let a frame or two
      // through at the start, which is exactly where a scroll is judged.
      onScrollBeginDrag={markScrolling}
      // 64ms, not 16: this decides whether the room is on screen and whether a
      // scroll is in progress, neither of which needs every frame.
      scrollEventThrottle={64}
      // The name is set into the podium's front face instead — see
      // `studio/stage-label.tsx`. The header keeps its chevron and coin pill.
      title=""
      headerRight={
        <Pressable
          /*
            Hidden test faucet — development builds only.

            It was unconditional, so in a shipped app a long press on the coin
            pill minted 500 coins. That is not a debug affordance once it is on
            a phone in a shop; it is the economy with a hole in it, reachable by
            accident, on the one control a user presses to check their balance.

            The amount also has to sit under `MAX_PER_CLAIM` (300), or the
            faucet raises instead of paying and reads as a broken button.
          */
          hitSlop={7}
          delayLongPress={600}
          onLongPress={
            __DEV__
              ? () => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  claim.mutate(
                    { refKey: `dev:${Date.now()}`, amount: 300, reason: 'dev grant' },
                    { onSuccess: () => toast.success(i18n.nRoomEarned.replace('{n}', '300')) },
                  );
                }
              : undefined
          }
          style={styles.coinPill}>
          <Icon icon={Coins} size={14} />
          <Text style={styles.coinText}>{balance.toLocaleString()}</Text>
        </Pressable>
      }>
      {/* The room.

          It does not lock page scroll any more. It used to: a touch here set
          `stageActive`, which flipped the ScrollView's `scrollEnabled` off so
          a gesture on the buddy stayed "game-only". But the only gesture the
          buddy has is a poke, and a poke is a tap — a drag that scrolls the
          page cancels the `onPress` before it fires, so nothing was being
          protected. What the lock *did* do was turn `scrollEnabled` off in the
          middle of any drag that began on the stage, which is the one thing
          guaranteed to make a scroll stick — and the stage sits at the top of
          the page, right where a thumb starts. So the top scrolls like the
          rest of the page now. If a real drag gesture (a rotate) is ever added
          to the buddy, gate it with a gesture responder on the buddy itself,
          not by disabling the whole page's scroll. */}
      <View style={styles.sceneWrap} onLayout={onStageLayout}>
        <MascotScene
          mascot={mascot}
          equippedOutfits={equippedOutfits}
          celebrateSignal={celebrate}
          flexSignal={flex}
          mood={mood}
          level={level}
          accent={rank.color}
          energy={energyCount / ENERGY_SIGNALS.length}
          streak={streak}
          animated={focused && stageOnScreen}
          scrollPause={scrollPause}
        />
        <CoinBurst trigger={burst.id} amount={burst.amount} />
      </View>

      {/* DEV-only: force an emotion to test the mascot animation without
          recreating real conditions. Hidden in production builds. */}
      {__DEV__ ? (
        <View style={styles.devBar}>
          {(['auto', ...DEV_EMOTIONS] as const).map((label) => {
            const on = label === 'auto' ? devEmo === null : devEmo === label;
            return (
              <Pressable
                key={label}
                hitSlop={9}
                onPress={() => {
                  Haptics.selectionAsync();
                  const next = label === 'auto' ? null : (label as (typeof DEV_EMOTIONS)[number]);
                  setDevEmo(next);
                  setDevEmotion(next);
                }}
                style={[styles.devChip, on && styles.devChipOn]}>
                <Text style={[styles.devChipText, on && styles.devChipTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
          {/* the full spec sheet — all 8 expressions and 5 poses, on device */}
          <Pressable
            hitSlop={9}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/koa-sheet');
            }}
            style={styles.devChip}>
            <Text style={styles.devChipText}>spec sheet →</Text>
          </Pressable>
          {/* the brain, next to the body: fire real events and read the
              decision, including the ones where Koa decides to stay quiet */}
          <Pressable
            hitSlop={9}
            onPress={() => {
              Haptics.selectionAsync();
              router.push('/koa-debug');
            }}
            style={styles.devChip}>
            <Text style={styles.devChipText}>koa debug →</Text>
          </Pressable>
        </View>
      ) : null}
      {mood === 'tired' ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{i18n.nRoomMoodTired}</Text>
        </View>
      ) : message ? (
        <View style={styles.bubble}>
          <Text style={styles.bubbleText}>{message}</Text>
        </View>
      ) : null}

      {/* Today's energy — an Apple-Fitness-style ring where each segment is
          one daily signal, lit in its own colour when met. The buddy is
          only as charged as your real day. */}
      <GlassCard style={styles.energyCard}>
        <View style={styles.energyTopRow}>
          <View style={styles.ringWrap}>
            <EnergyRing
              size={104}
              stroke={10}
              segments={ENERGY_SIGNALS.map((k) => ({ on: questDone[k], color: SIGNAL_META[k].color }))}
            />
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={styles.ringNum}>
                {energyCount}
                <Text style={styles.ringNumMax}>/{ENERGY_SIGNALS.length}</Text>
              </Text>
              <Text style={styles.ringSub}>{i18n.nToday}</Text>
            </View>
          </View>
          <View style={styles.energyInfo}>
            <Text style={styles.energyTitle}>{i18n.nRoomEnergy}</Text>
            <Text style={styles.energyHint}>{energyHeadline}</Text>
          </View>
        </View>
        <View style={styles.energyPips}>
          {ENERGY_SIGNALS.map((k) => {
            const meta = SIGNAL_META[k];
            const on = questDone[k];
            return (
              <View
                key={k}
                style={[
                  styles.energyPip,
                  on && { backgroundColor: `${meta.color}1f`, borderColor: `${meta.color}66` },
                ]}>
                <Icon icon={meta.icon} size={16} color={on ? meta.color : colors.mutedForeground} />
                <Text style={[styles.energyPipLabel, on && { color: colors.foreground }]}>
                  {i18n[meta.labelKey]}
                </Text>
              </View>
            );
          })}
        </View>
      </GlassCard>

      {/* Quick actions.

          One door, not two. "Cửa hàng" and "Tủ đồ" used to be separate chips
          landing on separate tabs, which asked people to choose between two
          things before they had seen either. They are two corners of one
          fitting room — so the chip opens the room, and the room's own four
          tabs pick the corner. */}
      <View style={styles.chipRow}>
        <ActionChip
          icon={Shirt}
          label={i18n.nRoomDressing}
          color={colors.metricPurple}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/shop');
          }}
        />
        <ActionChip
          icon={Cat}
          label={i18n.nRoomChangeBuddy}
          color={colors.metricOrange}
          onPress={() => {
            Haptics.selectionAsync();
            router.push('/settings');
          }}
        />
      </View>

      {/* Buddy level — lifetime coins earned, spending never lowers it.
          The rank badge/colour re-skins as the buddy climbs. */}
      <GlassCard style={styles.levelCard}>
        <View style={[styles.levelBadge, { backgroundColor: `${rank.color}22`, borderColor: `${rank.color}55` }]}>
          <Icon icon={Star} size={20} color={rank.color} />
          <Text style={[styles.levelBadgeNum, { color: rank.color }]}>{level}</Text>
        </View>
        <View style={styles.levelInfo}>
          <View style={styles.levelTopRow}>
            <View style={styles.levelTitleWrap}>
              <Text style={[styles.rankName, { color: rank.color }]}>{rank.name[lang]}</Text>
              <Text style={styles.levelTitle}>
                {i18n.nRoomLevel.replace('{n}', String(level))}
              </Text>
            </View>
            {streak >= 2 && (
              <View style={styles.streakChip}>
                <Icon icon={Flame} size={12} />
                <Text style={styles.streakChipText}>
                  {i18n.nRoomStreak.replace('{n}', String(streak))}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.levelTrack}>
            <View
              style={[
                styles.levelFill,
                { width: `${Math.round((intoLevel / LEVEL_XP) * 100)}%`, backgroundColor: rank.color },
              ]}
            />
          </View>
          <Text style={styles.levelHint}>
            {i18n.nRoomLevelHint.replace('{n}', String(LEVEL_XP - intoLevel))}
          </Text>
          {/*
            ── what Koa has worked out, said out loud ──

            The model is on the device and nothing about it is secret, so the
            app says what it learned rather than only acting on it. An app that
            silently changes its behaviour based on a profile it will not show
            you is the version of personalisation everybody has learned to
            distrust; one sentence, in the buddy's own room, is the difference.

            It appears only once there is a real habit — `habit()` returns null
            until the person agrees with themselves — so it can never be a
            guess dressed as an observation.
          */}
          {learned ? <Text style={styles.learned}>{learned}</Text> : null}
        </View>
      </GlassCard>

      {/*
        ── the freeze, next to the streak it protects ──

        Not in the shop. The shop dresses Koa in whatever you are looking at and
        frames a camera on it; there is nothing to try on here, and an item that
        only makes sense beside a number belongs beside that number. Somebody
        reading "12 days" is the person who wants to know it can survive a
        Tuesday.
      */}
      <GlassCard style={styles.freezeCard}>
        <View style={styles.freezeHead}>
          <View style={styles.freezeIcon}>
            <Icon icon={Snowflake} size={18} color={colors.metricBlue} />
          </View>
          <View style={styles.freezeText}>
            <Text style={styles.freezeTitle}>{i18n.nFreezeTitle}</Text>
            <Text style={styles.freezeHeld}>
              {i18n.nFreezeHeld.replace('{n}', String(freezeHeld)).replace('{max}', String(FREEZE_MAX))}
            </Text>
          </View>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.nFreezeBuy.replace('{n}', String(FREEZE_PRICE))}
            disabled={freezeFull || buyFreeze.isPending || balance < FREEZE_PRICE}
            onPress={() => {
              Haptics.selectionAsync();
              buyFreeze.mutate();
            }}
            style={[
              styles.freezeBuy,
              (freezeFull || balance < FREEZE_PRICE) && styles.freezeBuyOff,
            ]}>
            <Text style={styles.freezeBuyText}>
              {freezeFull ? i18n.nFreezeFull : i18n.nFreezeBuy.replace('{n}', String(FREEZE_PRICE))}
            </Text>
          </PressScale>
        </View>
        <Text style={styles.freezeHint}>{i18n.nFreezeHint}</Text>
        {freezeUsed > 0 ? (
          <Text style={styles.freezeSaved}>
            {(freezeUsed === 1 ? i18n.nFreezeSaved : i18n.nFreezeSavedPlural).replace(
              '{n}',
              String(freezeUsed),
            )}
          </Text>
        ) : null}
      </GlassCard>

      {/* Rank journey — the whole ladder at a glance */}
      <GlassCard style={styles.journeyCard}>
        <View style={styles.journeyHead}>
          <Text style={styles.journeyTitle}>{i18n.nRoomJourney}</Text>
          <Text style={styles.journeySub}>
            {upcomingRank ? (
              <>
                {i18n.nRoomLevelsToRank
                  .replace('{n}', String(upcomingRank.minLevel - level))
                  .replace('{r}', '')}
                <Text style={{ color: upcomingRank.color, fontWeight: '700' }}>
                  {upcomingRank.name[lang]}
                </Text>
              </>
            ) : (
              i18n.nRoomMaxRank
            )}
          </Text>
        </View>
        <RankJourney ranks={RANKS} currentKey={rank.key} lang={lang} cardBg={colors.card} />
      </GlassCard>

      {/* Daily quests */}
      <GlassCard style={styles.card}>
        <Text style={styles.cardTitle}>{i18n.nRoomQuests}</Text>
        <Text style={styles.cardHint}>{i18n.nRoomQuestsHint}</Text>
        {/* Only the quests that count for this account — an account with no
            step source never receives a step count, so listing the steps quest
            here would be offering 10 coins nobody can collect. */}
        {DAILY_QUESTS.filter((q) => activeQuests.includes(q.key)).map((q) => {
          const refKey = questRefKey(today, q.key);
          const isClaimed = claimed.has(refKey);
          const isDone = questDone[q.key];
          return (
            <View key={q.key} style={styles.questRow}>
              <View style={styles.questInfo}>
                <Text style={[styles.questName, isClaimed && styles.questNameDone]}>
                  {/* `{n}` is the steps goal, from the same source the quest's
                      own condition reads — see DAILY_QUESTS. Every other label
                      has no placeholder and passes through untouched. */}
                  {q.name[lang].replace('{n}', stepsGoal.toLocaleString())}
                </Text>
                <View style={styles.questCoins}>
                  <Icon icon={Coins} size={11} />
                  <Text style={styles.questCoinText}>+{q.coins}</Text>
                  <Text style={styles.questXpText}>+{q.xp} XP</Text>
                </View>
              </View>
              {/*
                No button. A finished quest collects itself from wherever you
                were standing when you finished it — see `use-quest-autoclaim`
                for why the old "Nhận" was a tax rather than a reward: the coins
                were already earned, the app already knew, and the only thing in
                between was remembering that this room exists.

                So the row is a read-out now: collected, or not done yet. The
                brief window where a quest is done and the claim is still in
                flight reads as "not done", which is honest — the coins have not
                landed — and lasts one request.
              */}
              {isClaimed ? (
                <View style={styles.claimedChip}>
                  <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
                  <Text style={styles.claimedText}>{i18n.nRoomClaimed}</Text>
                </View>
              ) : (
                <Text style={styles.claimTextDisabled}>{isDone ? '…' : '—'}</Text>
              )}
            </View>
          );
        })}
        {/*
          Streak bonus — appears from day 2, pays more the longer the run.

          ── and only once today is actually in the streak ──

          The gate was `streak >= 2` alone. But `streak` counts the run up to
          the last logged day, so on a morning with nothing logged yet it still
          reads 7 — and the bonus is keyed `d:<today>:streak`, so claiming it
          paid for a day that had not happened. Log nothing else and the streak
          then breaks, leaving a paid bonus for a broken day.

          `loggedToday` is already computed by `useDailyStreak` for exactly this
          question, and was simply not being asked.
        */}
        {streak >= 2 && loggedToday && (
          <View style={styles.questRow}>
            <View style={styles.questInfo}>
              <View style={styles.streakNameRow}>
                <Icon icon={Flame} size={14} />
                <Text
                  style={[styles.questName, claimed.has(streakRefKey) && styles.questNameDone]}>
                  {i18n.nRoomStreak.replace('{n}', String(streak))}
                </Text>
              </View>
              <View style={styles.questCoins}>
                <Icon icon={Coins} size={11} />
                <Text style={styles.questCoinText}>+{streakBonus}</Text>
                <Text style={styles.questXpText}>+{STREAK_XP} XP</Text>
              </View>
            </View>
            {claimed.has(streakRefKey) ? (
              <View style={styles.claimedChip}>
                <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
                <Text style={styles.claimedText}>{i18n.nRoomClaimed}</Text>
              </View>
            ) : (
              <PressScale
                disabled={claim.isPending}
                style={styles.claimBtn}
                onPress={() => reward(streakRefKey, streakBonus, `streak:${streak}`, STREAK_XP)}>
                <Text style={styles.claimText}>{i18n.nRoomClaim}</Text>
              </PressScale>
            )}
          </View>
        )}
      </GlassCard>

      {/*
        ── weekly challenges: a receipt, not a till ──

        This card used to carry a "Claim" button paying `WEEKLY_BONUS_COINS`
        (40) + 40 XP under the key `w:<id>`. But finishing a challenge is
        *already* paid, automatically, the moment progress completes it —
        `use-extras.ts` writes `ch:<tier>:<week>:<key>` worth 25/50/80/120 by
        tier.

        Two keys for one event, and `UNIQUE(user_id, ref_key)` cannot see that
        they mean the same thing. So every finished challenge paid twice: a gold
        one gave 120 coins and 120 XP instead of 80 and 80. XP is derived from
        this same ledger, so the inflation carried straight into level, rank,
        the level-up celebrations and the shop's `unlockLevel` gates.

        The tier-scaled path is the one that survives: it is the table the
        economy was balanced around, and a platinum challenge ought to be worth
        more than a bronze one, which a flat 40 made false.

        So this card shows what was already paid. Nothing to press, nothing to
        remember to come back for — and the amount comes from `CHALLENGE_REWARD`
        so it can never drift from what the ledger actually recorded.
      */}
      {completedWeekly.length > 0 && (
        <GlassCard style={styles.card}>
          <Text style={styles.cardTitle}>{i18n.nRoomWeeklyBonus}</Text>
          {completedWeekly.map((c) => {
            const t = CHALLENGE_TEXT[c.challenge_key];
            const paid = CHALLENGE_REWARD[c.reward_tier ?? 'bronze'] ?? CHALLENGE_REWARD.bronze;
            return (
              <View key={c.id} style={styles.questRow}>
                <View style={styles.questInfo}>
                  <Text style={[styles.questName, styles.questNameDone]}>
                    {t ? t.title[lang] : c.title}
                  </Text>
                  <View style={styles.questCoins}>
                    <Icon icon={Coins} size={11} />
                    <Text style={styles.questCoinText}>+{paid.coins}</Text>
                    <Text style={styles.questXpText}>+{paid.xp} XP</Text>
                  </View>
                </View>
                <View style={styles.claimedChip}>
                  <Icon icon={Check} size={13} color={colors.readinessGreen} strokeWidth={3} />
                  <Text style={styles.claimedText}>{i18n.nRoomClaimed}</Text>
                </View>
              </View>
            );
          })}
        </GlassCard>
      )}

      {/*
        ── the two rooms these belong to were the same room all along ──

        `Thử thách` and `Thành tích` sat at the bottom of the Progress tab under
        a heading called `Xem thêm`, which is a heading that means "these had
        nowhere to go".

        The challenge one was worse than merely homeless. A finished weekly
        challenge pays `WEEKLY_BONUS_COINS` and `WEEKLY_BONUS_XP`, and it is
        paid **on this page** — the card directly above this comment. So the
        progress bar was on one tab and the reward for filling it was on
        another, with nothing on either side saying so. Somebody could complete
        five challenges and never learn there were coins waiting.

        Awards are the same currency of earned things — badges, tiers, a ladder
        — sitting a few points below the rank journey, which is a ladder made of
        the same idea. They are next to it now.

        Rows rather than cards: both are lists, both open in full, and the count
        on the right answers the usual question — *is there anything new* —
        without the trip. Which is also why the challenge row counts completed
        against total rather than showing a bare number: `3/5` says there are
        two left to earn, and `5` says nothing at all.
      */}
      <View style={styles.gameRows}>
        <ShortcutRow
          icon={Swords}
          label={i18n.nChallenges}
          value={challenges && challenges.length > 0
            ? `${challenges.filter((c) => c.completed).length}/${challenges.length}`
            : null}
          onPress={() => router.push('/challenges')}
        />
        <ShortcutRow
          icon={Medal}
          label={i18n.nAwards}
          value={awards && awards.length > 0 ? String(awards.length) : null}
          onPress={() => router.push('/awards')}
        />
      </View>

    </Screen>
  );
}

function ActionChip({
  icon,
  label,
  color,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      style={styles.chip}>
      <View style={[styles.chipIcon, { backgroundColor: `${color}1c` }]}>
        <Icon icon={icon} size={17} color={color} />
      </View>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </PressScale>
  );
}




const styles = StyleSheet.create({
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    height: 30,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,217,61,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.35)',
  },
  coinText: { ...type.footnote, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },

  bubble: {
    alignSelf: 'center',
    maxWidth: '88%',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginTop: -spacing.sm,
  },
  bubbleText: { ...type.footnote, color: colors.foreground, textAlign: 'center', lineHeight: 19 },

  // Full-bleed hero: cancel the page's horizontal padding so the gym art
  // reaches both screen edges, and tuck the next content up into the bottom
  // dissolve instead of leaving an empty band.
  sceneWrap: { position: 'relative', marginHorizontal: -spacing.md, marginBottom: -28 },
  devBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: spacing.sm },
  devChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  devChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  devChipText: { ...type.caption, color: colors.mutedForeground, fontWeight: '700' },
  devChipTextOn: { color: colors.primaryForeground },
  burstWrap: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  burstPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(8,8,10,0.78)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,217,61,0.4)',
  },
  burstText: { ...type.headline, fontWeight: '800', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },

  energyCard: { gap: spacing.md },
  energyTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ringWrap: { width: 104, height: 104, alignItems: 'center', justifyContent: 'center' },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNum: { ...type.title, fontSize: 26, fontWeight: '800', color: colors.foreground, lineHeight: 28, fontVariant: ['tabular-nums'] },
  ringNumMax: { ...type.footnote, fontWeight: '700', color: colors.mutedForeground },
  ringSub: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', color: colors.mutedForeground, marginTop: 3 },
  energyInfo: { flex: 1, minWidth: 0, gap: 4 },
  energyTitle: { ...type.headline, color: colors.foreground },
  energyHint: { ...type.footnote, color: colors.mutedForeground, lineHeight: 18 },
  energyPips: { flexDirection: 'row', gap: spacing.sm - 2 },
  energyPip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  energyPipLabel: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },

  journeyCard: { gap: spacing.md },
  journeyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  journeyTitle: { ...type.headline, color: colors.foreground },
  journeySub: { ...type.footnote, color: colors.mutedForeground },

  card: { gap: spacing.sm },
  gameRows: { gap: spacing.sm },
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.caption, color: colors.mutedForeground, marginTop: -4 },

  levelCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelBadge: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    borderWidth: 1,
  },
  levelBadgeNum: { fontSize: 11, fontWeight: '800', fontVariant: ['tabular-nums'], marginTop: -2 },
  levelInfo: { flex: 1, minWidth: 0, gap: 6 },
  levelTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelTitleWrap: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1, minWidth: 0 },
  rankName: { ...type.headline, fontWeight: '800' },
  levelTitle: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  levelTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.secondary,
    overflow: 'hidden',
  },
  levelFill: { height: '100%', borderRadius: 3 },
  levelHint: { ...type.caption, color: colors.mutedForeground },
  learned: { ...type.caption, color: colors.metricBlue, marginTop: 4 },
  freezeCard: { gap: spacing.xs },
  freezeHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  freezeIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(88,166,255,0.12)',
  },
  freezeText: { flex: 1, minWidth: 0 },
  freezeTitle: { ...type.headline, color: colors.foreground },
  freezeHeld: { ...type.caption, color: colors.mutedForeground },
  freezeBuy: {
    height: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  freezeBuyOff: { opacity: 0.45 },
  freezeBuyText: { ...type.caption, fontWeight: '700', color: colors.foreground },
  freezeHint: { ...type.caption, color: colors.mutedForeground },
  freezeSaved: { ...type.caption, fontWeight: '600', color: colors.metricBlue },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: 'rgba(240,138,58,0.12)',
  },
  streakChipText: { ...type.caption, fontWeight: '700', color: colors.metricOrange },
  streakNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  questRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 4 },
  questInfo: { flex: 1, minWidth: 0, gap: 3 },
  questName: { ...type.body, color: colors.foreground },
  questNameDone: { color: colors.mutedForeground },
  questCoins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  questCoinText: { ...type.caption, fontWeight: '700', color: colors.readinessYellow, fontVariant: ['tabular-nums'] },
  questXpText: {
    ...type.caption,
    fontWeight: '700',
    color: colors.metricPurple,
    fontVariant: ['tabular-nums'],
    marginLeft: 4,
  },
  claimBtn: {
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimBtnDisabled: { backgroundColor: colors.secondary },
  claimText: { ...type.footnote, fontWeight: '700', color: colors.primaryForeground },
  claimTextDisabled: { color: colors.mutedForeground },
  claimedChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  claimedText: { ...type.footnote, color: colors.readinessGreen, fontWeight: '600' },

  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { ...type.caption, color: colors.foreground, fontWeight: '600', flexShrink: 1 },

  sheetBackdropWrap: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,4,6,0.6)',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: '#101014',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sheetTitle: { ...type.headline, color: colors.foreground, flex: 1 },
  sheetCoins: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.secondary,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: colors.card },
  tabText: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  tabTextActive: { color: colors.foreground },
  sheetScroll: { paddingBottom: spacing.lg },
  shopStage: { alignItems: 'center', paddingBottom: spacing.sm },

  // Category icon row (outfit tab)
  catRow: { gap: spacing.md, paddingBottom: spacing.md, paddingHorizontal: 2 },
  catItem: { alignItems: 'center', gap: 5, width: 56 },
  catIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  catIconOn: { backgroundColor: 'rgba(124,106,255,0.16)', borderColor: colors.primary },
  catLabel: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  catLabelOn: { color: colors.foreground },

  shopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shopItem: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
  },
  itemIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemName: { ...type.caption, color: colors.foreground, fontWeight: '600', textAlign: 'center' },
  rarityBadge: { paddingHorizontal: 8, height: 17, borderRadius: radius.full, justifyContent: 'center' },
  rarityText: { fontSize: 11, fontWeight: '700' },
  lockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    minWidth: 64,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  lockText: { ...type.caption, fontWeight: '700', color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  emptyCat: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },

  // Collections banner + rows
  setsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(124,106,255,0.1)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(124,106,255,0.35)',
  },
  setsChest: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(124,106,255,0.16)',
  },
  setsBannerText: { flex: 1, minWidth: 0, gap: 2 },
  setsTitle: { ...type.headline, color: colors.foreground },
  setsHint: { ...type.caption, color: colors.mutedForeground },
  setsChevron: { fontSize: 24, color: colors.mutedForeground, marginRight: 4 },
  setsBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.readinessGreen,
  },
  setsBadgeText: { fontSize: 12, fontWeight: '800', color: '#04120c' },
  setCard: { gap: spacing.sm },
  setTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  setInfo: { flex: 1, minWidth: 0, gap: 3 },
  setName: { ...type.body, fontWeight: '700', color: colors.foreground },
  setProgressText: { ...type.footnote, color: colors.mutedForeground, fontWeight: '600', fontVariant: ['tabular-nums'] },
  setTrack: { height: 6, borderRadius: 3, backgroundColor: colors.secondary, overflow: 'hidden' },
  setFill: { height: '100%', borderRadius: 3 },

  buyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    minWidth: 64,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  buyBtnPoor: { backgroundColor: colors.secondary },
  buyText: { ...type.caption, fontWeight: '700', color: colors.primaryForeground, fontVariant: ['tabular-nums'] },
  buyTextPoor: { color: colors.mutedForeground },
  ownedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 28,
    minWidth: 64,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  wearingBtn: { backgroundColor: 'rgba(43,245,168,0.14)' },
  ownedText: { ...type.caption, color: colors.mutedForeground, fontWeight: '600' },
  wearingText: { color: colors.readinessGreen },
});

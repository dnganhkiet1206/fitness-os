import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantAura } from '@/components/ascnd/assistant-aura';
import { Glyph, GLYPH_TINT, type GlyphName } from '@/components/ascnd/assistant-icons';
import { LiquidGlass, tintBorder } from '@/components/ascnd/liquid-glass';
import { MetricPanel } from '@/components/ascnd/metric-panel';
import { Settle } from '@/components/ascnd/settle';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAssistantSignal } from '@/hooks/use-assistant-signal';
import { useCoachChat } from '@/hooks/use-coach-chat';
import { useSmartNudges } from '@/hooks/use-smart-nudges';
import { useDailyLog, useProfile, useTodayBiometrics } from '@/hooks/useTodayData';
import { useBiometricHistory } from '@/hooks/use-biometrics';
import { useKcalHistory, useReadinessHistory, useSleepDurationHistory } from '@/hooks/use-fitness-data';
import { briefFor } from '@/lib/assistant-brief';
import { analyse, WINDOW_DAYS, type MetricKind } from '@/lib/metric-analysis';
import { suggestionsFor } from '@/lib/assistant-suggestions';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';

/**
 * Health Assistant — the screen you open to ask about your own body.
 *
 * ── a hub, and the coach is next door ──
 *
 * This is where you *look* at today; `/ai-coach` is where you *talk* about it.
 * They were one screen for a while — the ask bar took text and the transcript
 * replaced the landing — and that failed for a reason unrelated to the code:
 * one page trying to be a dashboard and a conversation at once has to change
 * its header, its scroll and its whole identity under you as you type.
 *
 * So the input is gone and a card stands where it was. The card is the bridge:
 * it carries today's four questions, so the common case is one tap instead of
 * a tap and then typing, and tapping the card itself opens an empty chat with
 * the keyboard already up. Both go to the same place with the same four
 * questions, from the same `useAssistantSignal`.
 *
 * What is on this page, and all of it real:
 *
 *   - the metric tiles read today's log, and show `—` rather than `0` where a
 *     value is missing, because zero is a measurement and "not yet" is not.
 *     Nothing displays a number the app cannot produce — the reference's
 *     "Stress 28" is a tile this app has no source for, and it is `Sẵn sàng`
 *     instead, which is the app's own headline metric.
 *   - the coach card's questions come from `assistant-suggestions`, chosen from
 *     that same log, and each carries the question it asks rather than a topic.
 *   - the tools go to four screens that exist.
 *
 * ── the header never changes ──
 *
 * It briefly grew a clock and a plus beside the home button whenever a
 * conversation was open — three identical grey discs, two of which both read as
 * "leave this chat". One button, one place, one meaning: leave the page.
 *
 * ── full bleed, because the light has to reach the corners ──
 *
 * Every other page uses `Screen`, which owns a header and lays its own padding.
 * This one does not: the aura is the background of the whole screen including
 * under the status bar, and a scaffold that starts content below a safe-area
 * inset would put a hard black band across the top of it. The header here is
 * ordinary content that happens to be first.
 *
 * ── two layers, and glass belongs to only one of them ──
 *
 * This shipped with twelve `LiquidGlass` surfaces — every tile, chip and
 * shortcut — and read muddy. Apple's guidance says why, and it is structural
 * rather than a matter of taste: *"Don't use Liquid Glass in the content
 * layer… including it in the content layer can result in… a confusing visual
 * hierarchy,"* and *"use Liquid Glass effects sparingly."* Twelve translucent
 * panels over a drifting aura is twelve surfaces at the same value with no
 * clear edge — nothing is in front of anything.
 *
 * So the screen is two layers now. Content — tiles, chips, shortcuts — sits on
 * `SolidCard`, dark and opaque enough to stay legible while coloured light
 * moves behind it. Glass is left to the two things that genuinely *float*: the
 * state pill over the lit zone, and the ask bar over the whole page.
 */

interface Metric {
  key: string;
  glyph: GlyphName;
  label: { vi: string; en: string };
  value: string;
  unit?: string;
  /** the small line under the number — a state, not a repeat of the number */
  note: { vi: string; en: string };
  noteTint: string;
  /** which analysis this tile opens, in place */
  kind: MetricKind;
}


/** The colour a glyph lights its panel with — the saturated half of its own gradient. */
const litBy = (g: GlyphName) => GLYPH_TINT[g][1];

interface Tool {
  key: string;
  glyph: GlyphName;
  label: { vi: string; en: string };
  hint: { vi: string; en: string };
  route: string;
}

/** The original four, with the hints the redesign dropped. */
const TOOLS: Tool[] = [
  /* This slot held "AI Coach → /ai-coach" and then "Past chats → /ai-coach",
     and both were the same mistake: a card offering to take you somewhere you
     already are. Past chats is a panel on this page now, reached from the
     conversation itself. The slot goes to something that is genuinely
     elsewhere. */
  { key: 'steps', glyph: 'bolt', label: { vi: 'Vận động', en: 'Movement' }, hint: { vi: 'Bước chân và calo hôm nay', en: 'Steps and calories today' }, route: '/steps' },
  { key: 'scan', glyph: 'camera', label: { vi: 'Quét thực phẩm', en: 'Scan a meal' }, hint: { vi: 'Hướng máy ảnh vào đĩa ăn', en: 'Point the camera at a plate' }, route: '/scan-food?from=ai' },
  { key: 'bio', glyph: 'heart', label: { vi: 'Sinh trắc học', en: 'Biometrics' }, hint: { vi: 'Nhịp tim, HRV, oxy', en: 'Heart rate, HRV, oxygen' }, route: '/biometrics' },
  { key: 'sleep', glyph: 'moon', label: { vi: 'Giấc ngủ', en: 'Sleep' }, hint: { vi: 'Đêm qua, và xu hướng', en: 'Last night, and the trend' }, route: '/sleep-insights' },
];

export default function AssistantScreen() {
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const insets = useSafeAreaInsets();
  const { data: dailyLog } = useDailyLog();
  const { data: bio } = useTodayBiometrics();
  const { data: profile } = useProfile();

  /*
    The card reads the conversation but never draws it.

    `messages` is here for one reason: if a chat is already open, the card
    offers to continue it instead of offering four fresh questions. The
    transcript itself lives on `/ai-coach` — see `tools/coach-chat.mjs`, which
    is what stops this page from growing one again.
  */
  const { messages } = useCoachChat();
  const chatting = messages.length > 0;
  const lastAsked = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  /*
    Into the coach, optionally with the question already asked.

    A chip sends its question on arrival. The card itself just opens the coach —
    it used to add `ask=1` and raise the keyboard, which covered the four
    questions that are the faster path and animated up while the push was still
    animating in.

    `encodeURIComponent` because these questions contain the numbers they are
    about, and `?` and `&` are ordinary punctuation in a sentence.
  */
  const askCoach = (question?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const to = question ? `/ai-coach?q=${encodeURIComponent(question)}` : '/ai-coach';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(to as any);
  };

  /*
    Real values, or a dash.

    Every tile here has a source in the app already, so none of them is a
    placeholder — and where today has nothing yet the tile shows `—` rather
    than `0`, because zero is a measurement and "not yet" is not.
  */
  const hr = bio?.hr_bpm != null ? Math.round(Number(bio.hr_bpm)) : null;
  const sleepMin = Number(dailyLog?.sleep_duration_min) || 0;
  const kcal = Math.round(Number(dailyLog?.kcal) || 0);
  const readiness = dailyLog?.readiness_score != null ? Math.round(Number(dailyLog.readiness_score)) : null;
  const status = (dailyLog?.readiness_status as 'green' | 'yellow' | 'red' | null) ?? null;

  const metrics: Metric[] = [
    {
      key: 'hr',
      glyph: 'heart',
      label: { vi: 'Nhịp tim', en: 'Heart rate' },
      value: hr != null ? String(hr) : '—',
      unit: hr != null ? 'bpm' : undefined,
      note: hr == null
        ? { vi: 'Chưa có', en: 'No data' }
        : hr < 60 ? { vi: 'Thấp', en: 'Low' } : hr <= 80 ? { vi: 'Bình thường', en: 'Normal' } : { vi: 'Cao', en: 'High' },
      noteTint: hr == null ? colors.glassMuted : hr <= 80 ? colors.readinessGreen : colors.readinessYellow,
      kind: 'hr',
    },
    {
      key: 'sleep',
      glyph: 'moon',
      label: { vi: 'Giấc ngủ', en: 'Sleep' },
      value: sleepMin > 0 ? `${Math.floor(sleepMin / 60)}h ${sleepMin % 60}` : '—',
      unit: sleepMin > 0 ? 'm' : undefined,
      note: sleepMin === 0
        ? { vi: 'Chưa ghi', en: 'Not logged' }
        : sleepMin >= 420 ? { vi: 'Tốt', en: 'Good' } : { vi: 'Thiếu', en: 'Short' },
      noteTint: sleepMin === 0 ? colors.glassMuted : sleepMin >= 420 ? colors.readinessGreen : colors.readinessYellow,
      kind: 'sleep',
    },
    {
      key: 'kcal',
      glyph: 'flame',
      label: { vi: 'Calo', en: 'Calories' },
      value: kcal > 0 ? kcal.toLocaleString() : '—',
      note: { vi: 'Hôm nay', en: 'Today' },
      noteTint: colors.metricBlue,
      kind: 'kcal',
    },
    {
      key: 'readiness',
      glyph: 'gauge',
      label: { vi: 'Sẵn sàng', en: 'Readiness' },
      value: readiness != null ? String(readiness) : '—',
      note: readiness == null
        ? { vi: 'Cần thêm dữ liệu', en: 'Needs data' }
        : status === 'green' ? { vi: 'Tốt', en: 'Good' } : status === 'yellow' ? { vi: 'Vừa', en: 'Moderate' } : { vi: 'Thấp', en: 'Low' },
      noteTint:
        readiness == null
          ? colors.glassMuted
          : status === 'green' ? colors.readinessGreen : status === 'yellow' ? colors.readinessYellow : colors.readinessRed,
      kind: 'readiness',
    },
  ];

  /*
    One signal, three consumers: the hero's briefing, the card's questions, and
    the coach's openers. Built in one place so they cannot disagree about the
    same day — see `use-assistant-signal`.
  */
  const signal = useAssistantSignal();
  const suggestions = suggestionsFor(signal);
  const brief = briefFor(signal, new Date().getHours(), vi);

  /*
    ── the tiles open an analysis, not another screen ──

    Tapping one used to push `/biometrics` or `/sleep-insights`. Those pages are
    still where you *log* things; what they were being used for here was
    answering "and what does that number mean", which the assistant should not
    have to leave itself to answer.

    One is always selected, so the panel is never an empty slot waiting to be
    discovered — readiness on arrival, because it is the app's headline metric
    and the one the aura is already coloured by.

    The four history queries are React Query reads the rest of the app already
    makes; only the selected one is enabled, so opening this page costs the one
    fortnight you are looking at rather than four.
  */
  /* Today's insight. One call a day, cached by date — see `use-smart-nudges`.
     It loads on arrival rather than on a tap: this is the page you open to be
     told something, and a section that waits to be pressed is the "AI đang
     chờ mình" the hero was rebuilt to stop being. */
  const insight = useSmartNudges();

  const [selected, setSelected] = useState<MetricKind>('readiness');
  const readinessHistory = useReadinessHistory(WINDOW_DAYS);
  const sleepHistory = useSleepDurationHistory(WINDOW_DAYS);
  const kcalHistory = useKcalHistory(WINDOW_DAYS);
  const bioHistory = useBiometricHistory(WINDOW_DAYS);

  /* Each source is reshaped to `{ date, value }` here rather than in the lib,
     because the lib is what the check tool runs and it should not have to know
     what a database row looks like. Sleep and calories come from `daily_logs`
     rather than their source tables, so the panel and the tile above it read
     the same column for the same night. */
  const points = (() => {
    if (selected === 'readiness') return (readinessHistory.data ?? []).map((d) => ({ date: d.date, value: d.value }));
    if (selected === 'kcal') return kcalHistory.data ?? [];
    if (selected === 'sleep') return sleepHistory.data ?? [];
    /* Biometrics are samples rather than one row a day, so the day's reading is
       the lowest heart rate it holds — resting heart rate is the number this
       metric is about, and the mean of a day that includes a workout is not it. */
    const byDay = new Map<string, number>();
    for (const smp of bioHistory.data ?? []) {
      const hr = Number(smp.hr_bpm);
      if (!hr) continue;
      const day = String(smp.date_time).slice(0, 10);
      byDay.set(day, Math.min(byDay.get(day) ?? hr, hr));
    }
    return [...byDay].map(([date, value]) => ({ date, value }));
  })();

  const selectedTint = litBy(
    selected === 'hr' ? 'heart' : selected === 'sleep' ? 'moon' : selected === 'kcal' ? 'flame' : 'gauge',
  );

  const analysis = analyse({
    kind: selected,
    points,
    today: new Date(),
    kcalTarget: signal.kcalTarget,
  });

  const go = (route: string) => {
    Haptics.selectionAsync();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(route as any);
  };

  return (
    <View style={styles.root}>
      <AssistantAura state={status} />

      {/*
        No `KeyboardAvoidingView` any more. It was here for the composer, and
        the composer moved to `/ai-coach` — nothing on this page raises a
        keyboard, and a wrapper that pads for one that never appears is a layer
        with a job that no longer exists.
      */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.md,
            /* Clear of the tab bar this page hides — there is no bar, so the
               home indicator is what the last card has to stay above. */
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never">
        {/*
          Each block settles in, 55ms apart.

          Not an entrance — see `settle.tsx`, and the note in `screen.tsx` that
          it is built from. This page stays mounted between visits, so nothing
          here starts from invisible; it starts from *almost* arrived.
        */}
        <Settle index={0}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Health Assistant</Text>
              {/* The AI mark. A pill rather than a word in the title, so the
                  title stays a name and the badge stays a label. */}
              <View style={styles.aiBadge}>
                <Glyph name="spark" size={11} />
                <Text style={styles.aiText}>AI</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>
              {vi ? 'Người đồng hành sức khoẻ của bạn' : 'Your personal health companion'}
            </Text>
          </View>
          {/*
            ── the header does not change ──

            It grew two more grey circles while a conversation was open —
            history, new chat — beside the home button, and that was the mess.
            Three identical unlabelled discs, two of which (`+` and `home`) both
            read as "leave this conversation" with nothing to tell them apart,
            appearing and disappearing as you typed.

            One button, always, in the same place, meaning the same thing:
            leave the page. The two controls that act on the *conversation* moved
            into the conversation, which now lives on `/ai-coach`.
          */}
          {/*
            The way out.

            This page hides the tab bar — the aura runs to all four edges and
            the ask bar sits where the capsule would be — so it is the only way
            back, and it has to look like one. It was a 38pt settings button;
            it is 46pt now and carries a house, because "trở lại" from a screen
            with no bar underneath it is a destination rather than a direction,
            and a chevron pointing left in the top *right* corner would be
            pointing at nothing.
          */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={vi ? 'Về trang chủ' : 'Back to dashboard'}
            hitSlop={10}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.navigate('/');
            }}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Glyph name="home" size={21} />
          </Pressable>
        </View>
        </Settle>

        {/*
          The lit zone — where the reference puts a rendered orb, this puts the
          sentence a person came for.

          It was 168pt of deliberately empty space with a pill at the bottom, on
          the theory that emptiness is what lets light be seen. On screen that
          read as a hole: the aura alone is too quiet to hold the top third of a
          page, and the greeting sat below it competing with the title for the
          same job. One focal point instead — the greeting *is* the hero, it
          sits in the brightest part of the aura, and the pill under it is the
          single thing floating over that light.
        */}
        <Settle index={1}>
        <View style={styles.stage}>
          <Animated.View entering={FadeIn.duration(420)} style={styles.stageInner}>
            {/*
              ── the briefing ──

              This was "Chào buổi tối!" over a paragraph every person on every
              day read identically — sitting directly above four tiles showing
              that person's real numbers. It read as an assistant *waiting*
              rather than one that had already looked.

              Now the greeting carries your name and the lines under it are
              what the app can actually see: how you slept, how recovered you
              are, how long since you trained, what is left of today's food.
              Every one of them is gated on the datum it quotes — a day the app
              knows nothing about says so, rather than inventing a warm sentence
              about numbers it does not have. See `assistant-brief`.
            */}
            <Text style={styles.greeting}>{vi ? brief.greeting.vi : brief.greeting.en}</Text>
            <View style={styles.briefLines}>
              {brief.lines.map((l) => (
                <Text key={l.key} style={styles.greetBody}>
                  {vi ? l.text.vi : l.text.en}
                </Text>
              ))}
            </View>
            <LiquidGlass style={styles.statePill} radius={radius.full}>
              <View style={styles.stateInner}>
                <View
                  style={[
                    styles.stateDot,
                    { backgroundColor: status === 'green' ? colors.readinessGreen : status === 'yellow' ? colors.readinessYellow : status === 'red' ? colors.readinessRed : colors.metricPurple },
                  ]}
                />
                <Text style={styles.stateText}>
                  {readiness != null
                    ? vi ? `Sẵn sàng ${readiness}/100 hôm nay` : `Readiness ${readiness}/100 today`
                    : vi ? 'Đang chờ dữ liệu hôm nay' : 'Waiting for today’s data'}
                </Text>
              </View>
            </LiquidGlass>
          </Animated.View>
        </View>
        </Settle>

        {/*
          ── insight of today ──

          This was `SmartTipsCard` on the dashboard: a button that called the
          model on tap and threw the answer away when the card unmounted, so
          pressing it twice gave two different readings of one unchanged day.

          It belongs here. The hero says what the app can *see*; this says what
          it *means*; the metric panel below is the evidence. Observation,
          insight, evidence — and the dashboard card is now a door into this
          section rather than a second place computing it.

          No tap to start. The one on the dashboard needed one because it was a
          side feature on a page about something else; this is the page you open
          to be told something, and a section waiting to be pressed is exactly
          the "AI đang chờ mình" the rest of this screen was rebuilt to stop
          being.
        */}
        <Settle index={2}>
        <View style={styles.section}>
          <View style={styles.insightHead}>
            <Glyph name="spark" size={15} />
            <Text style={styles.sectionTitle}>{vi ? 'Insight hôm nay' : 'Today’s insight'}</Text>
          </View>
          <LiquidGlass
            style={[styles.insight, tintBorder(litBy('spark'))]}
            radius={radius.lg}
            tint={litBy('spark')}>
            <View style={styles.insightInner}>
              {insight.isPending ? (
                <View style={styles.insightRow}>
                  <ActivityIndicator size="small" color={colors.glassMuted} />
                  <Text style={styles.insightMuted}>
                    {vi ? 'Đang đọc dữ liệu hôm nay…' : 'Reading today’s data…'}
                  </Text>
                </View>
              ) : insight.isError ? (
                /* Says it could not look, rather than "nothing to suggest" —
                   the second one is the app quietly claiming it did. */
                <Pressable
                  accessibilityRole="button"
                  onPress={() => insight.refetch()}
                  style={({ pressed }) => [styles.insightRow, pressed && styles.pressed]}>
                  <Glyph name="alert" size={14} />
                  <Text style={styles.insightMuted}>
                    {vi ? 'Chưa đọc được hôm nay. Chạm để thử lại.' : 'Couldn’t read today. Tap to retry.'}
                  </Text>
                </Pressable>
              ) : !insight.data?.length ? (
                <Text style={styles.insightMuted}>
                  {vi
                    ? 'Hôm nay chưa có gì nổi bật để nhắc bạn.'
                    : 'Nothing stands out about today.'}
                </Text>
              ) : (
                <View style={styles.insightList}>
                  {insight.data.map((n, i) => (
                    <View key={`${n.type}-${i}`} style={styles.insightItem}>
                      {/* The dot is the priority and nothing else. The server
                          also sends an `icon` name, and it is ignored: it comes
                          from a different icon set than the one this screen
                          draws, so honouring it would mean a glyph that either
                          does not exist or means something else here. */}
                      <View
                        style={[
                          styles.insightDot,
                          {
                            backgroundColor:
                              n.priority === 'high'
                                ? colors.readinessRed
                                : n.priority === 'medium'
                                  ? colors.readinessYellow
                                  : colors.readinessGreen,
                          },
                        ]}
                      />
                      <Text style={styles.insightText}>{n.message}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </LiquidGlass>
        </View>
        </Settle>

        {/* ── metrics ── */}
        <Settle index={3}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.metricRow}
          /* Four tiles across a 390pt screen is 85pt each, which cannot hold
             "7h 45m". They scroll, and the fourth peeking at the edge is what
             tells you they do. */
          style={styles.metricScroll}>
          {metrics.map((m) => (
            <Pressable
              key={m.key}
              accessibilityRole="button"
              accessibilityLabel={`${vi ? m.label.vi : m.label.en} ${m.value}`}
              accessibilityState={{ selected: selected === m.kind }}
              onPress={() => {
                Haptics.selectionAsync();
                setSelected(m.kind);
              }}
              style={({ pressed }) => pressed && styles.pressed}>
              <LiquidGlass
                style={[
                  styles.metricCard,
                  tintBorder(litBy(m.glyph)),
                  /* The selected tile keeps its own colour and gains an edge.
                     Without it the panel below is about a tile you cannot pick
                     out of four, which is the same as being about none of
                     them. */
                  selected === m.kind && { borderColor: litBy(m.glyph), borderWidth: 1 },
                ]}
                radius={radius.lg}
                tint={litBy(m.glyph)}>
                <View style={[styles.metricIcon, { backgroundColor: `${litBy(m.glyph)}1f` }]}>
                  <Glyph name={m.glyph} size={19} />
                </View>
                <Text style={styles.metricLabel}>{vi ? m.label.vi : m.label.en}</Text>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue}>{m.value}</Text>
                  {m.unit ? <Text style={styles.metricUnit}>{m.unit}</Text> : null}
                </View>
                <View style={styles.metricNoteRow}>
                  <View style={[styles.metricDot, { backgroundColor: m.noteTint }]} />
                  <Text style={styles.metricNote}>{vi ? m.note.vi : m.note.en}</Text>
                </View>
              </LiquidGlass>
            </Pressable>
          ))}
        </ScrollView>
        {/*
          ── the analysis, in place ──

          One tile is always selected, so this is never an empty slot waiting to
          be discovered — readiness on arrival, the app's headline metric and
          the one the aura is already coloured by. Tapping another swaps the
          contents rather than opening anything.

          `MetricPanel` carries the reasoning about why a sentence sits above
          the chart rather than the other way round.
        */}
        <LiquidGlass
          style={[styles.panel, tintBorder(selectedTint)]}
          radius={radius.lg}
          tint={selectedTint}>
          <MetricPanel
            analysis={analysis}
            tint={selectedTint}
            vi={vi}
            /* Today's column carries its value, and only the caller knows the
               unit. Sleep reads "7h52", calories "2.150", the other two are
               plain numbers — the same forms the tile above them uses, so the
               chart and the tile never print the same night differently. */
            format={(v) =>
              selected === 'sleep'
                ? `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, '0')}`
                : Math.round(v).toLocaleString(vi ? 'vi-VN' : 'en-US')
            }
            onAsk={() => askCoach(vi ? analysis.ask.vi : analysis.ask.en)}
          />
        </LiquidGlass>
        </Settle>

        {/*
          ── the bridge ──

          This is where the ask bar used to be, and it is a card instead on
          purpose. An input on this page made one screen try to be two things:
          a dashboard you glance at and a conversation you live in. Its header,
          its scroll and its whole identity changed under you as you typed.

          A card does the one job that page actually has here — get you to the
          coach, with something already in your hand. It carries today's four
          questions, so the common case is one tap rather than one tap and then
          typing; tapping the card itself opens an empty chat with the keyboard
          up. Same four questions the coach shows on arrival, from the same
          `useAssistantSignal`, because a bridge that leads somewhere different
          from what it advertised is worse than no bridge.

          Bigger than the tiles, and the only `radius.xl` on the page. It is
          the thing this screen is for.
        */}
        <Settle index={4}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vi ? 'Mở AI Coach' : 'Open AI Coach'}
          onPress={() => askCoach()}
          style={({ pressed }) => pressed && styles.pressed}>
          <LiquidGlass
            style={[styles.coachCard, tintBorder(litBy('spark'))]}
            radius={radius.xl}
            tint={litBy('spark')}>
            <View style={styles.coachInner}>
              <View style={styles.coachHead}>
                <View style={styles.coachIcon}>
                  <Glyph name="spark" size={22} />
                </View>
                <View style={styles.coachHeadText}>
                  <View style={styles.coachTitleRow}>
                    <Text style={styles.coachTitle}>AI Coach</Text>
                    <View style={styles.aiBadge}>
                      <Glyph name="spark" size={10} />
                      <Text style={styles.aiText}>AI</Text>
                    </View>
                  </View>
                  <Text style={styles.coachSub}>
                    {vi
                      ? 'Hỏi bất cứ điều gì về tập luyện, ăn uống và phục hồi'
                      : 'Ask anything about training, food and recovery'}
                  </Text>
                </View>
                {/* The only left-pointing glyph in the set, turned around. A
                    second path would be the same shape twice. */}
                <View style={styles.coachGo}>
                  <Glyph name="chevron" size={14} colour={colors.glassMuted} />
                </View>
              </View>

              {chatting ? (
                /*
                  A conversation is already open, so the card offers to go back
                  to it rather than to start over. Without this the card would
                  say "ask me anything" while an unfinished chat sat one tap
                  away behind it, invisible.
                */
                <View style={styles.coachResume}>
                  <Glyph name="clock" size={13} colour={colors.glassMuted} />
                  <Text style={styles.coachResumeText} numberOfLines={1}>
                    {vi ? 'Tiếp tục: ' : 'Continue: '}
                    {lastAsked}
                  </Text>
                </View>
              ) : (
                <View style={styles.chips}>
                  {suggestions.map((s) => (
                    <Pressable
                      key={s.key}
                      accessibilityRole="button"
                      /* The label is what you read; the question is what gets
                         asked. VoiceOver should hear the second one, because
                         "Tôi ngủ chưa đủ" does not describe what pressing it
                         does. */
                      accessibilityLabel={vi ? s.question.vi : s.question.en}
                      onPress={() => askCoach(vi ? s.question.vi : s.question.en)}
                      style={({ pressed }) => pressed && styles.pressed}>
                      <View style={[styles.chip, { borderColor: `${litBy(s.glyph)}3d` }]}>
                        <Glyph name={s.glyph} size={14} />
                        <Text style={styles.chipText}>{vi ? s.label.vi : s.label.en}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </LiquidGlass>
        </Pressable>
        </Settle>

        <Settle index={5}>
        {/*
          The four things the assistant can do *for* you.

          These were the whole of what this page was before the redesign. Three
          survived it as an unlabelled icon row and the fourth — the coach —
          vanished entirely, absorbed into the ask bar. That is a destination
          disappearing because a shortcut to it exists, which is not the same
          thing.

          Restored with the hints they had. Four labels tell you where each one
          goes; four labels *and* a line saying what is behind them tells you
          whether to go. "Sinh trắc học" is a word — "nhịp tim, HRV, oxy" is a
          reason.

          Two across rather than four: a hint needs a line of its own, and four
          columns on a 390pt screen leaves 85pt for it.
        */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{vi ? 'Công cụ' : 'Tools'}</Text>
          <View style={styles.toolGrid}>
            {TOOLS.map((t) => (
              <Pressable
                key={t.key}
                accessibilityRole="button"
                accessibilityLabel={vi ? t.label.vi : t.label.en}
                onPress={() => go(t.route)}
                style={({ pressed }) => [styles.toolWrap, pressed && styles.pressed]}>
                <LiquidGlass
                  style={[styles.tool, tintBorder(litBy(t.glyph))]}
                  radius={radius.lg}
                  tint={litBy(t.glyph)}>
                  <View style={[styles.toolIcon, { backgroundColor: `${litBy(t.glyph)}1f` }]}>
                    <Glyph name={t.glyph} size={19} />
                  </View>
                  <Text style={styles.toolLabel} numberOfLines={1}>
                    {vi ? t.label.vi : t.label.en}
                  </Text>
                  <Text style={styles.toolHint} numberOfLines={2}>
                    {vi ? t.hint.vi : t.hint.en}
                  </Text>
                </LiquidGlass>
              </Pressable>
            ))}
          </View>
        </View>
        </Settle>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.md, gap: spacing.lg },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headText: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.foreground },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(180,92,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180,92,255,0.35)',
  },
  aiText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: colors.metricPurple },
  subtitle: { ...type.footnote, color: colors.mutedForeground },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },

  /* The lit zone. Not empty any more — see the comment at the call site. */
  stage: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  stageInner: { gap: spacing.md },
  statePill: { alignSelf: 'flex-start', marginTop: spacing.xs },
  stateInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 1 },
  stateDot: { width: 8, height: 8, borderRadius: 4 },
  stateText: { ...type.footnote, color: colors.foreground },

  /* 34 against the title's 22. The greeting is the human moment and the title
     is a label; at the same size they compete and the eye lands on neither. */
  greeting: { fontSize: 34, fontWeight: '700', letterSpacing: -0.8, color: colors.foreground },
  greetBody: { ...type.body, color: colors.mutedForeground, lineHeight: 22, maxWidth: 330 },
  /* Sentences, one per line, with air between them. Run together as a
     paragraph they read as prose about you; separated they read as a list of
     things the app noticed, which is what they are. */
  briefLines: { gap: 5 },

  /* ── every caption on glass is `glassMuted`, not `mutedForeground` ──

     `mutedForeground` is measured against a card: dark, still, the same every
     time. There is no card on this screen. Over the aura, with the glass fill
     and a tint wash on top, that grey lands at 2.57:1 — below even the 3:1
     asked of large text, and it showed as the label under each metric fading
     into its own tile. The constant carries the numbers. */
  insightHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  insight: {},
  insightInner: { padding: spacing.md },
  insightRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  insightMuted: { ...type.footnote, color: colors.glassMuted, flex: 1 },
  insightList: { gap: spacing.sm + 2 },
  insightItem: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  /* 7pt, nudged down 6 so it sits on the first line's centre rather than its
     top — a dot aligned to the text box reads as floating above the sentence. */
  insightDot: { width: 7, height: 7, borderRadius: 4, marginTop: 6 },
  insightText: { ...type.footnote, color: colors.foreground, lineHeight: 20, flex: 1 },

  panel: { marginTop: spacing.sm + 2 },
  metricScroll: { marginHorizontal: -spacing.md },
  metricRow: { paddingHorizontal: spacing.md, gap: spacing.sm + 2 },
  metricCard: { width: 132, padding: spacing.md, gap: 6 },
  metricIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  metricLabel: { ...type.caption, color: colors.glassMuted },
  metricValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  metricValue: { fontSize: 26, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  metricUnit: { fontSize: 12, color: colors.glassMuted },
  metricNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metricDot: { width: 6, height: 6, borderRadius: 3 },
  metricNote: { ...type.caption, color: colors.glassMuted },

  section: { gap: spacing.sm + 2 },
  sectionTitle: { ...type.headline, color: colors.foreground },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* Inside the card, so these are outlined pills rather than their own glass.
     A `LiquidGlass` chip on a `LiquidGlass` card is two blurs sampling the same
     aura — the inner one has nothing new to show and reads as a smudge. */
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chipText: { ...type.caption, color: colors.foreground },

  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* Two per row: `(100% − one gap) / 2`, as a fraction so it holds at any width
     rather than assuming a 390pt screen. */
  toolWrap: { width: '48.4%' },
  tool: { padding: spacing.md, gap: 5, minHeight: 118 },
  toolIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  toolLabel: { ...type.footnote, fontWeight: '600', color: colors.foreground },
  toolHint: { ...type.caption, color: colors.glassMuted, lineHeight: 15 },

  /* ── the coach card ──
     `radius.xl` and nothing else on the page uses it: the one surface that is
     a destination rather than a reading. */
  coachCard: { marginTop: spacing.xs },
  coachInner: { padding: spacing.md, gap: spacing.md - 2 },
  coachHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2 },
  coachIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,92,255,0.18)',
  },
  coachHeadText: { flex: 1, gap: 3 },
  coachTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coachTitle: { ...type.headline, color: colors.foreground },
  coachSub: { ...type.caption, color: colors.glassMuted, lineHeight: 16 },
  /* Rotated, because the set has one chevron and it points left. */
  coachGo: { transform: [{ rotate: '180deg' }] },
  coachResume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  coachResumeText: { ...type.caption, color: colors.glassMuted, flex: 1 },

  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});

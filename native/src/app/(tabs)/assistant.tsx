import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantAura } from '@/components/ascnd/assistant-aura';
import { Icon } from '@/components/ascnd/icon';
import { Glyph, GLYPH_TINT, type GlyphName } from '@/components/ascnd/assistant-icons';
import { LiquidGlass, tintBorder } from '@/components/ascnd/liquid-glass';
import { Settle } from '@/components/ascnd/settle';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useDailyLog, useTodayBiometrics } from '@/hooks/useTodayData';

/**
 * Health Assistant — the screen you open to ask about your own body.
 *
 * ── this is the layout, not yet the wiring ──
 *
 * Built to be looked at and pressed before most of it does anything, which is
 * a deliberate order: the four metric tiles read real data because that data
 * already existed, and the suggestion chips and the ask box currently route to
 * screens that exist rather than pretending to be a conversation. Nothing here
 * displays a number the app cannot produce — the reference's "Stress 28" is a
 * tile this app has no source for, and it is `Sẵn sàng` instead, which is the
 * app's own headline metric and is already computed.
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
  route: string;
}

interface Suggestion {
  key: string;
  glyph: GlyphName;
  label: { vi: string; en: string };
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
  { key: 'coach', glyph: 'spark', label: { vi: 'AI Coach', en: 'AI Coach' }, hint: { vi: 'Hỏi về tập luyện hoặc ăn uống', en: 'Ask about training or food' }, route: '/ai-coach' },
  { key: 'scan', glyph: 'camera', label: { vi: 'Quét thực phẩm', en: 'Scan a meal' }, hint: { vi: 'Hướng máy ảnh vào đĩa ăn', en: 'Point the camera at a plate' }, route: '/scan-food?from=ai' },
  { key: 'bio', glyph: 'heart', label: { vi: 'Sinh trắc học', en: 'Biometrics' }, hint: { vi: 'Nhịp tim, HRV, oxy', en: 'Heart rate, HRV, oxygen' }, route: '/biometrics' },
  { key: 'sleep', glyph: 'moon', label: { vi: 'Giấc ngủ', en: 'Sleep' }, hint: { vi: 'Đêm qua, và xu hướng', en: 'Last night, and the trend' }, route: '/sleep-insights' },
];

const SUGGESTIONS: Suggestion[] = [
  { key: 'sleep', glyph: 'moon', label: { vi: 'Cải thiện giấc ngủ', en: 'Improve sleep quality' } },
  { key: 'stress', glyph: 'leaf', label: { vi: 'Giảm căng thẳng', en: 'Reduce stress' } },
  { key: 'energy', glyph: 'bolt', label: { vi: 'Tăng năng lượng', en: 'Increase energy' } },
  { key: 'habit', glyph: 'pulse', label: { vi: 'Xây thói quen tốt', en: 'Build better habits' } },
];

export default function AssistantScreen() {
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const insets = useSafeAreaInsets();
  const { data: dailyLog } = useDailyLog();
  const { data: bio } = useTodayBiometrics();

  const hour = new Date().getHours();
  const greeting =
    hour < 11
      ? vi ? 'Chào buổi sáng!' : 'Good morning!'
      : hour < 18
        ? vi ? 'Chào buổi chiều!' : 'Good afternoon!'
        : vi ? 'Chào buổi tối!' : 'Good evening!';

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
      route: '/biometrics',
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
      route: '/sleep-insights',
    },
    {
      key: 'kcal',
      glyph: 'flame',
      label: { vi: 'Calo', en: 'Calories' },
      value: kcal > 0 ? kcal.toLocaleString() : '—',
      note: { vi: 'Hôm nay', en: 'Today' },
      noteTint: colors.metricBlue,
      route: '/nutrition',
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
      route: '/biometrics',
    },
  ];

  const go = (route: string) => {
    Haptics.selectionAsync();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.push(route as any);
  };

  return (
    <View style={styles.root}>
      <AssistantAura state={status} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.md,
            /* Clear of the pinned ask bar: its own height (50) plus the gap it
               keeps from the bottom, plus one more so the last card is not
               touching it. */
            paddingBottom: insets.bottom + 50 + spacing.md * 2 + spacing.md,
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
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.greetBody}>
              {vi
                ? 'Tôi ở đây để giúp bạn hiểu dữ liệu sức khoẻ, trả lời câu hỏi và đưa ra lời khuyên riêng cho bạn.'
                : 'I’m here to help you understand your health, answer questions, and give personalised advice.'}
            </Text>
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

        {/* ── metrics ── */}
        <Settle index={2}>
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
              onPress={() => go(m.route)}
              style={({ pressed }) => pressed && styles.pressed}>
              <LiquidGlass
                style={[styles.metricCard, tintBorder(litBy(m.glyph))]}
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
        </Settle>

        {/* ── suggestions ── */}
        <Settle index={3}>
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{vi ? 'Gợi ý cho bạn' : 'Suggested for you'}</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => go('/ai-coach')}
              style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}>
              <Text style={styles.seeAllText}>{vi ? 'Xem tất cả' : 'View all'}</Text>
              <Icon icon={ChevronRight} size={14} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.chips}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s.key}
                accessibilityRole="button"
                onPress={() => go('/ai-coach')}
                style={({ pressed }) => pressed && styles.pressed}>
                <LiquidGlass
                  style={[styles.chip, tintBorder(litBy(s.glyph))]}
                  radius={radius.full}
                  tint={litBy(s.glyph)}>
                  <View style={styles.chipInner}>
                    <Glyph name={s.glyph} size={15} />
                    <Text style={styles.chipText}>{vi ? s.label.vi : s.label.en}</Text>
                  </View>
                </LiquidGlass>
              </Pressable>
            ))}
          </View>
        </View>
        </Settle>

        <Settle index={4}>
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

      {/*
        The ask box floats over the content, above the tab bar.

        Pinned rather than scrolled: it is the screen's one primary action, and
        a primary action that scrolls out of reach is one you have to go and
        find. It opens `/ai-coach`, which is the real conversation — this is a
        door, not an input, until the chat moves in here.
      */}
      {/*
        Above the home indicator, not above a tab bar that is no longer there.

        It was offset by `BottomTabInset`, which is the height of a capsule this
        page hides — so it floated 72pt up with nothing beneath it, and the
        tools grid ran underneath it. Now it sits where the thumb already is.
      */}
      <View style={[styles.askWrap, { bottom: insets.bottom + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vi ? 'Hỏi trợ lý sức khoẻ' : 'Ask the health assistant'}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/ai-coach');
          }}
          style={({ pressed }) => pressed && styles.pressed}>
          <LiquidGlass style={styles.ask} radius={radius.full} intensity={30}>
            <View style={styles.askInner}>
              <View style={styles.askSpark}>
                <Glyph name="spark" size={16} />
              </View>
              <Text style={styles.askText} numberOfLines={1}>
                {vi ? 'Hỏi tôi bất cứ điều gì về sức khoẻ…' : 'Ask me anything about your health…'}
              </Text>
              <View style={styles.askSend}>
                <Glyph name="arrow" size={17} colour={colors.primaryForeground} />
              </View>
            </View>
          </LiquidGlass>
        </Pressable>
      </View>
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
  greetBody: { ...type.body, color: colors.mutedForeground, lineHeight: 22, maxWidth: 322 },

  /* ── every caption on glass is `glassMuted`, not `mutedForeground` ──

     `mutedForeground` is measured against a card: dark, still, the same every
     time. There is no card on this screen. Over the aura, with the glass fill
     and a tint wash on top, that grey lands at 2.57:1 — below even the 3:1
     asked of large text, and it showed as the label under each metric fading
     into its own tile. The constant carries the numbers. */
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...type.headline, color: colors.foreground },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  seeAllText: { ...type.footnote, color: colors.primary, fontWeight: '600' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { alignSelf: 'flex-start' },
  chipInner: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md - 2, paddingVertical: spacing.sm + 2 },
  chipText: { ...type.footnote, color: colors.foreground },

  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  /* Two per row: `(100% − one gap) / 2`, as a fraction so it holds at any width
     rather than assuming a 390pt screen. */
  toolWrap: { width: '48.4%' },
  tool: { padding: spacing.md, gap: 5, minHeight: 118 },
  toolIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  toolLabel: { ...type.footnote, fontWeight: '600', color: colors.foreground },
  toolHint: { ...type.caption, color: colors.glassMuted, lineHeight: 15 },

  askWrap: { position: 'absolute', left: spacing.md, right: spacing.md },
  ask: {},
  askInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingLeft: spacing.sm, paddingRight: spacing.sm, paddingVertical: spacing.sm },
  askSpark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,92,255,0.16)',
  },
  askText: { flex: 1, ...type.footnote, color: colors.glassMuted },
  askSend: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },

  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});

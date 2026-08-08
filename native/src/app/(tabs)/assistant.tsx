import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantAura } from '@/components/ascnd/assistant-aura';
import { Glyph, GLYPH_TINT, type GlyphName } from '@/components/ascnd/assistant-icons';
import { LiquidGlass, tintBorder } from '@/components/ascnd/liquid-glass';
import { MarkdownLite } from '@/components/ascnd/markdown-lite';
import { Settle } from '@/components/ascnd/settle';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useCoachChat } from '@/hooks/use-coach-chat';
import { useDailyLog, useProfile, useTodayBiometrics } from '@/hooks/useTodayData';
import { suggestionsFor } from '@/lib/assistant-suggestions';
import { supabase } from '@/integrations/supabase/client';
import { calorieTargetFor, macroTargetsFor } from '@/lib/macro-targets';

/**
 * Health Assistant — the screen you open to ask about your own body.
 *
 * ── it is the coach now, not a door to one ──
 *
 * This was built as layout first and wired after, in that order deliberately.
 * What is here now:
 *
 *   - the four metric tiles read today's log, and show `—` rather than `0`
 *     where a value is missing, because zero is a measurement and "not yet" is
 *     not. Nothing displays a number the app cannot produce — the reference's
 *     "Stress 28" is a tile this app has no source for, and it is `Sẵn sàng`
 *     instead, which is the app's own headline metric.
 *   - the suggestion chips come from `assistant-suggestions`, chosen from the
 *     same log, and each carries the question it asks rather than a topic.
 *   - the ask bar takes text. It was a `Pressable` that pushed `/ai-coach` —
 *     a text field in every way except that it did not accept text.
 *
 * So the screen has two states rather than two screens. Nothing asked: the
 * greeting, the numbers, the suggestions, the tools. Something asked: the
 * transcript, in their place, with "Trò chuyện mới" above it to get back.
 *
 * ── one screen, after briefly being two ──
 *
 * The coach kept its own route for a while after moving in here, so the same
 * conversation had two homes with different chrome, and a "past chats" card
 * that opened the chat you were already in. That is what made an integrated
 * feature feel like two half-features. `/ai-coach` is gone; past chats is a
 * panel on this page; every link that pointed there points here.
 *
 * The header is the other half of that fix. It grew a clock and a plus beside
 * the home button whenever a conversation was open — three identical grey
 * discs, two of which both read as "leave this chat". It never changes now, and
 * the controls that act on the conversation live in the conversation and carry
 * words.
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
  const { session } = useAuth();
  const queryClient = useQueryClient();

  /*
    The conversation lives in `use-coach-chat`, above the router. It is the
    only screen that shows it now, but the provider stays: the chat outlives
    this tab's scroll state and survives switching tabs, which component state
    on a `NativeTabs` child does not reliably do.
  */
  const { messages, isLoading, conversationId, send, newChat, loadConversation, onGrow } = useCoachChat();
  const chatting = messages.length > 0;
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };
  // the answer arrives a token at a time, and the transcript follows it down
  useEffect(() => onGrow(scrollToEnd), [onGrow]);

  /* Past conversations, only fetched while the panel is open — the list is
     never on screen otherwise and a query nobody reads is a request nobody
     needed. */
  const { data: conversations } = useQuery({
    queryKey: ['ai_conversations', session?.user.id],
    enabled: !!session?.user.id && showHistory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('id, title, updated_at')
        .eq('user_id', session!.user.id)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteConvo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
      // deleting the chat you are reading leaves the page showing a
      // conversation that no longer exists anywhere
      if (conversationId === id) newChat();
    },
  });

  const submit = (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text) return;
    setInput('');
    send(text);
  };

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

  /*
    The suggestions come from the same log the tiles above are drawn from.

    `useProfile` is the one extra read, and it is for the targets — a chip that
    says "you are short on protein" has to know what the target was, and the
    fallback in `macro-targets` is what a profile that never went through
    onboarding gets, rather than a number invented here.
  */
  const macros = macroTargetsFor(profile);
  const suggestions = suggestionsFor({
    readiness,
    status,
    acwr: dailyLog?.acwr != null ? Number(dailyLog.acwr) : null,
    sleepMin,
    kcal,
    kcalTarget: calorieTargetFor(profile),
    proteinG: Number(dailyLog?.protein_g) || 0,
    proteinTarget: macros.protein,
    steps: Number(dailyLog?.steps) || 0,
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
        The composer has to rise with the keyboard, and the aura must not.

        `AssistantAura` is a sibling of this view rather than a child, so the
        light keeps the whole screen while the page above it shrinks — a room
        does not get shorter when a keyboard opens. Same arrangement
        light keeps the whole screen while the page above it shrinks.
      */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + spacing.md,
            /* The ask bar is a flex sibling now rather than an absolute overlay,
               so it takes its own room and this only needs air under the last
               card. */
            paddingBottom: spacing.md,
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
            into the conversation, and they carry words. See `chatBar` below.
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
          ── the landing, or the conversation ──

          These are the same screen in two states rather than two screens. With
          nothing asked yet, the page is what it always was: greeting, today's
          numbers, suggestions, tools. Ask something and all of that gives way
          to the transcript.

          Swapped rather than stacked. A conversation under four cards means
          every answer starts below a screenful of things you have already read,
          and the metrics you glanced at on arrival are not what you want to
          scroll past to re-read what the coach just said. The header's `+`
          brings the landing back.
        */}
        {chatting ? (
          <Settle index={1}>
          <View style={styles.transcript}>
            {/*
              ── the two controls that act on the conversation ──

              These were round grey icons in the header, beside the home button:
              a clock and a plus, unlabelled, appearing only while you typed.
              Three identical discs, and no way to know which one keeps your
              chat and which one ends it.

              Words instead, and inside the thing they act on. A control that
              says "Trò chuyện mới" cannot be confused with one that says
              "Trò chuyện cũ", and neither can be confused with the button that
              leaves the page — which now never moves or changes.
            */}
            <View style={styles.chatBar}>
              <Pressable
                accessibilityRole="button"
                onPress={newChat}
                style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}>
                <Glyph name="plus" size={13} colour={colors.glassMuted} />
                <Text style={styles.chatBtnText}>{vi ? 'Trò chuyện mới' : 'New chat'}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowHistory((v) => !v);
                }}
                style={({ pressed }) => [styles.chatBtn, pressed && styles.pressed]}>
                <Glyph name="clock" size={13} colour={colors.glassMuted} />
                <Text style={styles.chatBtnText}>{vi ? 'Trò chuyện cũ' : 'Past chats'}</Text>
              </Pressable>
            </View>
            {messages.map((m, i) => (
              <View key={i} style={[styles.msgRow, m.role === 'user' && styles.msgRowUser]}>
                {m.role === 'assistant' ? (
                  <View style={styles.avatarAI}>
                    <Glyph name="spark" size={14} />
                  </View>
                ) : null}
                {m.role === 'assistant' ? (
                  <LiquidGlass
                    style={[styles.bubble, tintBorder(litBy('spark'))]}
                    radius={radius.lg}
                    tint={litBy('spark')}>
                    <View style={styles.bubbleInner}>
                      <MarkdownLite text={m.content} mutedColor={colors.glassMuted} />
                    </View>
                  </LiquidGlass>
                ) : (
                  <View style={[styles.bubble, styles.bubbleUser]}>
                    <View style={styles.bubbleInner}>
                      <Text style={styles.bubbleUserText}>{m.content}</Text>
                    </View>
                  </View>
                )}
                {m.role === 'user' ? (
                  <View style={styles.avatarUser}>
                    <Glyph name="user" size={14} />
                  </View>
                ) : null}
              </View>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== 'assistant' ? (
              <View style={styles.msgRow}>
                <View style={styles.avatarAI}>
                  <Glyph name="spark" size={14} />
                </View>
                <LiquidGlass
                  style={[styles.bubble, tintBorder(litBy('spark'))]}
                  radius={radius.lg}
                  tint={litBy('spark')}>
                  <View style={styles.bubbleInner}>
                    <ActivityIndicator size="small" color={colors.glassMuted} />
                  </View>
                </LiquidGlass>
              </View>
            ) : null}
          </View>
          </Settle>
        ) : (
          <>
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
            {/* "Xem tất cả" used to sit here and open `/ai-coach`. There is no
                "all" — these four are chosen from today, and the page it opened
                is the page you are on. */}
            <Text style={styles.sectionTitle}>{vi ? 'Gợi ý cho bạn' : 'Suggested for you'}</Text>
            <View style={styles.chips}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.key}
                  accessibilityRole="button"
                  /* The label is what you read; the question is what gets asked.
                     VoiceOver should hear the second one, because "Tôi ngủ chưa
                     đủ" does not describe what pressing it does. */
                  accessibilityLabel={vi ? s.question.vi : s.question.en}
                  onPress={() => submit(vi ? s.question.vi : s.question.en)}
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
          </>
        )}
      </ScrollView>

      {/*
        ── the ask bar is the composer now ──

        It was a `Pressable` that pushed `/ai-coach`: a text field in every way
        except that it did not accept text. Tapping it and then having to tap
        the real field on the next screen is the one thing a control shaped like
        an input must not do.

        So the coach moved in here. Same pill, same 34pt spark, same 34pt send
        circle — nothing about it changed except that it works. The conversation
        itself comes from `useCoachChat`.

        Pinned rather than scrolled: it is the screen's primary action, and one
        that scrolls out of reach is one you have to go and find. Above the home
        indicator, not above a tab bar this page hides.
      */}
      <View style={[styles.askWrap, { paddingBottom: insets.bottom + spacing.md }]}>
        <LiquidGlass style={styles.ask} radius={radius.full} intensity={30}>
          <View style={styles.askInner}>
            <View style={styles.askSpark}>
              <Glyph name="spark" size={16} />
            </View>
            <TextInput
              ref={inputRef}
              style={styles.askInput}
              placeholder={vi ? 'Hỏi tôi bất cứ điều gì về sức khoẻ…' : 'Ask me anything about your health…'}
              placeholderTextColor={colors.glassMuted}
              value={input}
              onChangeText={setInput}
              multiline
              onSubmitEditing={() => submit()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={vi ? 'Gửi' : 'Send'}
              /* 34pt drawn so the pill keeps its proportions; 5 of slop reaches
                 the 44pt HIG floor. Same trade as the coach's send button. */
              hitSlop={5}
              disabled={!input.trim() || isLoading}
              onPress={() => submit()}
              style={({ pressed }) => [
                styles.askSend,
                (!input.trim() || isLoading) && styles.sendDisabled,
                pressed && styles.pressed,
              ]}>
              <Glyph name="arrow" size={17} colour={colors.primaryForeground} />
            </Pressable>
          </View>
        </LiquidGlass>
        {/*
          ── the disclaimer came with the chat ──

          It was attached to the coach's composer, which is the right place for
          it: it is a statement about what the answers are and are not. When the
          chat moved onto this page the line did not come with it, and this
          screen would have been taking health questions with nothing saying
          the replies are not a diagnosis.

          Caught by rendering the two states and looking at them — the mock had
          it because the mock reused the coach's composer, and the code did not.
        */}
        <View style={styles.disclaimerRow}>
          <Glyph name="alert" size={12} />
          <Text style={styles.disclaimer}>
            {vi
              ? 'AI chỉ hỗ trợ nhắc nhở thói quen, không chẩn đoán hay phát hiện bệnh. Gặp bác sĩ khi có vấn đề sức khoẻ.'
              : 'AI supports habit reminders only — it does not diagnose or detect illness. See a doctor for health concerns.'}
          </Text>
        </View>
      </View>
      </KeyboardAvoidingView>

      {/*
        Past conversations, laid over the page rather than pushed as a screen.

        This used to be `/ai-coach` — a whole second route showing the *same*
        conversation with different chrome, which is what made the feature feel
        like two half-features. Opening "past chats" and landing on the chat you
        were already in is the exact confusion this removes. It is a list you
        pick from and dismiss, so it is a panel.
      */}
      {showHistory ? (
        <>
          {/* Tapping anywhere off the panel closes it — a menu with no way out
              but the control that opened it is a trap on a page this full. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={vi ? 'Đóng' : 'Close'}
            style={styles.historyScrim}
            onPress={() => setShowHistory(false)}
          />
          <View style={[styles.historyWrap, { top: insets.top + 64 }]}>
            <LiquidGlass style={styles.historyPanel} radius={radius.lg} intensity={34}>
              {/* A menu has to be readable, and glass alone is not: the page
                  behind it comes through the blur and collides with the row
                  titles. This one surface gets a dark backing under its glass. */}
              <View style={styles.historyBacking} pointerEvents="none" />
              <Text style={styles.historyHeader}>{vi ? 'Trò chuyện cũ' : 'Past chats'}</Text>
              <ScrollView style={styles.historyScroll} keyboardShouldPersistTaps="handled">
                {conversations && conversations.length > 0 ? (
                  conversations.map((c) => (
                    <Pressable
                      key={c.id}
                      style={({ pressed }) => [
                        styles.historyRow,
                        conversationId === c.id && styles.historyRowActive,
                        pressed && { opacity: 0.7 },
                      ]}
                      onPress={() => {
                        setShowHistory(false);
                        loadConversation(c.id);
                      }}>
                      <Text style={styles.historyTitle} numberOfLines={1}>{c.title ?? '—'}</Text>
                      <Text style={styles.historyDate}>
                        {new Date(c.updated_at).toLocaleDateString(vi ? 'vi-VN' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={vi ? 'Xoá' : 'Delete'}
                        // 28pt drawn; 8 of slop reaches the 44pt HIG floor
                        hitSlop={8}
                        style={({ pressed }) => [styles.historyDelete, pressed && { opacity: 0.6 }]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          deleteConvo.mutate(c.id);
                        }}>
                        {/* Neutral in the list. The glyph's own tint is red —
                            deleting is the one irreversible thing here — but a
                            column of red bins pulls harder than the titles it
                            belongs to. */}
                        <Glyph name="trash" size={14} colour={colors.glassMuted} />
                      </Pressable>
                    </Pressable>
                  ))
                ) : (
                  <Text style={styles.historyEmpty}>
                    {vi ? 'Chưa có cuộc trò chuyện nào' : 'No conversations yet'}
                  </Text>
                )}
              </ScrollView>
            </LiquidGlass>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  // Transparent so the aura behind it in the wrapper is not painted over.
  kav: { flex: 1, backgroundColor: 'transparent' },
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
  sectionTitle: { ...type.headline, color: colors.foreground },

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

  /* The two labelled controls above a transcript. Text rather than icons —
     see the note at the call site for what that replaced. */
  chatBar: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: glass.border,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  chatBtnText: { ...type.caption, color: colors.glassMuted },

  /* ── past chats, as a panel over the page ── */
  historyScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  historyWrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 20 },
  historyPanel: { maxHeight: 330, paddingVertical: spacing.xs },
  historyBacking: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,16,0.82)',
  },
  historyHeader: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.glassMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  historyScroll: { maxHeight: 278 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  historyRowActive: { backgroundColor: 'rgba(255,255,255,0.10)' },
  historyTitle: { ...type.footnote, color: colors.foreground, flex: 1 },
  historyDate: { ...type.caption, color: colors.glassMuted },
  historyDelete: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyEmpty: {
    ...type.footnote,
    color: colors.glassMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  /* ── the transcript ──
     The coach speaks on glass; you speak on solid brand silver. A conversation
     has to be scannable at a glance — whose turn is whose, without reading —
     and on a screen where everything is translucent, two glass bubbles would
     leave only the alignment to tell them apart. */
  transcript: { gap: spacing.sm + 4 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  msgRowUser: { justifyContent: 'flex-end' },
  avatarAI: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    backgroundColor: 'rgba(180,92,255,0.16)',
  },
  avatarUser: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  bubble: { maxWidth: '78%' },
  bubbleInner: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bubbleUser: { backgroundColor: colors.primary, borderRadius: radius.lg },
  bubbleUserText: { ...type.body, color: colors.primaryForeground },

  /* A flex child at the bottom rather than `position: absolute`.

     Absolute is what it was, and absolute does not move for a keyboard: the
     `KeyboardAvoidingView` pads the container, and a child positioned against
     that container's bottom edge stays exactly where it was — under the
     keyboard, with the field you are typing into invisible. */
  askWrap: { paddingHorizontal: spacing.md, gap: 6 },
  disclaimer: {
    fontSize: 9,
    lineHeight: 12,
    color: colors.glassMuted,
    opacity: 0.72,
    flexShrink: 1,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
  },
  askInput: {
    flex: 1,
    maxHeight: 110,
    color: colors.foreground,
    fontSize: 16,
    /* Zero on iOS or the text sits high in its own line box; the row's
       `alignItems: center` does the vertical centring. */
    paddingVertical: 0,
  },
  sendDisabled: { opacity: 0.35 },
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

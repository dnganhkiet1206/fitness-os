import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { nav } from '@/lib/nav';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressScale } from '@/components/ascnd/press-scale';
import { AssistantAura } from '@/components/ascnd/assistant-aura';
import { Glyph, GLYPH_TINT, type GlyphName } from '@/components/ascnd/assistant-icons';
import { LiquidGlass, tintBorder } from '@/components/ascnd/liquid-glass';
import { MarkdownLite } from '@/components/ascnd/markdown-lite';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import { toast } from '@/lib/toast';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAssistantSignal } from '@/hooks/use-assistant-signal';
import { useAuth } from '@/hooks/use-auth';
import { useCoachChat } from '@/hooks/use-coach-chat';
import { supabase } from '@/integrations/supabase/client';
import { confirmWrite } from '@/lib/write-result';
import { suggestionsFor } from '@/lib/assistant-suggestions';

/**
 * AI Coach — the conversation, on a screen that is only the conversation.
 *
 * ── this page came back on purpose ──
 *
 * The chat briefly lived inside the Health Assistant: its ask bar took text and
 * the transcript replaced the landing content. That worked and it was confusing
 * for a reason that had nothing to do with the code — one screen was trying to
 * be a dashboard and a chat at the same time, so its header, its scroll and its
 * whole identity changed under you as you typed.
 *
 * They are two jobs. The assistant is where you *look* at today; this is where
 * you *talk* about it. The assistant now carries a coach card instead of an
 * input — a bridge rather than a second half.
 *
 * What did not come back is the duplication. The conversation still lives in
 * `use-coach-chat` above the router, and this is the only screen that draws it:
 * the earlier mess was two screens showing one chat, and `tools/coach-chat.mjs`
 * is what keeps that from happening again.
 *
 * ── the room is the assistant's ──
 *
 * Same aura, same glass, same hand-drawn glyphs, and the aura takes today's
 * readiness so the light matches the page you came from. Arriving here should
 * feel like walking into the next room, not opening a different app.
 *
 * ── the openers are the card's chips ──
 *
 * An empty chat offers the same four questions the coach card offers, from the
 * same `useAssistantSignal`. Tapping "Tôi ngủ chưa đủ" on the card and finding
 * a different set of suggestions here would be the bridge visibly failing to
 * connect.
 */

/** The colour a glyph lights its panel with — the saturated half of its gradient. */
const litBy = (g: GlyphName) => GLYPH_TINT[g][1];

export default function AiCoachScreen() {
  const c = usePalette();
  const styles = stylesFor(c);
  const insets = useSafeAreaInsets();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { session } = useAuth();
  const queryClient = useQueryClient();

  /* The conversation is not this screen's — it lives above the router so it
     survives this screen being pushed and popped. What stays here is the
     draft, the scroll position and the focus. */
  const { messages, isLoading, conversationId, send, newChat, loadConversation, onGrow } = useCoachChat();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };
  // the answer arrives a token at a time, and the transcript follows it down
  useEffect(() => onGrow(scrollToEnd), [onGrow]);

  const signal = useAssistantSignal();
  const suggestions = suggestionsFor(signal);

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
      await confirmWrite(
        supabase.from('ai_conversations').delete().eq('id', id),
        'Không xoá được cuộc trò chuyện này',
      );
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
      // deleting the chat you are reading leaves the screen showing a
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

  /*
    ── arriving with a question already asked ──

    The coach card's chips carry their question in `q` and it is sent on
    arrival. One-shot: `sentRef` outlives every re-render, so a keyboard resize
    or a language change cannot re-send.

    Gated on `session` because the request needs the access token — without the
    guard, a cold start deep into this route fires before auth has resolved and
    the coach answers its own greeting with a 401. The effect simply waits.

    `send` is deliberately not in the dependency list. The ref is what makes
    this fire once; the deps are honest about what gates the first fire.

    ── and the keyboard does not come up by itself ──

    Tapping the card used to arrive with `ask=1` and focus the field, on the
    reasoning that a door should not need a second tap. On a device it was the
    wrong call twice over: the keyboard covered the four suggested questions,
    which are the *shorter* path than typing, and it animated up while the push
    was still animating in — two things moving at once on arrival, which reads
    as the screen being unsettled rather than eager.

    So arrival is still. The field is one tap away for anyone who wants to type
    something the chips do not cover.
  */
  const { q } = useLocalSearchParams<{ q?: string }>();
  const sentRef = useRef(false);

  useEffect(() => {
    if (sentRef.current || !session) return;
    if (typeof q === 'string' && q.trim()) {
      sentRef.current = true;
      send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, session]);

  const chatting = messages.length > 0;

  return (
    <View style={styles.root}>
      <AssistantAura state={signal.status} />

      {/*
        The composer rises with the keyboard; the aura does not.

        `AssistantAura` is a sibling of this view rather than a child, so the
        light keeps the whole screen while the page above it shrinks. A room
        does not get shorter when a keyboard opens.
      */}
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/*
          A chat header, and only that.

          Back on the left where every iOS user reaches for it, the name in the
          middle, history on the right. No home button and no marketing
          subtitle: this screen has one job, and the way out is the way you came
          in.
        */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yBack}
            hitSlop={10}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              nav.back();
            }}
            style={styles.headerBtn}>
            <Glyph name="chevron" size={17} />
          </PressScale>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{i18n.aiCoachTitle}</Text>
            <View style={styles.aiBadge}>
              <Glyph name="spark" size={10} />
              <Text style={styles.aiText}>AI</Text>
            </View>
          </View>
          {/* Two controls would need labels to tell apart — see the note this
              replaced on the assistant. One does not: a clock beside a title
              is unambiguous, and "new chat" belongs with the empty state it
              produces, so it sits in the transcript instead. */}
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yHistory}
            hitSlop={10}
            onPress={() => {
              Haptics.selectionAsync();
              setShowHistory((v) => !v);
            }}
            style={styles.headerBtn}>
            <Glyph name="clock" size={18} />
          </PressScale>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.list}
          /* Empty fills and centres; a transcript starts at the top. Rendered
             as-is, the greeting pinned under the header with the whole screen
             empty below it and the composer stranded at the far bottom — two
             things at opposite ends of a void. Once there are messages the
             growth is dropped, or a transcript would creep down as it grew. */
          contentContainerStyle={[styles.listContent, !chatting && styles.listContentEmpty]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {!chatting ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{i18n.aiCoachHello}</Text>
              <Text style={styles.emptyHint}>{i18n.aiCoachIntro}</Text>
              {/* The same four the coach card offers, from the same signal. */}
              <View style={styles.prompts}>
                {suggestions.map((s) => (
                  <PressScale
                    key={s.key}
                    accessibilityRole="button"
                    accessibilityLabel={vi ? s.question.vi : s.question.en}
                    onPress={() => submit(vi ? s.question.vi : s.question.en)}>
                    <LiquidGlass
                      /* Chip gợi ý là một LỐI ĐI, không phải một giá trị —
                         xem luật màu ở `index.tsx`, hàng quick-log. Màu ở lại
                         trong glyph, nơi nó phân biệt các câu hỏi. */
                      style={styles.promptChip}
                      radius={radius.full}
                      tint={c.primary} material="blur">
                      <View style={styles.promptInner}>
                        <Glyph name={s.glyph} size={15} />
                        <Text style={styles.promptText}>{vi ? s.label.vi : s.label.en}</Text>
                      </View>
                    </LiquidGlass>
                  </PressScale>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.transcript}>
              {/* "New chat" lives with the transcript it clears, and carries a
                  word. It was a bare `+` in a row of identical grey discs. */}
              <View style={styles.chatBar}>
                <PressScale
                  accessibilityRole="button"
                  onPress={newChat}
                  style={styles.chatBtn}>
                  <Glyph name="plus" size={13} colour={c.glassMuted} />
                  <Text style={styles.chatBtnText}>{vi ? 'Trò chuyện mới' : 'New chat'}</Text>
                </PressScale>
              </View>
              {/*
                ── two voices, two materials ──

                The coach speaks on glass; you speak on solid brand silver. A
                conversation has to be scannable at a glance — whose turn is
                whose, without reading a word — and on a screen where everything
                is translucent, two glass bubbles would leave only the alignment
                to tell them apart.

                The answer text is `foreground` throughout, which is why glass is
                allowed here at all: 8.4:1 at the aura's brightest. `mutedColor`
                pulls the list markers up to the same measured grey the captions
                use; at `mutedForeground` they sat at 2.57:1.
              */}
              {messages.map((m, i) => (
                <View key={i} style={[styles.msgRow, m.role === 'user' && styles.msgRowUser]}>
                  {m.role === 'assistant' ? (
                    <View style={styles.avatarAI}>
                      <Glyph name="spark" size={14} />
                    </View>
                  ) : null}
                  {m.role === 'assistant' ? (
                    <LiquidGlass
                      /* Bong bóng trả lời không phải một chỉ số. Tô tím mọi
                         câu trả lời trong một cuộc trò chuyện dài là rất nhiều
                         tím cho một thông tin đã có avatar nói rồi. */
                      style={styles.bubble}
                      tint={c.primary}
                      radius={radius.lg}>
                      <View style={styles.bubbleInner}>
                        <MarkdownLite text={m.content} mutedColor={c.glassMuted} />
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
                    /* Cùng luật với bong bóng ở trên. */
                    style={styles.bubble}
                    tint={c.primary}
                    radius={radius.lg}>
                    <View style={styles.bubbleInner}>
                      <ActivityIndicator size="small" color={c.glassMuted} />
                    </View>
                  </LiquidGlass>
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>

        {/*
          The composer: the same glass pill the assistant's coach card is shaped
          after, so pressing the card and arriving here reads as one movement.

          No top hairline and no page-coloured fill. Both existed to separate a
          composer from a list on an opaque page; over an aura they draw a
          straight seam across the room and paint out the light beneath.
        */}
        <View style={[styles.composerWrap, { paddingBottom: insets.bottom + spacing.sm }]}>
          <LiquidGlass style={styles.composer} radius={radius.full} intensity={30} material="blur">
            <View style={styles.composerInner}>
              <View style={styles.composerSpark}>
                <Glyph name="spark" size={16} />
              </View>
              <TextInput
                style={styles.composerInput}
                placeholder={i18n.aiCoachPlaceholder}
                placeholderTextColor={c.glassMuted}
                value={input}
                onChangeText={setInput}
                multiline
                onSubmitEditing={() => submit()}
              />
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.a11ySend}
                /* 34pt drawn so the pill keeps its proportions; 5 of slop
                   reaches the 44pt HIG floor. `tools/tap-targets.mjs` caught
                   the version without it. */
                hitSlop={5}
                disabled={!input.trim() || isLoading}
                onPress={() => submit()}
                style={[styles.sendBtn, (!input.trim() || isLoading) && styles.sendDisabled]}>
                <Glyph name="arrow" size={17} colour={c.primaryForeground} />
              </PressScale>
            </View>
          </LiquidGlass>
          {/* The one sentence on this screen that is here for a reason outside
              the product. It is attached to the composer by meaning rather than
              layout, which is how it got left behind once already. */}
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

      {/* Past conversations, laid over the page. A list you pick from and
          dismiss is a panel, not a route. */}
      {showHistory ? (
        <>
          {/* Tapping off it closes it — a menu whose only exit is the control
              that opened it is a trap. */}
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
              <Text style={styles.historyHeader}>{i18n.aiCoachHistory}</Text>
              <ScrollView style={styles.historyScroll} keyboardShouldPersistTaps="handled">
                {conversations && conversations.length > 0 ? (
                  conversations.map((convo) => (
                    <PressScale
                      key={convo.id}
                      style={[styles.historyRow, conversationId === convo.id && styles.historyRowActive]}
                      onPress={() => {
                        setShowHistory(false);
                        loadConversation(convo.id);
                      }}>
                      <Text style={styles.historyTitle} numberOfLines={1}>{convo.title ?? '—'}</Text>
                      <Text style={styles.historyDate}>
                        {new Date(convo.updated_at).toLocaleDateString(vi ? 'vi-VN' : 'en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                      <PressScale
                        accessibilityRole="button"
                        accessibilityLabel={i18n.a11yDelete}
                        // 28pt drawn; 8 of slop reaches the 44pt HIG floor
                        hitSlop={8}
                        style={styles.historyDelete}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          /* Same reason as `coach-memory.tsx`: the delete can
                             now report that it touched nothing, and a report
                             nobody receives is the row silently reappearing. */
                          deleteConvo.mutate(convo.id, {
                            onError: (e: Error) => toast.fail(e),
                          });
                        }}>
                        {/* Neutral in the list. The glyph's own tint is red —
                            deleting is the one irreversible thing here — but a
                            column of red bins pulls harder than the titles. */}
                        <Glyph name="trash" size={14} colour={c.glassMuted} />
                      </PressScale>
                    </PressScale>
                  ))
                ) : (
                  <Text style={styles.historyEmpty}>{i18n.aiCoachNoHistory}</Text>
                )}
              </ScrollView>
            </LiquidGlass>
          </View>
        </>
      ) : null}
    </View>
  );
}

const stylesFor = makeStyles((c, m) => ({
  root: { flex: 1, backgroundColor: c.background },
  // Transparent so the aura behind it in the wrapper is not painted over.
  kav: { flex: 1, backgroundColor: 'transparent' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.secondary,
  },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { ...type.headline, color: c.foreground },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.full,
    backgroundColor: 'rgba(180,92,255,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180,92,255,0.35)',
  },
  aiText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: c.metricPurple },

  list: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm + 4 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.xl },
  emptyTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.7, color: c.foreground, textAlign: 'center' },
  emptyHint: { ...type.body, color: c.glassMuted, textAlign: 'center', lineHeight: 21, maxWidth: 310 },
  prompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  promptChip: { alignSelf: 'flex-start' },
  promptInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: spacing.md - 2,
    paddingVertical: spacing.sm + 2,
  },
  promptText: { ...type.footnote, color: c.foreground },

  transcript: { gap: spacing.sm + 4 },
  chatBar: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.xs },
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: alpha(m.ink, 0.12),
    backgroundColor: alpha(m.ink, 0.05),
  },
  chatBtnText: { ...type.caption, color: c.glassMuted },
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
    backgroundColor: alpha(m.ink, 0.08),
  },
  bubble: { maxWidth: '78%' },
  bubbleInner: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  bubbleUser: { backgroundColor: c.primary, borderRadius: radius.lg },
  bubbleUserText: { ...type.body, color: c.primaryForeground },

  composerWrap: { paddingHorizontal: spacing.md, gap: 6 },
  composer: {},
  composerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  composerSpark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180,92,255,0.16)',
  },
  /* No box of its own: the glass pill *is* the field. A bordered input inside a
     bordered pill is two controls drawn on top of each other. `maxHeight` still
     holds, so a long question grows the pill and then scrolls inside it. */
  composerInput: {
    flex: 1,
    maxHeight: 110,
    color: c.foreground,
    fontSize: 16,
    /* Zero on iOS or the text sits high in its own line box; the row's
       `alignItems: center` does the vertical centring. */
    paddingVertical: 0,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
  /*
    `lineHeight` was 12, which was a comfortable 1.33× when this text was 9pt
    and became 1.09× when it was raised to Apple's 11pt floor — close enough for
    two lines of the disclaimer to touch. The `opacity` stays: this line sits on
    the bare aura rather than on glass, where `glassMuted` at 0.72 still measures
    6.19:1, and a disclaimer is meant to be quieter than what it sits under.
  */
  disclaimer: { fontSize: 11, lineHeight: 15, color: c.glassMuted, opacity: 0.72, flexShrink: 1 },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
  },

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
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: c.glassMuted,
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
  historyRowActive: { backgroundColor: alpha(m.ink, 0.10) },
  historyTitle: { ...type.footnote, color: c.foreground, flex: 1 },
  historyDate: { ...type.caption, color: c.glassMuted },
  historyDelete: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  historyEmpty: {
    ...type.footnote,
    color: c.glassMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

}));

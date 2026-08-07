import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { AssistantAura } from '@/components/ascnd/assistant-aura';
import { Glyph, GLYPH_TINT, type GlyphName } from '@/components/ascnd/assistant-icons';
import { LiquidGlass, tintBorder } from '@/components/ascnd/liquid-glass';
import { MarkdownLite } from '@/components/ascnd/markdown-lite';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { useDailyLog } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import { EDGE_FUNCTIONS, functionUrl, SUPABASE_ANON_KEY } from '@/lib/backend';
import { AI_FAILURE_KEY, classify } from '@/lib/edge-failure';

/** The colour a glyph lights its panel with — the saturated half of its gradient. */
const litBy = (g: GlyphName) => GLYPH_TINT[g][1];

/** The four openers, each with the glyph the assistant's chips already use. */
const PROMPT_GLYPHS: GlyphName[] = ['moon', 'leaf', 'bolt', 'pulse'];

/**
 * The coach streams, so it cannot go through `supabase.functions.invoke` and
 * builds its own request. Both halves of that request now come from
 * `@/lib/backend` instead of being written out here.
 *
 * The key mattered more than the URL. It read
 * `process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ''` — an **empty string** whenever
 * no `.env` was present, while the Supabase client next to it had a working
 * fallback. So on a fresh clone every other feature worked and the coach alone
 * answered 401, which reads as "the coach is broken" rather than "the key is
 * missing". One source for both, and that cannot happen again.
 */
const CHAT_URL = functionUrl(EDGE_FUNCTIONS.coach);
const ANON_KEY = SUPABASE_ANON_KEY;

/**
 * How many turns travel with each request.
 *
 * Every message costs on every turn it is present for, so sending the whole
 * conversation each time makes one long chat cost the square of its length.
 * Twenty turns is more context than a coaching question needs, and it is the
 * same ceiling the edge function enforces — this only saves the upload.
 */
const SEND_WINDOW = 20;

/** How much of a stored conversation is reloaded when it is opened. */
const HISTORY_LIMIT = 60;

interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

export default function AiCoachScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const convoIdRef = useRef<string | null>(null);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const queryClient = useQueryClient();
  /* The aura's colour, so this screen is lit the same as the one that opened
     it. React Query already has this cached from the assistant — the push
     costs a read, not a request. */
  const { data: dailyLog } = useDailyLog();
  const status = (dailyLog?.readiness_status as 'green' | 'yellow' | 'red' | null) ?? null;

  const QUICK_PROMPTS = [i18n.aiCoachPrompt1, i18n.aiCoachPrompt2, i18n.aiCoachPrompt3, i18n.aiCoachPrompt4];

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
      if (convoIdRef.current === id) {
        convoIdRef.current = null;
        setMessages([]);
      }
    },
  });

  const loadConversation = async (id: string) => {
    Haptics.selectionAsync();
    setShowHistory(false);
    // Newest first with a limit, then reversed — an old conversation could
    // otherwise be reloaded whole, and every message of it would ride along
    // on the next request.
    const { data } = await supabase
      .from('ai_messages')
      .select('role, content')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT);
    convoIdRef.current = id;
    setMessages(
      (data ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    );
    scrollToEnd();
  };

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const saveMessage = async (conversationId: string, role: string, content: string) => {
    await supabase.from('ai_messages').insert({ conversation_id: conversationId, role, content });
  };

  const send = async (prompt?: string) => {
    const text = (prompt ?? input).trim();
    if (!text || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const userMsg: Msg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    scrollToEnd();

    try {
      // Persist conversation + user message (same tables as the web app)
      if (!convoIdRef.current && session?.user.id) {
        const { data } = await supabase
          .from('ai_conversations')
          .insert({ user_id: session.user.id, title: text.slice(0, 50) })
          .select('id')
          .single();
        convoIdRef.current = data?.id ?? null;
      }
      if (convoIdRef.current) await saveMessage(convoIdRef.current, 'user', text);

      let assistantSoFar = '';
      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
        scrollToEnd();
      };

      // expo/fetch supports streaming response bodies (RN's built-in fetch doesn't)
      const resp = await expoFetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: ANON_KEY,
        },
        body: JSON.stringify({ messages: newMessages.slice(-SEND_WINDOW), lang }),
      });

      if (!resp.ok || !resp.body) {
        /*
          Named the same way the other four AI screens name it.

          This one streams, so it cannot go through `callEdge` — and it had
          grown its own error path as a result: read `error` out of the body and
          show that string. Two things were wrong with it. The server's own
          quota message is written in Vietnamese, so an English user was shown
          Vietnamese; and a 404 or a bare gateway failure has no `error` field
          at all, so what surfaced was `Error 404`.

          `classify` only needs a status, and `statusOf` reads a plain `.status`
          — so the status goes through exactly the classifier the other screens
          use, and the message comes from the same table. The raw body is still
          worth having, so it goes to the console rather than to the person.
        */
        const raw = await resp.text().catch(() => '');
        if (raw) console.warn(`ai-coach ${resp.status}: ${raw.slice(0, 300)}`);
        throw new Error(i18n[AI_FAILURE_KEY[classify({ status: resp.status })]]);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // OpenAI-style SSE: lines of `data: {json}` with choices[0].delta.content
      streaming: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break streaming;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }

      if (assistantSoFar && convoIdRef.current) {
        await saveMessage(convoIdRef.current, 'assistant', assistantSoFar);
        await supabase
          .from('ai_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', convoIdRef.current);
      }
    } catch (e) {
      // A throw from `fetch` never reached the server; the classifier says so
      // in the user's language rather than leaving a bare English fallback.
      Alert.alert(
        'AI Coach',
        e instanceof Error ? e.message : i18n[AI_FAILURE_KEY[classify(e)]],
      );
    } finally {
      setIsLoading(false);
    }
  };

  const newChat = () => {
    Haptics.selectionAsync();
    convoIdRef.current = null;
    setMessages([]);
  };

  return (
    /*
      ── the same room as the Health Assistant, because it is the same room ──

      This screen is what the assistant's ask bar opens. It used to be a
      different place entirely — `AmbientLight` on `colors.background`, a
      hairline header, opaque bubbles — so pressing "ask me anything" took you
      out of the glass page and into an ordinary one, and the two read as
      unrelated features that happened to both mention AI.

      Now it takes the assistant's aura and its material. The strongest piece
      of that is not the blur: it is that **the ask bar becomes the composer**.
      Same glass pill, same 34pt spark on the left, same 34pt send circle on the
      right, in the same place on screen. Pressing the door and arriving at the
      thing behind it, with the door still under your thumb.

      The aura takes today's readiness like the assistant's does, so the room is
      lit the same colour on both sides of the push.

      ── what stays opaque, and why it is measured ──

      Near-white text on `LiquidGlass` over this aura measures 8.4:1 at the
      brightest spot the pools can make — comfortably AA, so the coach's
      answers can sit on glass. `mutedForeground` on the same surface measures
      **2.57:1**, which is why every caption here uses `colors.glassMuted`
      instead; that constant carries the measurement and the reasoning.

      The light is a sibling of the keyboard-avoiding view, not inside it, so it
      keeps the whole screen while the chat shrinks. A room does not get shorter
      when a keyboard opens.
    */
    <View style={styles.root}>
      <AssistantAura state={status} />
      <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/*
        No hairline under it. The rule was doing the job of separating a header
        from content, and over an aura a full-width 1pt line is the one straight
        edge in a screen that has none — it reads as a seam. The glass buttons
        and the title's own weight carry the header now.
      */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={i18n.a11yBack}
          hitSlop={10}
          style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}>
          <Glyph name="chevron" size={17} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>{i18n.aiCoachTitle}</Text>
          {/* The same mark the assistant wears, so the two are one product. */}
          <View style={styles.aiBadge}>
            <Glyph name="spark" size={10} />
            <Text style={styles.aiText}>AI</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yHistory}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            onPress={() => { Haptics.selectionAsync(); setShowHistory((v) => !v); }}>
            <Glyph name="clock" size={18} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11yNewChat}
            hitSlop={10}
            style={({ pressed }) => [styles.headerBtn, pressed && styles.pressed]}
            onPress={newChat}>
            <Glyph name="plus" size={17} />
          </Pressable>
        </View>
      </View>

      {/*
        History, as a panel that floats rather than a band that pushes.

        It was a full-bleed strip on `colors.card` that shoved the conversation
        down when it opened. On glass it is a sheet laid over the chat instead —
        which is what it is: a temporary thing you pick from and dismiss, not a
        new section of the page.
      */}
      {showHistory && (
        /*
          Pinned under the header, measured rather than guessed: the safe-area
          inset, the header's own top padding, the 40pt button row, and the gap
          below it. A literal 96 was right on one phone — the inset is 59 on a
          Dynamic Island device and 47 on the rest, so a constant puts the panel
          through the buttons on half the fleet.
        */
        <View style={[styles.historyWrap, { top: insets.top + spacing.sm + 40 + spacing.sm }]}>
          <LiquidGlass style={styles.historyPanel} radius={radius.lg} intensity={34}>
            {/*
              A menu has to be readable, and glass alone is not. The render
              showed the conversation's own text coming through the panel and
              colliding with the row titles — the blur softens what is behind it
              but does not hide it, and a list of names over a list of sentences
              is neither. So this one surface gets a dark backing under its
              glass: still the same material, no longer transparent to the thing
              it is covering.
            */}
            <View style={styles.historyBacking} pointerEvents="none" />
            <Text style={styles.historyHeader}>{i18n.aiCoachHistory}</Text>
            <ScrollView style={styles.historyScroll} keyboardShouldPersistTaps="handled">
              {conversations && conversations.length > 0 ? (
                conversations.map((c) => (
                  <Pressable
                    key={c.id}
                    style={({ pressed }) => [
                      styles.historyRow,
                      convoIdRef.current === c.id && styles.historyRowActive,
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => loadConversation(c.id)}>
                    <Text style={styles.historyTitle} numberOfLines={1}>{c.title ?? '—'}</Text>
                    <Text style={styles.historyDate}>
                      {new Date(c.updated_at).toLocaleDateString(vi ? 'vi-VN' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={i18n.a11yDelete}
                      // 28pt drawn; 8 of slop reaches the 44pt HIG floor
                      hitSlop={8}
                      style={({ pressed }) => [styles.historyDelete, pressed && { opacity: 0.6 }]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        deleteConvo.mutate(c.id);
                      }}>
                      {/*
                        Neutral in the list, not red.

                        The glyph's own tint is red — deleting a conversation is
                        the one irreversible thing on this screen. But three
                        rows of red bins pulled the eye harder than the titles
                        they belonged to, which is a list that alarms you about
                        its own delete buttons. Red is right on the action, not
                        on the row it sits in.
                      */}
                      <Glyph name="trash" size={14} colour={colors.glassMuted} />
                    </Pressable>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.historyEmpty}>{i18n.aiCoachNoHistory}</Text>
              )}
            </ScrollView>
          </LiquidGlass>
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        /*
          The empty state fills and centres; a transcript starts at the top.

          Rendered as-is it pinned the greeting under the header with the whole
          screen empty below it and the composer stranded at the far bottom —
          two things at opposite ends of a void. Centred, the greeting, its
          chips and the ask bar read as one column. Once there are messages the
          growth is dropped, because a transcript that centres itself would
          creep down the screen as it got longer.
        */
        contentContainerStyle={[styles.listContent, messages.length === 0 && styles.listContentEmpty]}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 && (
          /*
            The empty state is the assistant's stage, one screen along: a big
            greeting in the lit part of the aura, then the openers as glass
            chips — the same shape as the suggestion chips you may have just
            pressed to get here.

            No 64pt robot in a rounded square. It was the only illustration in
            the app and it said nothing the sentence under it did not.
          */
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{i18n.aiCoachHello}</Text>
            <Text style={styles.emptyHint}>{i18n.aiCoachIntro}</Text>
            <View style={styles.prompts}>
              {QUICK_PROMPTS.map((p, i) => {
                const g = PROMPT_GLYPHS[i % PROMPT_GLYPHS.length];
                return (
                  <Pressable
                    key={p}
                    accessibilityRole="button"
                    style={({ pressed }) => pressed && styles.pressed}
                    onPress={() => {
                      Haptics.selectionAsync();
                      send(p);
                    }}>
                    <LiquidGlass
                      style={[styles.promptChip, tintBorder(litBy(g))]}
                      radius={radius.full}
                      tint={litBy(g)}>
                      <View style={styles.promptInner}>
                        <Glyph name={g} size={15} />
                        <Text style={styles.promptText}>{p}</Text>
                      </View>
                    </LiquidGlass>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        {/*
          ── two voices, two materials ──

          The coach speaks on glass; you speak on the solid brand silver.

          That asymmetry is the point. A conversation has to be scannable at a
          glance — whose turn is whose, without reading a word — and on a screen
          where everything is translucent, making both bubbles glass would leave
          only the alignment to tell them apart. The assistant is the one whose
          answers are long, so it gets the material that belongs to the room;
          your own lines are short, and a solid capsule is what they already
          were.

          The answer text is `foreground` throughout (`MarkdownLite` sets it),
          which is the reason glass is allowed here at all: 8.4:1 at the aura's
          brightest. The `mutedFg` prop pulls the bullet markers up to the same
          measured grey the captions use — at `mutedForeground` they sat at
          2.57:1 and would have been the one thing in a list you could not see.
        */}
        {messages.map((m, i) => (
          <View key={i} style={[styles.msgRow, m.role === 'user' && styles.msgRowUser]}>
            {m.role === 'assistant' && (
              <View style={styles.avatarAI}>
                <Glyph name="spark" size={14} />
              </View>
            )}
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
            {m.role === 'user' && (
              <View style={styles.avatarUser}>
                <Glyph name="user" size={14} />
              </View>
            )}
          </View>
        ))}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
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
        )}
      </ScrollView>

      {/*
        ── the ask bar, arrived ──

        This is deliberately the same object as `assistant.tsx`'s ask bar: glass
        pill at `radius.full`, a 34pt spark circle at the left, a 34pt primary
        circle at the right, the same paddings, the same distance off the
        bottom. There the middle is a label and the whole pill is a button;
        here the middle is the input and only the right-hand circle is. Press
        the door, and the door is what you land on.

        It also lost its top hairline and its `colors.background` fill. Both
        existed to separate a composer from a list on an opaque page; over an
        aura they drew a straight seam across the room and painted out the
        light beneath the pill.
      */}
      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + spacing.sm }]}>
        <LiquidGlass style={styles.composer} radius={radius.full} intensity={30}>
          <View style={styles.composerInner}>
            <View style={styles.composerSpark}>
              <Glyph name="spark" size={16} />
            </View>
            <TextInput
              style={styles.composerInput}
              placeholder={i18n.aiCoachPlaceholder}
              placeholderTextColor={colors.glassMuted}
              value={input}
              onChangeText={setInput}
              multiline
              onSubmitEditing={() => send()}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.a11ySend}
              /*
                34pt drawn so it matches the assistant's ask bar exactly; 5 of
                slop reaches the 44pt HIG floor.

                On the ask bar the 34pt circle is decoration — the whole pill is
                one button. Here the circle *is* the target, and copying the
                measurement without the slop is how a shape that was fine
                becomes a control you miss. `tools/tap-targets.mjs` caught it.
              */
              hitSlop={5}
              style={({ pressed }) => [
                styles.sendBtn,
                (!input.trim() || isLoading) && styles.sendDisabled,
                pressed && styles.pressed,
              ]}
              disabled={!input.trim() || isLoading}
              onPress={() => send()}>
              <Glyph name="arrow" size={17} colour={colors.primaryForeground} />
            </Pressable>
          </View>
        </LiquidGlass>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
  /* Round, 40pt, filled with `secondary` — the same button the assistant's
     header wears, one size down because there are three of them here. */
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
  },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { ...type.headline, color: colors.foreground },
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
  aiText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: colors.metricPurple },
  headerRight: { flexDirection: 'row', gap: spacing.sm },

  /* Laid over the chat rather than pushing it: absolute, under the header,
     above everything the list draws. */
  historyWrap: { position: 'absolute', left: spacing.md, right: spacing.md, zIndex: 20 },
  historyPanel: { maxHeight: 330, paddingVertical: spacing.xs },
  /* Under the glass, over the room — see the note at the call site. */
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
  historyDelete: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEmpty: {
    ...type.footnote,
    color: colors.glassMuted,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },

  list: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm + 4 },
  listContentEmpty: { flexGrow: 1, justifyContent: 'center' },
  /* The greeting is the hero here as it is on the assistant's stage, and for
     the same reason: it sits in the brightest part of the aura and there is
     nothing else competing for that spot. */
  empty: { alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingBottom: spacing.xl },
  emptyTitle: { fontSize: 30, fontWeight: '700', letterSpacing: -0.7, color: colors.foreground, textAlign: 'center' },
  emptyHint: { ...type.body, color: colors.glassMuted, textAlign: 'center', lineHeight: 21, maxWidth: 310 },
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
  promptText: { ...type.footnote, color: colors.foreground },

  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  msgRowUser: { justifyContent: 'flex-end' },
  /* Circles, not rounded squares — the assistant's icon wells are all round,
     and 28pt of tinted disc beside a bubble reads as a speaker. */
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

  /* No hairline, no fill — see the note at the call site. */
  composerWrap: { paddingHorizontal: spacing.md, gap: 6 },
  composer: {},
  /* Deliberately identical to `assistant.tsx`'s `askInner`. */
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
  /* No box of its own: the glass pill *is* the field. A bordered input inside
     a bordered pill is two controls drawn on top of each other.

     `maxHeight` still holds, so a long question grows the pill to five lines
     and then scrolls inside it. */
  composerInput: {
    flex: 1,
    maxHeight: 110,
    color: colors.foreground,
    fontSize: 16,
    /* Zero on iOS or the text sits high in its own line box; the row's
       `alignItems: center` does the vertical centring. */
    paddingVertical: 0,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
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
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});

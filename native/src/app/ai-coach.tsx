import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { fetch as expoFetch } from 'expo/fetch';
import { router } from 'expo-router';
import {
  ArrowUp,
  Bot,
  ChevronLeft,
  History,
  MessageSquare,
  Plus,
  Trash2,
  TriangleAlert,
  User,
} from 'lucide-react-native';
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

import { AmbientLight } from '@/components/ascnd/ambient-light';
import { Icon } from '@/components/ascnd/icon';
import { MarkdownLite } from '@/components/ascnd/markdown-lite';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { EDGE_FUNCTIONS, functionUrl, SUPABASE_ANON_KEY } from '@/lib/backend';
import { AI_FAILURE_KEY, classify } from '@/lib/edge-failure';

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
  const queryClient = useQueryClient();

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
      The other full page with no room light. Sheets deliberately do without —
      they are `colors.card` and sit in front of the page — but this is pushed
      on the stack with `colors.background`, like every `<Screen>` page, and
      those all have it.

      The light is a sibling of the keyboard-avoiding view, not inside it, so
      it keeps the whole screen while the chat shrinks. A room does not get
      shorter when a keyboard opens.
    */
    <View style={styles.root}>
      <AmbientLight />
      <KeyboardAvoidingView
      // Transparent — the wrapper paints the page colour now, and painting it
      // again here would cover the light.
      style={styles.kav}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yBack} hitSlop={8} style={styles.headerBtn} onPress={() => router.back()}>
          <Icon icon={ChevronLeft} size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>{i18n.aiCoachTitle}</Text>
        <View style={styles.headerRight}>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yHistory} hitSlop={8} style={styles.headerBtn} onPress={() => { Haptics.selectionAsync(); setShowHistory((v) => !v); }}>
            <Icon icon={History} size={19} color={colors.foreground} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yNewChat} hitSlop={8} style={styles.headerBtn} onPress={newChat}>
            <Icon icon={Plus} size={20} color={colors.foreground} />
          </Pressable>
        </View>
      </View>

      {/* History panel */}
      {showHistory && (
        <View style={styles.historyPanel}>
          <Text style={styles.historyHeader}>{i18n.aiCoachHistory}</Text>
          <ScrollView style={styles.historyScroll}>
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
                  <Icon icon={MessageSquare} size={14} color={colors.mutedForeground} />
                  <Text style={styles.historyTitle} numberOfLines={1}>{c.title ?? '—'}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(c.updated_at).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={i18n.a11yDelete}
                    // 26pt drawn; 9 of slop reaches the 44pt HIG floor
              hitSlop={9}
                    style={({ pressed }) => [styles.historyDelete, pressed && { opacity: 0.6 }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      deleteConvo.mutate(c.id);
                    }}>
                    <Icon icon={Trash2} size={13} color={colors.mutedForeground} />
                  </Pressable>
                </Pressable>
              ))
            ) : (
              <Text style={styles.historyEmpty}>{i18n.aiCoachNoHistory}</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 && (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon icon={Bot} size={32} />
            </View>
            <Text style={styles.emptyTitle}>{i18n.aiCoachHello}</Text>
            <Text style={styles.emptyHint}>{i18n.aiCoachIntro}</Text>
            <View style={styles.prompts}>
              {QUICK_PROMPTS.map((p) => (
                <Pressable
                  key={p}
                  style={({ pressed }) => [styles.promptChip, pressed && styles.pressed]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    send(p);
                  }}>
                  <Text style={styles.promptText}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={[styles.msgRow, m.role === 'user' && styles.msgRowUser]}>
            {m.role === 'assistant' && (
              <View style={[styles.avatar, styles.avatarAI]}>
                <Icon icon={Bot} size={14} />
              </View>
            )}
            <View style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
              {m.role === 'assistant' ? (
                <MarkdownLite text={m.content} />
              ) : (
                <Text style={styles.bubbleUserText}>{m.content}</Text>
              )}
            </View>
            {m.role === 'user' && (
              <View style={[styles.avatar, styles.avatarUser]}>
                <Icon icon={User} size={14} color={colors.mutedForeground} />
              </View>
            )}
          </View>
        ))}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <View style={styles.msgRow}>
            <View style={[styles.avatar, styles.avatarAI]}>
              <Icon icon={Bot} size={14} />
            </View>
            <View style={[styles.bubble, styles.bubbleAI]}>
              <ActivityIndicator size="small" color={colors.mutedForeground} />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={[styles.composerWrap, { paddingBottom: insets.bottom + spacing.xs }]}>
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder={i18n.aiCoachPlaceholder}
            placeholderTextColor={colors.mutedForeground}
            value={input}
            onChangeText={setInput}
            multiline
            onSubmitEditing={() => send()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={i18n.a11ySend}
            style={({ pressed }) => [
              styles.sendBtn,
              (!input.trim() || isLoading) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
            disabled={!input.trim() || isLoading}
            onPress={() => send()}>
            <Icon icon={ArrowUp} size={20} color={colors.primaryForeground} strokeWidth={2.5} />
          </Pressable>
        </View>
        <View style={styles.disclaimerRow}>
          <Icon icon={TriangleAlert} size={12} color={colors.readinessYellow} />
          <Text style={styles.disclaimer}>
            {lang === 'vi'
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
  // Transparent so `AmbientLight` behind it in the wrapper is not painted over.
  kav: { flex: 1, backgroundColor: 'transparent' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnText: { fontSize: 28, color: colors.primary, marginTop: -4 },
  headerBtnPlus: { fontSize: 20, color: colors.primary },
  headerTitle: { ...type.headline, color: colors.foreground },
  headerRight: { flexDirection: 'row' },
  historyPanel: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
    paddingVertical: spacing.xs,
    maxHeight: 320,
  },
  historyHeader: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.mutedForeground,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  historyScroll: { maxHeight: 272 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  historyRowActive: { backgroundColor: 'rgba(168,175,189,0.1)' },
  historyTitle: { ...type.footnote, color: colors.foreground, flex: 1 },
  historyDate: { ...type.caption, color: colors.mutedForeground },
  historyDelete: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEmpty: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  list: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm + 4 },
  empty: { alignItems: 'center', marginTop: spacing.xl * 2, gap: spacing.sm, paddingHorizontal: spacing.md },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(168,175,189,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: { ...type.title, color: colors.foreground },
  emptyHint: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center', lineHeight: 19 },
  prompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  promptChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: 'rgba(24,24,27,0.4)',
  },
  promptText: { ...type.caption, fontSize: 12, color: colors.foreground },
  msgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  msgRowUser: { justifyContent: 'flex-end' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  avatarAI: { backgroundColor: 'rgba(168,175,189,0.2)' },
  avatarUser: { backgroundColor: 'rgba(24,24,27,0.6)' },
  bubble: {
    maxWidth: '78%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
  },
  bubbleAI: {
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleUserText: { ...type.body, color: colors.primaryForeground },
  composerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    gap: 6,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.foreground,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.35 },
  disclaimer: {
    fontSize: 9,
    lineHeight: 12,
    color: 'rgba(140,140,150,0.6)',
    flexShrink: 1,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});

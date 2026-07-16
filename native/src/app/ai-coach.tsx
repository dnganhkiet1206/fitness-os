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

import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';

const CHAT_URL = 'https://drqgonxrtmomgrftelih.supabase.co/functions/v1/ai-coach';
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? '';

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
  const convoIdRef = useRef<string | null>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  };

  const saveMessage = async (conversationId: string, role: string, content: string) => {
    await supabase.from('ai_messages').insert({ conversation_id: conversationId, role, content });
  };

  const send = async () => {
    const text = input.trim();
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
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: `Error ${resp.status}` }));
        throw new Error((err as { error?: string }).error || `Error ${resp.status}`);
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
      Alert.alert('AI Coach', e instanceof Error ? e.message : 'Connection error');
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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable hitSlop={8} style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.headerBtnText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>AI Coach</Text>
        <Pressable hitSlop={8} style={styles.headerBtn} onPress={newChat}>
          <Text style={styles.headerBtnPlus}>＋</Text>
        </Pressable>
      </View>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask your coach</Text>
            <Text style={styles.emptyHint}>
              Training, nutrition, recovery — answers use your real data
            </Text>
          </View>
        )}
        {messages.map((m, i) => (
          <View
            key={i}
            style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
            <Text style={m.role === 'user' ? styles.bubbleUserText : styles.bubbleAIText}>
              {m.content}
            </Text>
          </View>
        ))}
        {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
          <View style={[styles.bubble, styles.bubbleAI]}>
            <ActivityIndicator size="small" color={colors.mutedForeground} />
          </View>
        )}
      </ScrollView>

      {/* Composer */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        <TextInput
          style={styles.composerInput}
          placeholder="Message your coach…"
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={send}
        />
        <Pressable
          style={({ pressed }) => [
            styles.sendBtn,
            (!input.trim() || isLoading) && styles.sendDisabled,
            pressed && styles.pressed,
          ]}
          disabled={!input.trim() || isLoading}
          onPress={send}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
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
  list: { flex: 1 },
  listContent: { padding: spacing.md, gap: spacing.sm },
  empty: { alignItems: 'center', marginTop: spacing.xl * 2, gap: spacing.sm },
  emptyTitle: { ...type.title, color: colors.foreground },
  emptyHint: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
  },
  bubbleAI: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  bubbleUserText: { ...type.body, color: colors.primaryForeground },
  bubbleAIText: { ...type.body, color: colors.foreground, lineHeight: 21 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
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
  sendText: { fontSize: 20, fontWeight: '700', color: colors.primaryForeground },
  pressed: { opacity: 0.85, transform: [{ scale: 0.95 }] },
});

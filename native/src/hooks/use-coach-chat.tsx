import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { fetch as expoFetch } from 'expo/fetch';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { EDGE_FUNCTIONS, functionUrl, SUPABASE_ANON_KEY } from '@/lib/backend';
import { AI_FAILURE_KEY, classify } from '@/lib/edge-failure';
import { callEdge } from '@/lib/edge';

/**
 * The coach's conversation, held above both screens that show it.
 *
 * ── why this is a provider and not a hook ──
 *
 * The chat used to live in `ai-coach.tsx` as component state, and for a while
 * after the coach moved into the Health Assistant there were two screens
 * showing it. That was the reason this became a provider: two copies of
 * `useState` are two conversations, and asking on one screen then opening the
 * other looks exactly like the app forgetting what you said.
 *
 * `/ai-coach` has since been deleted — the duplicate was itself the confusion —
 * so there is one screen again. This stays a provider anyway, for a smaller but
 * real reason: the assistant is a `NativeTabs` child, and a conversation is not
 * something to risk losing to a remount. Holding it at the root also keeps the
 * streaming request in one place rather than in a screen.
 *
 * ── what stays in the screen ──
 *
 * Everything about *looking*: scroll position, the draft in the box, whether
 * the history panel is open. This holds only the conversation.
 *
 * ── the request builds itself ──
 *
 * The coach streams, so it cannot go through `supabase.functions.invoke`. Both
 * halves of the request come from `@/lib/backend` rather than being written
 * out here — the key especially. It used to read
 * `process.env.EXPO_PUBLIC_SUPABASE_KEY ?? ''`, an **empty string** whenever no
 * `.env` was present, while the Supabase client next to it had a working
 * fallback. On a fresh clone every other feature worked and the coach alone
 * answered 401, which reads as "the coach is broken" rather than "the key is
 * missing".
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

export interface Msg {
  role: 'user' | 'assistant';
  content: string;
}

interface CoachChat {
  messages: Msg[];
  isLoading: boolean;
  /** the conversation row this chat is saved under, or null before the first send */
  conversationId: string | null;
  send: (text: string) => Promise<void>;
  newChat: () => void;
  loadConversation: (id: string) => Promise<void>;
  /** called after each state change that should scroll a transcript down */
  onGrow: (fn: () => void) => () => void;
}

const Ctx = createContext<CoachChat | null>(null);

export function CoachChatProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const convoIdRef = useRef<string | null>(null);

  /*
    Both screens want to scroll to the bottom as the answer streams in, and
    neither can be asked to poll for it. They subscribe; this calls them.

    A `Set` rather than a single callback so this does not care how many
    screens are listening — one today, and nothing here has to change if a
    second ever wants the same conversation.
  */
  const growers = useRef(new Set<() => void>());
  const onGrow = useCallback((fn: () => void) => {
    growers.current.add(fn);
    return () => growers.current.delete(fn);
  }, []);
  const grew = () => growers.current.forEach((f) => f());

  const saveMessage = async (conversationId: string, role: string, content: string) => {
    await supabase.from('ai_messages').insert({ conversation_id: conversationId, role, content });
  };

  /*
    Learn from the conversation that is ending, then clear it.

    ── why here and not after every message ──

    A chat costs one extraction regardless of how long it ran, and nothing
    durable is learned from a single line anyway. Closing a conversation is also
    the moment the person has finished saying what they came to say.

    ── why it is not awaited ──

    Starting a new chat must not wait on a model call. If the extraction fails
    the conversation is still over and the next one simply knows a little less;
    there is nothing here worth showing an error for, and a toast about
    bookkeeping in the middle of "new chat" would be noise.
  */
  const learnFrom = useCallback((convo: Msg[]) => {
    if (convo.filter((m) => m.role === 'user').length < 2) return;
    void callEdge(EDGE_FUNCTIONS.coachMemory, { messages: convo.slice(-SEND_WINDOW) });
  }, []);

  const newChat = useCallback(() => {
    Haptics.selectionAsync();
    learnFrom(messages);
    convoIdRef.current = null;
    setConversationId(null);
    setMessages([]);
  }, [messages, learnFrom]);

  const loadConversation = useCallback(async (id: string) => {
    Haptics.selectionAsync();
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
    setConversationId(id);
    setMessages(
      (data ?? [])
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    );
    grew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
    `isLoading` is read through a ref as well as state.

    The guard at the top has to see the *current* value, and `send` is
    redeclared every render — two chips pressed in the same frame both close
    over the same `false` and both fire. The ref is written before any await, so
    the second call sees it.
  */
  const loadingRef = useRef(false);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || loadingRef.current) return;
      loadingRef.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const userMsg: Msg = { role: 'user', content: text };
      let newMessages: Msg[] = [];
      setMessages((prev) => {
        newMessages = [...prev, userMsg];
        return newMessages;
      });
      setIsLoading(true);
      grew();

      try {
        // Persist conversation + user message (same tables as the web app)
        if (!convoIdRef.current && session?.user.id) {
          const { data } = await supabase
            .from('ai_conversations')
            .insert({ user_id: session.user.id, title: text.slice(0, 50) })
            .select('id')
            .single();
          convoIdRef.current = data?.id ?? null;
          setConversationId(convoIdRef.current);
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
          grew();
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
            grown its own error path as a result: read `error` out of the body
            and show that string. Two things were wrong with it. The server's
            own quota message is written in Vietnamese, so an English user was
            shown Vietnamese; and a 404 or a bare gateway failure has no `error`
            field at all, so what surfaced was `Error 404`.

            `classify` only needs a status, and `statusOf` reads a plain
            `.status` — so the status goes through exactly the classifier the
            other screens use, and the message comes from the same table. The
            raw body is still worth having, so it goes to the console rather
            than to the person.
          */
          const rawBody = await resp.text().catch(() => '');
          if (rawBody) console.warn(`ai-coach ${resp.status}: ${rawBody.slice(0, 300)}`);
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
          // the history panel lists by `updated_at`, and it just changed
          queryClient.invalidateQueries({ queryKey: ['ai_conversations'] });
        }
      } catch (e) {
        // A throw from `fetch` never reached the server; the classifier says so
        // in the user's language rather than leaving a bare English fallback.
        Alert.alert('AI Coach', e instanceof Error ? e.message : i18n[AI_FAILURE_KEY[classify(e)]]);
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, lang, i18n],
  );

  return (
    <Ctx.Provider value={{ messages, isLoading, conversationId, send, newChat, loadConversation, onGrow }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCoachChat(): CoachChat {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCoachChat phải nằm trong <CoachChatProvider>');
  return v;
}

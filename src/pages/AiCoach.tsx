import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Bot, User, Sparkles, Loader2, Plus, MessageSquare, Trash2, History, ChevronLeft } from 'lucide-react';
// PageHeader not used - AI Coach has custom header
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { getLocale } from '@/lib/i18n';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`;

export default function AiCoach() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const QUICK_PROMPTS = [i18n.aiCoachPrompt1, i18n.aiCoachPrompt2, i18n.aiCoachPrompt3, i18n.aiCoachPrompt4];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const { data: conversations } = useQuery({
    queryKey: ['ai-conversations', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!activeConvoId) return;
    (async () => {
      const { data } = await supabase
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', activeConvoId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data as Msg[]);
    })();
  }, [activeConvoId]);

  const createConvo = useMutation({
    mutationFn: async (title: string) => {
      const { data, error } = await supabase
        .from('ai_conversations')
        .insert({ user_id: user!.id, title })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-conversations'] }),
  });

  const deleteConvo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      if (activeConvoId) {
        setActiveConvoId(null);
        setMessages([]);
      }
    },
  });

  if (!user) return <Navigate to="/auth" replace />;

  const saveMessage = async (convoId: string, role: string, content: string) => {
    await supabase.from('ai_messages').insert({ conversation_id: convoId, role, content });
  };

  const send = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    let convoId = activeConvoId;

    try {
      if (!convoId) {
        const convo = await createConvo.mutateAsync(text.trim().slice(0, 50));
        convoId = convo.id;
        setActiveConvoId(convoId);
      }

      await saveMessage(convoId, 'user', text.trim());
      await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convoId);

      let assistantSoFar = '';

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Unknown error' }));
        toast.error(err.error || `Error ${resp.status}`);
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      };

      while (true) {
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
          if (jsonStr === '[DONE]') break;
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

      if (assistantSoFar && convoId) {
        await saveMessage(convoId, 'assistant', assistantSoFar);
        queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      }
    } catch (e) {
      console.error(e);
      toast.error(i18n.aiCoachConnectionError);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const startNewChat = () => {
    setActiveConvoId(null);
    setMessages([]);
    setShowHistory(false);
  };

  const loadConversation = (id: string) => {
    setActiveConvoId(id);
    setShowHistory(false);
  };

  return (
    <div className="flex flex-col bg-background" style={{ height: '100dvh' }}>
      {/* Header - not sticky since we manage our own layout */}
      <div className="shrink-0" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div
          className="h-[44px] flex items-center px-1 border-b"
          style={{
            background: 'hsl(var(--background) / 0.72)',
            backdropFilter: 'blur(20px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
            borderColor: 'hsl(var(--border) / 0.6)',
          }}
        >
          <motion.button
            onClick={() => navigate('/')}
            whileTap={{ scale: 0.88 }}
            className="flex items-center justify-center w-[44px] h-[44px] text-primary active:opacity-60 transition-opacity shrink-0"
          >
            <ChevronLeft className="w-[18px] h-[18px]" strokeWidth={2} />
          </motion.button>
          <h1 className="text-[17px] font-semibold tracking-tight flex-1 min-w-0 text-center -ml-[44px]">
            {i18n.aiCoachTitle}
          </h1>
          <div className="flex items-center gap-0.5 pr-2 shrink-0">
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)} className="rounded-xl">
                <History className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={startNewChat} className="rounded-xl">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 border-b border-border/50 bg-secondary/20 max-h-60 overflow-y-auto"
          >
            <div className="max-w-3xl mx-auto px-4 py-3 space-y-1">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">{i18n.aiCoachHistory}</p>
              {(!conversations || conversations.length === 0) ? (
                <p className="text-xs text-muted-foreground py-4 text-center">{i18n.aiCoachNoHistory}</p>
              ) : (
                conversations.map(c => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${activeConvoId === c.id ? 'bg-primary/10' : 'hover:bg-secondary/40'}`}
                    onClick={() => loadConversation(c.id)}
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate flex-1">{c.title}</span>
                    <span className="text-[9px] text-muted-foreground shrink-0">
                      {new Date(c.updated_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-6 h-6 rounded-lg shrink-0 opacity-50 hover:opacity-100"
                      onClick={(e) => { e.stopPropagation(); deleteConvo.mutate(c.id); }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages - only scrollable area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain scroll-container">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {messages.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16 space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Bot className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">{i18n.aiCoachHello}</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">{i18n.aiCoachIntro}</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {QUICK_PROMPTS.map(p => (
                  <Button key={p} variant="outline" size="sm" className="rounded-xl border-border/60 bg-secondary/40 text-xs" onClick={() => send(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            </motion.div>
          )}

          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-secondary/60 border border-border/50'}`}>
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-foreground">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-lg bg-secondary/60 flex items-center justify-center shrink-0 mt-1">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
              )}
            </motion.div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="bg-secondary/60 border border-border/50 rounded-2xl px-4 py-3">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            </motion.div>
          )}

          {/* Bottom spacer for input area */}
          <div className="h-4" />
        </div>
      </div>

      {/* Fixed chat input - above bottom tab bar */}
      <div
        className="shrink-0 border-t border-border/50"
        style={{
          background: 'hsl(var(--background) / 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-2.5 space-y-1">
          <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-2">
            <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              placeholder={i18n.aiCoachPlaceholder}
              className="rounded-xl bg-secondary/60 border-border/50" disabled={isLoading} />
            <Button type="submit" size="icon" disabled={!input.trim() || isLoading} className="rounded-xl shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </form>
          <p className="text-[9px] text-muted-foreground/60 text-center leading-tight">
            ⚠️ AI chỉ hỗ trợ nhắc nhở thói quen, không chẩn đoán hay phát hiện bệnh. Gặp bác sĩ khi có vấn đề sức khoẻ.
          </p>
        </div>
      </div>
    </div>
  );
}

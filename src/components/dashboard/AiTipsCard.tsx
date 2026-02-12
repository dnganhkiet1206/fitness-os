import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, Loader2, Droplets, Moon, Beef, Footprints, Heart, Dumbbell, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppSettings, t } from '@/hooks/useAppSettings';

type AINudge = {
  type: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon: string;
};

const iconMap: Record<string, React.ElementType> = {
  hydration: Droplets,
  sleep: Moon,
  protein: Beef,
  steps: Footprints,
  recovery: Heart,
  training: Dumbbell,
  nutrition: Flame,
};

const priorityColor: Record<string, string> = {
  high: 'from-destructive/20 to-destructive/5 border-destructive/20',
  medium: 'from-metric-orange/20 to-metric-orange/5 border-metric-orange/20',
  low: 'from-primary/20 to-primary/5 border-primary/20',
};

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

export default function AiTipsCard() {
  const { session } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const queryClient = useQueryClient();

  const { data: nudges, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['ai-smart-nudges'],
    queryFn: async () => {
      const resp = await supabase.functions.invoke('ai-smart-nudges', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (resp.error) throw resp.error;
      return (resp.data?.nudges ?? []) as AINudge[];
    },
    enabled: !!session,
    staleTime: 1000 * 60 * 30, // 30 min cache
    refetchOnWindowFocus: false,
  });

  if (!session) return null;

  return (
    <div className="metric-card card-shimmer space-y-4 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            AI Tips
          </h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="w-7 h-7 rounded-lg"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-xl bg-secondary/20 animate-pulse" />
          ))}
        </div>
      ) : nudges && nudges.length > 0 ? (
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {nudges.map((nudge, i) => {
              const Icon = iconMap[nudge.type] || Sparkles;
              const colors = priorityColor[nudge.priority] || priorityColor.low;
              return (
                <motion.div
                  key={`${nudge.type}-${i}`}
                  initial={{ opacity: 0, x: -12, scale: 0.95 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 12, scale: 0.95 }}
                  transition={{ ...spring, delay: i * 0.08 }}
                  className={`flex items-center gap-3 rounded-xl p-3 border bg-gradient-to-r ${colors}`}
                >
                  <div className="shrink-0">
                    <Icon className="w-4 h-4 text-foreground/70" />
                  </div>
                  <p className="text-sm text-foreground/90 leading-snug flex-1">{nudge.message}</p>
                  <span className="text-base shrink-0">{nudge.icon}</span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-xs text-muted-foreground">
            {lang === 'vi' ? 'Nhấn refresh để nhận gợi ý AI' : 'Tap refresh for AI tips'}
          </p>
        </div>
      )}
    </div>
  );
}

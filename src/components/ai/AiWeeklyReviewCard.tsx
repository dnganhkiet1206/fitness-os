import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

type AIInsight = {
  category: string;
  icon: string;
  title: string;
  detail: string;
  trend: 'up' | 'down' | 'stable';
};

type AIRecommendation = {
  priority: 'high' | 'medium' | 'low';
  action: string;
  reason: string;
};

type AIAnalysis = {
  summary: string;
  score: number;
  insights: AIInsight[];
  recommendations: AIRecommendation[];
};

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const trendIcon = (trend: string) => {
  if (trend === 'up') return <TrendingUp className="w-3.5 h-3.5 text-primary" />;
  if (trend === 'down') return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
  return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
};

const priorityIcon = (p: string) => {
  if (p === 'high') return <AlertTriangle className="w-3.5 h-3.5 text-destructive" />;
  if (p === 'medium') return <Info className="w-3.5 h-3.5 text-metric-orange" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-primary" />;
};

export default function AiWeeklyReviewCard({ weekStart }: { weekStart: string }) {
  const { session } = useAuth();
  const { lang } = useAppSettings();
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const resp = await supabase.functions.invoke('ai-weekly-review', {
        body: { week_start: weekStart },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.error) throw resp.error;
      setAnalysis(resp.data as AIAnalysis);
    } catch (e: any) {
      console.error(e);
      toast.error(lang === 'vi' ? 'Không thể phân tích' : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  if (!analysis) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="metric-card space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            AI Analysis
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">
          {lang === 'vi' ? 'Để AI phân tích tuần của bạn và đưa ra gợi ý cho tuần tới.' : 'Let AI analyze your week and provide recommendations.'}
        </p>
        <Button onClick={generate} disabled={loading} className="w-full rounded-xl" size="sm">
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          {lang === 'vi' ? 'Phân tích với AI' : 'Analyze with AI'}
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Score + Summary */}
      <div className="metric-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">AI Analysis</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-mono font-bold">{analysis.score}</span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        <p className="text-sm text-foreground/80">{analysis.summary}</p>
        <Button variant="outline" size="sm" className="rounded-xl text-[10px]" onClick={() => setAnalysis(null)}>
          {lang === 'vi' ? 'Phân tích lại' : 'Re-analyze'}
        </Button>
      </div>

      {/* Insights */}
      {analysis.insights.length > 0 && (
        <div className="metric-card space-y-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {lang === 'vi' ? 'Nhận xét' : 'Insights'}
          </h4>
          <div className="space-y-2">
            <AnimatePresence>
              {analysis.insights.map((ins, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: i * 0.06 }}
                  className="flex items-start gap-3 bg-secondary/15 rounded-xl p-3 border border-border/20"
                >
                  <span className="text-base shrink-0 mt-0.5">{ins.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium">{ins.title}</p>
                      {trendIcon(ins.trend)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{ins.detail}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div className="metric-card space-y-3">
          <h4 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {lang === 'vi' ? 'Đề xuất tuần tới' : 'Next Week'}
          </h4>
          <div className="space-y-2">
            <AnimatePresence>
              {analysis.recommendations.map((rec, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: i * 0.06 }}
                  className="flex items-start gap-3 bg-secondary/15 rounded-xl p-3 border border-border/20"
                >
                  {priorityIcon(rec.priority)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{rec.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{rec.reason}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChefHat, Clock, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

type MealSuggestion = {
  name: string;
  description: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients: string[];
  prep_time_min: number;
};

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

export default function AiMealSuggestButton({ mealType }: { mealType?: string }) {
  const { session } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchSuggestions = async () => {
    if (!session) return;
    setLoading(true);
    try {
      const resp = await supabase.functions.invoke('ai-meal-suggest', {
        body: { meal_type: mealType || 'any' },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (resp.error) throw resp.error;
      setSuggestions(resp.data?.suggestions ?? []);
    } catch (e: any) {
      console.error(e);
      toast.error(lang === 'vi' ? 'Không thể lấy gợi ý' : 'Failed to get suggestions');
    } finally {
      setLoading(false);
    }
  };

  if (suggestions.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="rounded-xl border-primary/30 bg-primary/5 hover:bg-primary/10 text-xs gap-1.5"
        onClick={fetchSuggestions}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        {lang === 'vi' ? 'AI gợi ý bữa ăn' : 'AI Suggest Meal'}
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          {lang === 'vi' ? 'Gợi ý từ AI' : 'AI Suggestions'}
        </h4>
        <Button variant="ghost" size="sm" className="text-[10px] h-6" onClick={() => setSuggestions([])}>
          {lang === 'vi' ? 'Đóng' : 'Close'}
        </Button>
      </div>
      <AnimatePresence mode="popLayout">
        {suggestions.map((meal, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ ...spring, delay: i * 0.08 }}
            className="bg-secondary/20 border border-border/30 rounded-xl overflow-hidden"
          >
            <div
              className="p-3 cursor-pointer flex items-start justify-between gap-2"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-3.5 h-3.5 text-primary shrink-0" />
                  <p className="text-sm font-medium truncate">{meal.name}</p>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{meal.description}</p>
                <div className="flex gap-3 mt-1.5 text-[10px] font-mono">
                  <span className="font-bold">{meal.kcal} kcal</span>
                  <span className="text-primary">P{meal.protein_g}g</span>
                  <span className="text-metric-orange">C{meal.carbs_g}g</span>
                  <span className="text-metric-purple">F{meal.fat_g}g</span>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">{meal.prep_time_min}m</span>
                {expanded === i ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </div>
            <AnimatePresence>
              {expanded === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 pt-1 border-t border-border/20">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      {lang === 'vi' ? 'Nguyên liệu' : 'Ingredients'}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {meal.ingredients.map((ing, j) => (
                        <span key={j} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary/40 text-foreground/80">
                          {ing}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>
      <Button variant="outline" size="sm" className="w-full rounded-xl text-xs" onClick={fetchSuggestions} disabled={loading}>
        {loading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
        {lang === 'vi' ? 'Gợi ý khác' : 'More suggestions'}
      </Button>
    </div>
  );
}

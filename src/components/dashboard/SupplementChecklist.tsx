import { motion } from 'framer-motion';
import { Pill, Check } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface SupplementItem {
  id: string;
  name: string;
  dose_text: string | null;
  timing: string | null;
  category: string | null;
  taken: boolean;
}

interface Props {
  items: SupplementItem[];
  onToggle: (id: string, taken: boolean) => void;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 25 };

export default function SupplementChecklist({ items, onToggle }: Props) {
  const { lang } = useAppSettings();
  const T = t(lang);

  const timingLabels: Record<string, string> = {
    morning: T.timingMorning,
    'pre-workout': T.timingPreWorkout,
    'post-workout': T.timingPostWorkout,
    'before bed': T.timingBeforeBed,
    'with meals': T.timingWithMeals,
  };

  if (items.length === 0) return null;

  const taken = items.filter(i => i.taken).length;
  const pct = Math.round((taken / items.length) * 100);

  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="metric-card card-shimmer space-y-4 overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at bottom left, hsl(160 84% 39%), transparent 60%)' }} />

      <div className="flex items-center justify-between relative">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <Pill className="w-3.5 h-3.5" /> {T.dcSupplementToday}
        </h3>
        <div className="flex items-center gap-2">
          <svg width="44" height="44" viewBox="0 0 48 48" className="-rotate-90">
            <circle cx="24" cy="24" r={radius} fill="none" stroke="hsl(225 10% 12%)" strokeWidth="3" />
            <motion.circle
              cx="24" cy="24" r={radius}
              fill="none"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </svg>
          <span className="text-xs font-mono text-muted-foreground">{taken}/{items.length}</span>
        </div>
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 relative">
        {items.map((item, i) => (
          <motion.button
            key={item.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring, delay: i * 0.04 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onToggle(item.id, !item.taken)}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left haptic-press ${
              item.taken
                ? 'border-primary/30 bg-primary/5'
                : 'border-border/30 bg-secondary/10 hover:bg-secondary/30'
            }`}
          >
            <Checkbox checked={item.taken} className="pointer-events-none" />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${item.taken ? 'line-through text-muted-foreground' : ''}`}>
                {item.name}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {item.dose_text} · {timingLabels[item.timing || ''] || item.timing}
              </p>
            </div>
            {item.taken && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring}>
                <Check className="w-4 h-4 text-primary shrink-0" />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

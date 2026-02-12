import { motion } from 'framer-motion';
import type { DailyLog } from '@/lib/types';
import { Flame, Beef, Wheat, Droplets as Fat } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface NutritionCardProps {
  log: DailyLog;
  targets: { protein_g: number; carbs_g: number; fat_g: number };
  calorieTarget: number;
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const NutritionCard = ({ log, targets, calorieTarget }: NutritionCardProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);
  const n = log.nutritionSummary;

  const macros = [
    { label: 'Protein', current: n.protein_g, target: targets.protein_g, unit: 'g', icon: Beef, gradient: 'from-[hsl(160,84%,39%)] to-[hsl(190,95%,50%)]', color: 'text-readiness-green' },
    { label: 'Carbs', current: n.carbs_g, target: targets.carbs_g, unit: 'g', icon: Wheat, gradient: 'from-[hsl(217,91%,60%)] to-[hsl(265,90%,66%)]', color: 'text-metric-blue' },
    { label: 'Fat', current: n.fat_g, target: targets.fat_g, unit: 'g', icon: Fat, gradient: 'from-[hsl(43,96%,56%)] to-[hsl(25,95%,58%)]', color: 'text-readiness-yellow' },
  ];

  const calPct = Math.min((n.kcal / calorieTarget) * 100, 100);

  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const calOffset = circumference - (calPct / 100) * circumference;

  return (
    <div className="metric-card card-shimmer space-y-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at bottom left, hsl(25 95% 58%), transparent 60%)' }} />

      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground relative">{T.dcNutritionTitle}</h3>

      <div className="relative flex items-center gap-6">
        <div className="relative shrink-0">
          <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(225 10% 12%)" strokeWidth="6" />
            <defs>
              <linearGradient id="cal-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(25, 95%, 58%)" />
                <stop offset="100%" stopColor="hsl(0, 100%, 60%)" />
              </linearGradient>
              <filter id="cal-glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feFlood floodColor="hsl(25 95% 58% / 0.4)" result="color" />
                <feComposite in2="blur" operator="in" />
                <feMerge>
                  <feMergeNode />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <motion.circle
              cx="50" cy="50" r={radius}
              fill="none"
              stroke="url(#cal-grad)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              filter="url(#cal-glow)"
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: calOffset }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Flame className="w-4 h-4 text-metric-orange mb-0.5" />
            <motion.span
              className="text-lg font-mono font-bold"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...spring, delay: 0.4 }}
            >
              {n.kcal.toLocaleString()}
            </motion.span>
            <span className="text-[9px] text-muted-foreground">kcal</span>
          </div>
        </div>

        <div className="flex-1 space-y-1">
          <p className="text-xs text-muted-foreground">{T.dcNutritionTarget}: <span className="font-mono text-foreground">{calorieTarget.toLocaleString()}</span> kcal</p>
          <p className="text-xs text-muted-foreground">{T.dcNutritionRemaining}: <span className="font-mono text-foreground">{Math.max(calorieTarget - n.kcal, 0).toLocaleString()}</span> kcal</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-xs font-semibold ${calPct >= 90 ? 'text-readiness-green' : calPct >= 50 ? 'text-readiness-yellow' : 'text-muted-foreground'}`}>
              {Math.round(calPct)}%
            </span>
            <div className="flex-1 h-1 rounded-full bg-secondary/40 overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-metric-orange to-destructive"
                initial={{ width: 0 }}
                animate={{ width: `${calPct}%` }}
                transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {macros.map((m, i) => {
          const pct = Math.min((m.current / m.target) * 100, 100);
          return (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.3 + i * 0.08 }}
              className="bg-secondary/20 rounded-xl p-3 space-y-2 border border-border/20"
            >
              <div className="flex items-center gap-1.5">
                <m.icon className={`w-3 h-3 ${m.color}`} />
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{m.label}</span>
              </div>
              <div className="text-lg font-mono font-bold">
                {m.current}<span className="text-xs text-muted-foreground font-normal">/{m.target}{m.unit}</span>
              </div>
              <div className="h-1 rounded-full bg-secondary/40 overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${m.gradient}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.4 + i * 0.1 }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default NutritionCard;

import { motion } from 'framer-motion';
import type { DailyLog } from '@/lib/types';
import { Flame, Beef, Wheat, Droplets as Fat } from 'lucide-react';

interface NutritionCardProps {
  log: DailyLog;
  targets: { protein_g: number; carbs_g: number; fat_g: number };
  calorieTarget: number;
}

const NutritionCard = ({ log, targets, calorieTarget }: NutritionCardProps) => {
  const n = log.nutritionSummary;

  const macros = [
    { label: 'Protein', current: n.protein_g, target: targets.protein_g, unit: 'g', icon: Beef, color: 'bg-readiness-green' },
    { label: 'Carbs', current: n.carbs_g, target: targets.carbs_g, unit: 'g', icon: Wheat, color: 'bg-metric-blue' },
    { label: 'Fat', current: n.fat_g, target: targets.fat_g, unit: 'g', icon: Fat, color: 'bg-readiness-yellow' },
  ];

  const calPct = Math.min((n.kcal / calorieTarget) * 100, 100);

  return (
    <div className="metric-card space-y-5 relative">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Dinh Dưỡng</h3>

      {/* Calories */}
      <div className="space-y-2">
        <div className="flex justify-between items-baseline">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-metric-orange" />
            <span className="text-2xl font-mono font-bold">{n.kcal.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">/ {calorieTarget.toLocaleString()} kcal</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{Math.round(calPct)}%</span>
        </div>
        <div className="progress-bar">
          <motion.div
            className="progress-fill bg-metric-orange"
            initial={{ width: 0 }}
            animate={{ width: `${calPct}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          />
        </div>
      </div>

      {/* Macros */}
      <div className="grid grid-cols-3 gap-4">
        {macros.map((m, i) => {
          const pct = Math.min((m.current / m.target) * 100, 100);
          return (
            <div key={m.label} className="space-y-2">
              <div className="flex items-center gap-1.5">
                <m.icon className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{m.label}</span>
              </div>
              <div className="text-lg font-mono font-bold">
                {m.current}<span className="text-xs text-muted-foreground font-normal">/{m.target}{m.unit}</span>
              </div>
              <div className="progress-bar h-1">
                <motion.div
                  className={`progress-fill ${m.color}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 + i * 0.1 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NutritionCard;

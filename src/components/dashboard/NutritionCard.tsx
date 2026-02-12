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
    <div className="metric-card space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Dinh Dưỡng</h3>

      {/* Calories */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-baseline">
          <div className="flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-metric-orange" />
            <span className="text-2xl font-mono font-bold">{n.kcal.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">/ {calorieTarget.toLocaleString()} kcal</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground">{Math.round(calPct)}%</span>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full bg-metric-orange rounded-full transition-all duration-700" style={{ width: `${calPct}%` }} />
        </div>
      </div>

      {/* Macros */}
      <div className="grid grid-cols-3 gap-3">
        {macros.map(m => {
          const pct = Math.min((m.current / m.target) * 100, 100);
          return (
            <div key={m.label} className="space-y-1.5">
              <div className="flex items-center gap-1">
                <m.icon className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
              </div>
              <div className="text-lg font-mono font-bold">
                {m.current}<span className="text-xs text-muted-foreground font-normal">/{m.target}{m.unit}</span>
              </div>
              <div className="h-1 bg-secondary rounded-full overflow-hidden">
                <div className={`h-full ${m.color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NutritionCard;

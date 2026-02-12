import type { WorkoutSession } from '@/lib/types';
import { Dumbbell, AlertTriangle, Trophy } from 'lucide-react';

interface TrainingCardProps {
  workouts: WorkoutSession[];
  acwr: number;
}

const TrainingCard = ({ workouts, acwr }: TrainingCardProps) => {
  const latest = workouts[0];
  if (!latest) return null;

  const acwrColor = acwr >= 0.8 && acwr <= 1.3 ? 'text-readiness-green' : acwr > 1.3 ? 'text-readiness-yellow' : 'text-readiness-red';
  const acwrLabel = acwr >= 0.8 && acwr <= 1.3 ? 'Optimal' : acwr > 1.6 ? 'Spike' : acwr > 1.3 ? 'Elevated' : acwr < 0.65 ? 'Detraining' : 'Low';

  const totalVolume = workouts.reduce((s, w) => s + w.computed.volumeLoad, 0);
  const hasPR = workouts.some(w => w.computed.prDetected);
  const painFlags = latest.painFlags.filter(p => p.pain_0_10 > 0);

  return (
    <div className="metric-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Tập Luyện</h3>
        {hasPR && (
          <div className="flex items-center gap-1 text-xs font-semibold text-readiness-yellow">
            <Trophy className="w-3.5 h-3.5" />
            PR!
          </div>
        )}
      </div>

      {/* Latest workout */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Dumbbell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold">{latest.templateName || 'Workout'}</div>
          <div className="text-xs text-muted-foreground">
            RPE {latest.sessionRPE_1_10}/10 · {latest.sets.length} sets · {latest.computed.volumeLoad.toLocaleString()} vol
          </div>
        </div>
      </div>

      {/* ACWR */}
      <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Acute:Chronic Ratio</div>
          <div className={`text-2xl font-mono font-bold ${acwrColor}`}>{acwr}</div>
        </div>
        <div className={`text-xs font-semibold px-2 py-1 rounded ${
          acwrColor === 'text-readiness-green' ? 'bg-readiness-green/10 text-readiness-green' :
          acwrColor === 'text-readiness-yellow' ? 'bg-readiness-yellow/10 text-readiness-yellow' :
          'bg-readiness-red/10 text-readiness-red'
        }`}>
          {acwrLabel}
        </div>
      </div>

      {/* 7-day volume */}
      <div className="text-xs text-muted-foreground">
        Khối lượng 7 ngày: <span className="font-mono font-semibold text-foreground">{totalVolume.toLocaleString()}</span>
      </div>

      {/* Pain flags */}
      {painFlags.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-readiness-yellow bg-readiness-yellow/10 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Đau: {painFlags.map(p => `${p.bodyPart} (${p.pain_0_10}/10)`).join(', ')}</span>
        </div>
      )}
    </div>
  );
};

export default TrainingCard;

import { motion } from 'framer-motion';
import type { WorkoutSession } from '@/lib/types';
import { Dumbbell, AlertTriangle, Trophy, Zap } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface TrainingCardProps {
  workouts: WorkoutSession[];
  acwr: number;
}

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

const TrainingCard = ({ workouts, acwr }: TrainingCardProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);
  const latest = workouts[0];
  if (!latest) return null;

  const acwrColor = acwr >= 0.8 && acwr <= 1.3 ? 'text-readiness-green' : acwr > 1.3 ? 'text-readiness-yellow' : 'text-readiness-red';
  const acwrLabel = acwr >= 0.8 && acwr <= 1.3 ? 'Optimal' : acwr > 1.6 ? 'Spike' : acwr > 1.3 ? 'Elevated' : acwr < 0.65 ? 'Detraining' : 'Low';
  const acwrPct = Math.min((acwr / 2) * 100, 100);

  const totalVolume = workouts.reduce((s, w) => s + w.computed.volumeLoad, 0);
  const hasPR = workouts.some(w => w.computed.prDetected);
  const painFlags = latest.painFlags.filter(p => p.pain_0_10 > 0);

  return (
    <div className="metric-card card-shimmer space-y-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at bottom right, hsl(160 84% 39%), transparent 60%)' }} />

      <div className="flex items-center justify-between relative">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{T.dcTrainingTitle}</h3>
        {hasPR && (
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={spring}
            className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-readiness-yellow/15 text-readiness-yellow border border-readiness-yellow/20"
          >
            <Trophy className="w-3.5 h-3.5" />
            PR!
          </motion.div>
        )}
      </div>

      <motion.div 
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring, delay: 0.1 }}
        className="flex items-center gap-3 relative"
      >
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
          <Dumbbell className="w-5 h-5 text-primary" />
        </div>
        <div>
          <div className="text-sm font-semibold">{latest.templateName || 'Workout'}</div>
          <div className="text-xs text-muted-foreground">
            RPE {latest.sessionRPE_1_10}/10 · {latest.sets.length} sets · {latest.computed.volumeLoad.toLocaleString()} vol
          </div>
        </div>
      </motion.div>

      <div className="bg-secondary/20 rounded-xl p-4 space-y-3 border border-border/20 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">Acute:Chronic Ratio</span>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${
            acwrColor === 'text-readiness-green' ? 'bg-readiness-green/10 text-readiness-green' :
            acwrColor === 'text-readiness-yellow' ? 'bg-readiness-yellow/10 text-readiness-yellow' :
            'bg-readiness-red/10 text-readiness-red'
          }`}>
            {acwrLabel}
          </span>
        </div>
        <div className={`text-3xl font-mono font-bold ${acwrColor}`}>{acwr}</div>
        <div className="relative h-2 rounded-full bg-secondary/40 overflow-hidden">
          <div className="absolute top-0 bottom-0 bg-readiness-green/10 rounded-full" style={{ left: '40%', right: '35%' }} />
          <motion.div
            className="absolute top-0 bottom-0 w-1.5 rounded-full bg-foreground"
            initial={{ left: '0%' }}
            animate={{ left: `${acwrPct}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground">
          <span>0</span>
          <span className="text-readiness-green">0.8–1.3</span>
          <span>2.0</span>
        </div>
      </div>

      <div className="text-xs text-muted-foreground relative">
        {T.dcTraining7dVolume}: <span className="font-mono font-semibold text-foreground">{totalVolume.toLocaleString()}</span>
      </div>

      {painFlags.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-2 text-xs text-readiness-yellow bg-readiness-yellow/10 rounded-xl px-3 py-2.5 border border-readiness-yellow/20"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{T.dcTrainingPain}: {painFlags.map(p => `${p.bodyPart} (${p.pain_0_10}/10)`).join(', ')}</span>
        </motion.div>
      )}
    </div>
  );
};

export default TrainingCard;

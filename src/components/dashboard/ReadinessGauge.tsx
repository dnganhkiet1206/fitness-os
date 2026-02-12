import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ReadinessResult } from '@/lib/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface ReadinessGaugeProps {
  result: ReadinessResult;
}

const spring = { type: 'spring' as const, stiffness: 200, damping: 26 };

const ReadinessGauge = ({ result }: ReadinessGaugeProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);
  const { score, status, explain, recommendation, subscores, acwr } = result;

  const gradientColors = status === 'green' 
    ? ['hsl(160, 84%, 39%)', 'hsl(120, 100%, 45%)']
    : status === 'yellow'
    ? ['hsl(43, 96%, 56%)', 'hsl(25, 95%, 58%)']
    : ['hsl(0, 84%, 60%)', 'hsl(340, 100%, 55%)'];

  const glowColor = status === 'green' ? 'hsl(160 84% 39% / 0.3)' : status === 'yellow' ? 'hsl(43 96% 56% / 0.3)' : 'hsl(0 84% 60% / 0.3)';
  const colorClass = status === 'green' ? 'readiness-green' : status === 'yellow' ? 'readiness-yellow' : 'readiness-red';
  const statusLabel = status === 'green' ? T.dcReadinessTrain : status === 'yellow' ? T.dcReadinessModerate : T.dcReadinessRecover;
  const bgStroke = 'hsl(225, 10%, 12%)';

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = useMemo(() => circumference - (score / 100) * circumference, [score, circumference]);

  const subItems = [
    { label: 'HRV', value: subscores.hrv, available: subscores.hrv !== undefined },
    { label: 'RHR', value: subscores.rhr, available: true },
    { label: 'Sleep', value: subscores.sleep, available: true },
    { label: 'Load', value: subscores.load, available: true },
  ];

  return (
    <div className="metric-card card-shimmer col-span-full lg:col-span-2 flex flex-col items-center gap-7 py-10 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 40%, ${glowColor}, transparent 60%)` }} />

      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground relative">
        <motion.span 
          className={`inline-block w-2.5 h-2.5 rounded-full bg-${colorClass === 'readiness-green' ? 'readiness-green' : colorClass === 'readiness-yellow' ? 'readiness-yellow' : 'readiness-red'}`}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {T.dcReadinessTitle}
      </div>

      <div className="relative w-52 h-52">
        <svg className="w-52 h-52 -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} fill="none" stroke={bgStroke} strokeWidth="6" />
          <defs>
            <linearGradient id="readiness-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientColors[0]} />
              <stop offset="100%" stopColor={gradientColors[1]} />
            </linearGradient>
            <filter id="readiness-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feFlood floodColor={glowColor} result="color" />
              <feComposite in2="blur" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <motion.circle
            cx="60" cy="60" r={radius}
            fill="none"
            stroke="url(#readiness-grad)"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            filter="url(#readiness-glow)"
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={`text-6xl font-bold font-mono ${colorClass}`}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: 0.5 }}
          >
            {score}
          </motion.span>
          <motion.span
            className={`text-xs font-bold uppercase tracking-[0.2em] mt-1.5 ${colorClass}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.4 }}
          >
            {statusLabel}
          </motion.span>
        </div>
      </div>

      <motion.div
        className="flex gap-3 relative"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, ...spring }}
      >
        {subItems.filter(s => s.available).map(s => (
          <div key={s.label} className="flex flex-col items-center gap-1.5 bg-secondary/20 rounded-xl px-4 py-2.5 border border-border/20">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.label}</span>
            <span className="text-lg font-mono font-semibold text-foreground">{s.value}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1.5 bg-secondary/20 rounded-xl px-4 py-2.5 border border-border/20">
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">ACWR</span>
          <span className="text-lg font-mono font-semibold text-foreground">{acwr}</span>
        </div>
      </motion.div>

      <motion.div
        className="w-full px-5 space-y-3 relative"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <p className="text-xs text-muted-foreground text-center leading-relaxed">{explain}</p>
        <div className={`text-sm text-center px-4 py-3 rounded-xl font-medium backdrop-blur-sm ${
          status === 'green' ? 'bg-readiness-green/10 text-readiness-green border border-readiness-green/20' :
          status === 'yellow' ? 'bg-readiness-yellow/10 text-readiness-yellow border border-readiness-yellow/20' :
          'bg-readiness-red/10 text-readiness-red border border-readiness-red/20'
        }`}>
          {recommendation}
        </div>
      </motion.div>

      <motion.div
        className="w-full px-5 relative"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.4 }}
      >
        <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-readiness-green" />
            <span>75–100 · {T.dcReadinessTrain}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-readiness-yellow" />
            <span>50–74 · {T.dcReadinessModerate}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-readiness-red" />
            <span>0–49 · {T.dcReadinessRecover}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ReadinessGauge;

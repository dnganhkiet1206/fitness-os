import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { ReadinessResult } from '@/lib/types';

interface ReadinessGaugeProps {
  result: ReadinessResult;
}

const spring = { type: 'spring' as const, stiffness: 200, damping: 26 };

const ReadinessGauge = ({ result }: ReadinessGaugeProps) => {
  const { score, status, explain, recommendation, subscores, acwr } = result;

  const colorClass = status === 'green' ? 'readiness-green' : status === 'yellow' ? 'readiness-yellow' : 'readiness-red';
  const glowClass = status === 'green' ? 'glow-green' : status === 'yellow' ? 'glow-yellow' : 'glow-red';
  const strokeColor = status === 'green' ? 'hsl(160, 84%, 39%)' : status === 'yellow' ? 'hsl(43, 96%, 56%)' : 'hsl(0, 84%, 60%)';
  const bgStroke = 'hsl(225, 10%, 14%)';
  const statusLabel = status === 'green' ? 'TẬP LUYỆN' : status === 'yellow' ? 'VỪA PHẢI' : 'PHỤC HỒI';

  const circumference = 2 * Math.PI * 45;
  const offset = useMemo(() => circumference - (score / 100) * circumference, [score, circumference]);

  const subItems = [
    { label: 'HRV', value: subscores.hrv, available: subscores.hrv !== undefined },
    { label: 'RHR', value: subscores.rhr, available: true },
    { label: 'Sleep', value: subscores.sleep, available: true },
    { label: 'Load', value: subscores.load, available: true },
  ];

  return (
    <div className="metric-card col-span-full lg:col-span-2 flex flex-col items-center gap-7 py-10 relative">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <span className={`inline-block w-2 h-2 rounded-full bg-${colorClass === 'readiness-green' ? 'readiness-green' : colorClass === 'readiness-yellow' ? 'readiness-yellow' : 'readiness-red'}`} />
        Điểm Sẵn Sàng
      </div>

      {/* Ring gauge */}
      <div className={`relative w-48 h-48 rounded-full ${glowClass}`}>
        <svg className="w-48 h-48 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke={bgStroke} strokeWidth="5" />
          <motion.circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke={strokeColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className={`text-5xl font-bold font-mono ${colorClass}`}
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

      {/* Sub-scores */}
      <motion.div
        className="flex gap-5"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, ...spring }}
      >
        {subItems.filter(s => s.available).map(s => (
          <div key={s.label} className="flex flex-col items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{s.label}</span>
            <span className="text-lg font-mono font-semibold text-foreground">{s.value}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">ACWR</span>
          <span className="text-lg font-mono font-semibold text-foreground">{acwr}</span>
        </div>
      </motion.div>

      {/* Explain + recommendation */}
      <motion.div
        className="w-full px-5 space-y-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        <p className="text-xs text-muted-foreground text-center leading-relaxed">{explain}</p>
        <div className={`text-sm text-center px-4 py-3 rounded-xl font-medium ${
          status === 'green' ? 'bg-readiness-green/10 text-readiness-green' :
          status === 'yellow' ? 'bg-readiness-yellow/10 text-readiness-yellow' :
          'bg-readiness-red/10 text-readiness-red'
        }`}>
          {recommendation}
        </div>
      </motion.div>
    </div>
  );
};

export default ReadinessGauge;

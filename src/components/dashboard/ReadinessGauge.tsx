import { useMemo } from 'react';
import type { ReadinessResult } from '@/lib/types';

interface ReadinessGaugeProps {
  result: ReadinessResult;
}

const ReadinessGauge = ({ result }: ReadinessGaugeProps) => {
  const { score, status, explain, recommendation, subscores, acwr } = result;

  const colorClass = status === 'green' ? 'text-readiness-green' : status === 'yellow' ? 'text-readiness-yellow' : 'text-readiness-red';
  const glowClass = status === 'green' ? 'glow-green' : status === 'yellow' ? 'glow-yellow' : 'glow-red';
  const strokeColor = status === 'green' ? 'hsl(142, 71%, 45%)' : status === 'yellow' ? 'hsl(45, 93%, 47%)' : 'hsl(0, 72%, 51%)';
  const statusLabel = status === 'green' ? 'TRAIN' : status === 'yellow' ? 'MODERATE' : 'RECOVER';

  const circumference = 2 * Math.PI * 45;
  const offset = useMemo(() => circumference - (score / 100) * circumference, [score, circumference]);

  const subItems = [
    { label: 'HRV', value: subscores.hrv, available: subscores.hrv !== undefined },
    { label: 'RHR', value: subscores.rhr, available: true },
    { label: 'Sleep', value: subscores.sleep, available: true },
    { label: 'Load', value: subscores.load, available: true },
  ];

  return (
    <div className="metric-card col-span-full lg:col-span-2 flex flex-col items-center gap-6 py-8">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <span className={`inline-block w-2 h-2 rounded-full ${status === 'green' ? 'bg-readiness-green' : status === 'yellow' ? 'bg-readiness-yellow' : 'bg-readiness-red'}`} />
        Readiness Score
      </div>

      {/* Ring gauge */}
      <div className={`relative w-44 h-44 rounded-full ${glowClass}`}>
        <svg className="w-44 h-44 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="none" stroke="hsl(220, 14%, 14%)" strokeWidth="6" />
          <circle
            cx="50" cy="50" r="45"
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="score-ring"
            style={{ '--score-offset': offset } as React.CSSProperties}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-5xl font-bold font-mono ${colorClass}`}>{score}</span>
          <span className={`text-sm font-bold uppercase tracking-wider mt-1 ${colorClass}`}>{statusLabel}</span>
        </div>
      </div>

      {/* Sub-scores */}
      <div className="flex gap-4">
        {subItems.filter(s => s.available).map(s => (
          <div key={s.label} className="flex flex-col items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</span>
            <span className="text-lg font-mono font-semibold text-foreground">{s.value}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">ACWR</span>
          <span className="text-lg font-mono font-semibold text-foreground">{acwr}</span>
        </div>
      </div>

      {/* Explain + recommendation */}
      <div className="w-full px-4 space-y-2">
        <p className="text-xs text-muted-foreground text-center">{explain}</p>
        <div className={`text-sm text-center px-4 py-2.5 rounded-lg font-medium ${
          status === 'green' ? 'bg-readiness-green/10 text-readiness-green' :
          status === 'yellow' ? 'bg-readiness-yellow/10 text-readiness-yellow' :
          'bg-readiness-red/10 text-readiness-red'
        }`}>
          {recommendation}
        </div>
      </div>
    </div>
  );
};

export default ReadinessGauge;

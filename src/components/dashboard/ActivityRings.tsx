import { motion } from 'framer-motion';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface ActivityRingsProps {
  move: { current: number; target: number };
  exercise: { current: number; target: number };
  stand: { current: number; target: number };
  size?: number;
}

export default function ActivityRings({ move, exercise, stand, size = 180 }: ActivityRingsProps) {
  const { lang } = useAppSettings();
  const T = t(lang);

  const RING_CONFIG = [
    { key: 'move', label: T.dcActivityMove, unit: T.dcActivityKcal, colors: ['hsl(0, 100%, 60%)', 'hsl(340, 100%, 55%)'], shadow: 'hsl(0 100% 50% / 0.4)' },
    { key: 'exercise', label: T.dcActivityExercise, unit: T.dcActivityMin, colors: ['hsl(120, 100%, 45%)', 'hsl(160, 100%, 40%)'], shadow: 'hsl(140 100% 45% / 0.4)' },
    { key: 'stand', label: T.dcActivitySteps, unit: T.dcActivityStepsUnit, colors: ['hsl(195, 100%, 50%)', 'hsl(210, 100%, 55%)'], shadow: 'hsl(200 100% 50% / 0.4)' },
  ];

  const data = [move, exercise, stand];
  const center = size / 2;
  const strokeWidth = size * 0.065;
  const gap = strokeWidth * 1.6;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {RING_CONFIG.map((ring, i) => {
            const radius = center - strokeWidth / 2 - i * gap - strokeWidth * 0.5;
            const circumference = 2 * Math.PI * radius;
            const pct = Math.min(data[i].current / data[i].target, 1.5);
            const offset = circumference - pct * circumference;

            return (
              <g key={ring.key}>
                <circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke="hsl(225 10% 12%)"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id={`grad-${ring.key}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={ring.colors[0]} />
                    <stop offset="100%" stopColor={ring.colors[1]} />
                  </linearGradient>
                  <filter id={`glow-${ring.key}`}>
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feFlood floodColor={ring.shadow} result="color" />
                    <feComposite in2="blur" operator="in" />
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <motion.circle
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={`url(#grad-${ring.key})`}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  filter={`url(#glow-${ring.key})`}
                  style={{ transformOrigin: `${center}px ${center}px`, rotate: '-90deg' }}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: offset }}
                  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 + i * 0.15 }}
                />
                {pct > 0.05 && (
                  <motion.circle
                    cx={center}
                    cy={center - radius}
                    r={strokeWidth * 0.35}
                    fill="white"
                    opacity={0.9}
                    style={{ transformOrigin: `${center}px ${center}px` }}
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: -90 + pct * 360, opacity: 0.6 }}
                    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 + i * 0.15 }}
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legends */}
      <div className="flex gap-5">
        {RING_CONFIG.map((ring, i) => {
          const pct = Math.round(Math.min((data[i].current / data[i].target) * 100, 999));
          return (
            <motion.div
              key={ring.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.6 + i * 0.1 }}
              className="flex flex-col items-center gap-1"
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: ring.colors[0], boxShadow: `0 0 6px ${ring.shadow}` }} />
                <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{ring.label}</span>
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-lg font-mono font-bold text-foreground">{data[i].current.toLocaleString()}</span>
                <span className="text-[10px] text-muted-foreground">/{data[i].target.toLocaleString()}{ring.unit}</span>
              </div>
              <span className="text-[10px] font-mono font-semibold" style={{ color: ring.colors[0] }}>{pct}%</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

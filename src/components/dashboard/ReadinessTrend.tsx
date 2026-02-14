import { motion } from 'framer-motion';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface ReadinessTrendProps {
  trend: { day: string; score: number; status: 'green' | 'yellow' | 'red' }[];
}

const spring = { type: 'spring' as const, stiffness: 200, damping: 24 };

const statusGradient = {
  green: ['hsl(160, 70%, 42%)', 'hsl(140, 80%, 45%)'],
  yellow: ['hsl(38, 92%, 50%)', 'hsl(42, 90%, 62%)'],
  red: ['hsl(0, 72%, 51%)', 'hsl(340, 80%, 50%)'],
};

const ReadinessTrend = ({ trend }: ReadinessTrendProps) => {
  const { lang } = useAppSettings();
  const T = t(lang);
  const maxHeight = 64;

  return (
    <div className="metric-card card-shimmer space-y-4 relative overflow-hidden">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground relative">{T.dcReadinessTrend}</h3>
      <div className="flex items-end justify-between gap-2 h-24 relative">
        {trend.map((d, i) => {
          const h = (d.score / 100) * maxHeight;
          const isToday = i === trend.length - 1;
          const [c1, c2] = statusGradient[d.status];
          return (
            <div key={d.day} className="flex flex-col items-center gap-1.5 flex-1">
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 + i * 0.06 }}
                className={`text-[10px] font-mono ${isToday ? 'text-foreground font-bold' : 'text-muted-foreground'}`}
              >
                {d.score}
              </motion.span>
              <motion.div
                className="w-full rounded-lg relative overflow-hidden"
                style={{ opacity: isToday ? 1 : 0.6 }}
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ ...spring, delay: 0.2 + i * 0.06 }}
              >
                <div className="absolute inset-0 rounded-lg" style={{ background: `linear-gradient(to top, ${c1}, ${c2})` }} />
                {isToday && (
                  <div className="absolute inset-0 rounded-lg" style={{ boxShadow: `0 0 12px ${c1.replace(')', ' / 0.4)')}`, }} />
                )}
              </motion.div>
              <span className={`text-[10px] ${isToday ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {d.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ReadinessTrend;

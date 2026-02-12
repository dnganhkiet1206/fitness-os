import { motion } from 'framer-motion';

interface ReadinessTrendProps {
  trend: { day: string; score: number; status: 'green' | 'yellow' | 'red' }[];
}

const spring = { type: 'spring' as const, stiffness: 200, damping: 24 };

const ReadinessTrend = ({ trend }: ReadinessTrendProps) => {
  const maxHeight = 60;

  return (
    <div className="metric-card space-y-4 relative">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Sẵn Sàng 7 Ngày</h3>
      <div className="flex items-end justify-between gap-2 h-20">
        {trend.map((d, i) => {
          const h = (d.score / 100) * maxHeight;
          const color = d.status === 'green' ? 'bg-readiness-green' : d.status === 'yellow' ? 'bg-readiness-yellow' : 'bg-readiness-red';
          const isToday = i === trend.length - 1;
          return (
            <div key={d.day} className="flex flex-col items-center gap-1.5 flex-1">
              <span className="text-[10px] font-mono text-muted-foreground">{d.score}</span>
              <motion.div
                className={`w-full rounded-lg ${color} ${isToday ? 'opacity-100' : 'opacity-50'}`}
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ ...spring, delay: 0.2 + i * 0.06 }}
              />
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

interface ReadinessTrendProps {
  trend: { day: string; score: number; status: 'green' | 'yellow' | 'red' }[];
}

const ReadinessTrend = ({ trend }: ReadinessTrendProps) => {
  const maxHeight = 60;

  return (
    <div className="metric-card space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sẵn Sàng 7 Ngày</h3>
      <div className="flex items-end justify-between gap-1.5 h-20">
        {trend.map((d, i) => {
          const h = (d.score / 100) * maxHeight;
          const color = d.status === 'green' ? 'bg-readiness-green' : d.status === 'yellow' ? 'bg-readiness-yellow' : 'bg-readiness-red';
          const isToday = i === trend.length - 1;
          return (
            <div key={d.day} className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] font-mono text-muted-foreground">{d.score}</span>
              <div
                className={`w-full rounded-t-sm transition-all duration-500 ${color} ${isToday ? 'opacity-100' : 'opacity-60'}`}
                style={{ height: `${h}px` }}
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

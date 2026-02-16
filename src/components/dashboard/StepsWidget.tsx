import { Footprints } from 'lucide-react';
import { useTodaySteps } from '@/hooks/useStepsData';
import { getStepsGoal } from '@/hooks/useStepsGoal';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useNavigate } from 'react-router-dom';

export default function StepsWidget() {
  const { lang } = useAppSettings();
  const navigate = useNavigate();
  const { data: steps } = useTodaySteps();
  const target = getStepsGoal();
  const current = steps ?? 0;
  const pct = Math.min(100, Math.round((current / target) * 100));

  return (
    <button onClick={() => navigate('/steps')} className="glass-card p-4 w-full text-left flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-green-500/10">
        <Footprints className="w-5 h-5 text-green-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{lang === 'vi' ? 'Bước đi' : 'Steps'}</p>
        <p className="text-sm font-semibold">{current.toLocaleString()} / {target.toLocaleString()}</p>
      </div>
      <div className="text-right">
        <span className="text-lg font-bold">{pct}%</span>
      </div>
    </button>
  );
}

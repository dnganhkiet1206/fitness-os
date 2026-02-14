import { Droplets } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';
import { useNavigate } from 'react-router-dom';

export default function WaterWidget() {
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const dateStr = new Date().toISOString().split('T')[0];
  const target = profile?.water_target_ml ?? 2500;

  const { data: total } = useQuery({
    queryKey: ['water-today', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', user!.id)
        .eq('date', dateStr);
      if (error) throw error;
      return (data ?? []).reduce((s, r) => s + r.amount_ml, 0);
    },
  });

  const ml = total ?? 0;
  const pct = Math.min(100, Math.round((ml / target) * 100));

  return (
    <button onClick={() => navigate('/water')} className="glass-card p-4 w-full text-left flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-sky-500/10">
        <Droplets className="w-5 h-5 text-sky-400" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{lang === 'vi' ? 'Nước uống' : 'Water'}</p>
        <p className="text-sm font-semibold">{ml} / {target} ml</p>
      </div>
      <div className="text-right">
        <span className="text-lg font-bold">{pct}%</span>
      </div>
    </button>
  );
}

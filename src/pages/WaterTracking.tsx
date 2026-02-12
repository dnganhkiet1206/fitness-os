import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Droplets, Plus, Minus, Bell, BellOff, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { toast } from 'sonner';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const GLASS_ML = 250;

function startOfDay(d: Date) {
  return d.toISOString().split('T')[0];
}

function getLast7Days() {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(startOfDay(d));
  }
  return days;
}

const WaterTracking = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const today = startOfDay(new Date());
  const [reminderOn, setReminderOn] = useState(() => {
    return localStorage.getItem('water_reminder') === 'true';
  });

  // Fetch profile for water target
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('water_target_ml').eq('user_id', user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  const target = profile?.water_target_ml ?? 2500;

  // Today's water logs
  const { data: todayLogs } = useQuery({
    queryKey: ['water-today', user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from('water_logs')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', today)
        .order('logged_at', { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  // Last 7 days aggregated
  const days7 = getLast7Days();
  const { data: weekData } = useQuery({
    queryKey: ['water-week', user?.id, days7[0]],
    queryFn: async () => {
      const { data } = await supabase
        .from('water_logs')
        .select('date, amount_ml')
        .eq('user_id', user!.id)
        .gte('date', days7[0])
        .lte('date', days7[6]);
      return data ?? [];
    },
    enabled: !!user,
  });

  const addWater = useMutation({
    mutationFn: async (amount: number) => {
      const { error } = await supabase.from('water_logs').insert({
        user_id: user!.id,
        date: today,
        amount_ml: amount,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['water-today'] });
      queryClient.invalidateQueries({ queryKey: ['water-week'] });
    },
    onError: () => toast.error('Không thể ghi nhận'),
  });

  const removeLastGlass = useMutation({
    mutationFn: async () => {
      if (!todayLogs || todayLogs.length === 0) return;
      const last = todayLogs[todayLogs.length - 1];
      const { error } = await supabase.from('water_logs').delete().eq('id', last.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['water-today'] });
      queryClient.invalidateQueries({ queryKey: ['water-week'] });
    },
  });

  // Reminder toggle
  const toggleReminder = () => {
    const next = !reminderOn;
    setReminderOn(next);
    localStorage.setItem('water_reminder', String(next));
    if (next && 'Notification' in window) {
      Notification.requestPermission();
      toast.success('Nhắc uống nước mỗi giờ đã bật');
    } else {
      toast.info('Đã tắt nhắc nhở');
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const todayTotal = (todayLogs ?? []).reduce((s, l) => s + l.amount_ml, 0);
  const pct = Math.min((todayTotal / target) * 100, 100);
  const glasses = Math.floor(todayTotal / GLASS_ML);

  // Build weekly chart data
  const weekChart = days7.map(day => {
    const total = (weekData ?? []).filter(w => w.date === day).reduce((s, w) => s + w.amount_ml, 0);
    const label = new Date(day + 'T00:00:00').toLocaleDateString('vi-VN', { weekday: 'short' });
    return { day: label, ml: total, hit: total >= target };
  });

  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference - (pct / 100) * circumference;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/50" style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px)' }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold tracking-tight">Theo Dõi Nước Uống</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Circular progress */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={spring}>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardContent className="pt-6 flex flex-col items-center gap-4">
              <div className="relative w-52 h-52">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle
                    cx="100" cy="100" r="90" fill="none"
                    stroke="hsl(var(--metric-blue))"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Droplets className="w-6 h-6 text-[hsl(var(--metric-blue))] mb-1" />
                  <span className="text-3xl font-bold">{todayTotal}</span>
                  <span className="text-sm text-muted-foreground">/ {target} ml</span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="w-4 h-4" />
                <span>{glasses} ly ({GLASS_ML}ml/ly)</span>
                <span>·</span>
                <span>{Math.round(pct)}% mục tiêu</span>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-2">
                <motion.div whileTap={{ scale: 0.9 }} transition={spring}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-12 h-12 border-border/60"
                    onClick={() => removeLastGlass.mutate()}
                    disabled={!todayLogs || todayLogs.length === 0}
                  >
                    <Minus className="w-5 h-5" />
                  </Button>
                </motion.div>

                <motion.div whileTap={{ scale: 0.9 }} transition={spring}>
                  <Button
                    size="lg"
                    className="rounded-full px-8 h-14 text-lg font-semibold bg-[hsl(var(--metric-blue))] hover:bg-[hsl(var(--metric-blue))]/90 text-white"
                    onClick={() => addWater.mutate(GLASS_ML)}
                    disabled={addWater.isPending}
                  >
                    <Plus className="w-5 h-5 mr-2" /> +{GLASS_ML}ml
                  </Button>
                </motion.div>

                <motion.div whileTap={{ scale: 0.9 }} transition={spring}>
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full w-12 h-12 border-border/60"
                    onClick={() => addWater.mutate(500)}
                  >
                    <span className="text-xs font-bold">500</span>
                  </Button>
                </motion.div>
              </div>

              {/* Reminder toggle */}
              <Button variant="ghost" size="sm" onClick={toggleReminder} className="mt-2 text-muted-foreground">
                {reminderOn ? <Bell className="w-4 h-4 mr-1.5" /> : <BellOff className="w-4 h-4 mr-1.5" />}
                {reminderOn ? 'Nhắc nhở đang bật' : 'Bật nhắc nhở mỗi giờ'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Weekly chart */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tuần Này</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={weekChart} barSize={28}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(225 10% 14%)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(220 8% 46%)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220 8% 46%)', fontSize: 12 }} axisLine={false} tickLine={false} unit="ml" />
                  <ReferenceLine y={target} stroke="hsl(160 84% 39%)" strokeDasharray="6 3" strokeWidth={1.5} label={{ value: `Mục tiêu`, fill: 'hsl(160 84% 39%)', fontSize: 11, position: 'right' }} />
                  <Bar dataKey="ml" radius={[6, 6, 0, 0]}>
                    {weekChart.map((entry, i) => (
                      <Cell key={i} fill={entry.hit ? 'hsl(217 91% 60%)' : 'hsl(225 10% 20%)'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Today's log */}
        {todayLogs && todayLogs.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
            <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Hôm Nay ({todayLogs.length} lần)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {todayLogs.map((log, i) => (
                    <div key={log.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/60 text-sm">
                      <Droplets className="w-3 h-3 text-[hsl(var(--metric-blue))]" />
                      <span>{log.amount_ml}ml</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(log.logged_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <div className="h-8" />
      </main>
    </div>
  );
};

export default WaterTracking;

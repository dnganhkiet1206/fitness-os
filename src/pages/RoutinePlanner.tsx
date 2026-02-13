import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useRoutineDays, useUpsertRoutineDay, useWorkoutTemplates } from '@/hooks/useWorkoutData';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Dumbbell, Moon, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 30, duration: 0.5 } } };

const RoutinePlanner = () => {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const { data: routineDays } = useRoutineDays();
  const { data: templates } = useWorkoutTemplates();
  const upsertDay = useUpsertRoutineDay();

  const DAY_LABELS = [i18n.dayMon, i18n.dayTue, i18n.dayWed, i18n.dayThu, i18n.dayFri, i18n.daySat, i18n.daySun];

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const dayMap = new Map((routineDays ?? []).map(d => [d.day_of_week, d]));

  const handleAssign = async (dayOfWeek: number, templateId: string | null) => {
    try {
      await upsertDay.mutateAsync({ day_of_week: dayOfWeek, template_id: templateId, is_rest: !templateId });
      toast.success(i18n.routineUpdated);
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeload = async (dayOfWeek: number, isDeload: boolean) => {
    try {
      await upsertDay.mutateAsync({
        day_of_week: dayOfWeek, is_deload: isDeload,
        template_id: dayMap.get(dayOfWeek)?.template_id || null,
        is_rest: dayMap.get(dayOfWeek)?.is_rest || false,
      });
    } catch (err: any) { toast.error(err.message); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <PageHeader title={i18n.routineTitle} backTo="/workouts" gradient />

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }} className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <motion.div variants={fadeUp} className="text-xs text-muted-foreground">
          {i18n.routineDesc}
        </motion.div>

        {DAY_LABELS.map((label, i) => {
          const day = dayMap.get(i);
          const isRest = day?.is_rest ?? !day?.template_id;
          const isDeload = day?.is_deload ?? false;
          const templateName = day?.workout_templates && typeof day.workout_templates === 'object' && 'name' in day.workout_templates
            ? (day.workout_templates as any).name : null;

          return (
            <motion.div key={i} variants={fadeUp} className={`glass-card p-4 space-y-3 ${isRest ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isRest ? <Moon className="w-4 h-4 text-muted-foreground" /> : <Dumbbell className="w-4 h-4 text-primary" />}
                  <span className="font-semibold text-sm">{label}</span>
                  {isDeload && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-readiness-yellow/20 text-readiness-yellow">{i18n.routineDeload}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground">{i18n.routineDeload}</Label>
                  <Switch checked={isDeload} onCheckedChange={(v) => handleDeload(i, v)} disabled={isRest} />
                </div>
              </div>

              <Select value={day?.template_id || 'rest'} onValueChange={v => handleAssign(i, v === 'rest' ? null : v)}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder={i18n.routineChooseWorkout} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rest"><Moon className="w-3.5 h-3.5 inline mr-1.5" />{i18n.routineRest}</SelectItem>
                  {(templates ?? []).map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      <Dumbbell className="w-3.5 h-3.5 inline mr-1.5" />{t.name}
                      <span className="text-muted-foreground text-xs ml-1">({t.type})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {templateName && <p className="text-[10px] text-muted-foreground">→ {templateName}</p>}
            </motion.div>
          );
        })}

        <motion.div variants={fadeUp} className="pt-4">
          <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate('/workouts')}>
            <RefreshCw className="w-4 h-4 mr-1.5" /> {i18n.routineManageTemplates}
          </Button>
        </motion.div>
      </motion.main>
    </div>
  );
};

export default RoutinePlanner;

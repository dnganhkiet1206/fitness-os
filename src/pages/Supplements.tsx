import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useSupplements, useAddSupplement, useUpdateSupplement, useDeleteSupplement } from '@/hooks/useSupplements';
import { useSupplementAdherence } from '@/hooks/useWorkoutData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Trash2, Pill, TrendingUp, Calendar, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };
const fadeUp = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.5 } } };

const Supplements = () => {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const { data: supplements } = useSupplements();
  const addSup = useAddSupplement();
  const updateSup = useUpdateSupplement();
  const deleteSup = useDeleteSupplement();
  const { data: adherence7d } = useSupplementAdherence(7);
  const { data: adherence30d } = useSupplementAdherence(30);

  const CATEGORIES = [
    { value: 'protein', label: i18n.supplementsCatProtein },
    { value: 'creatine', label: i18n.supplementsCatCreatine },
    { value: 'vitamin', label: i18n.supplementsCatVitamin },
    { value: 'mineral', label: i18n.supplementsCatMineral },
    { value: 'nootropic', label: i18n.supplementsCatNootropic },
    { value: 'other', label: i18n.supplementsCatOther },
  ];

  const TIMINGS = [
    { value: 'morning', label: i18n.supplementsTimMorning },
    { value: 'pre-workout', label: i18n.supplementsTimPreWorkout },
    { value: 'post-workout', label: i18n.supplementsTimPostWorkout },
    { value: 'with meals', label: i18n.supplementsTimWithMeal },
    { value: 'before bed', label: i18n.supplementsTimBeforeBed },
  ];

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', category: 'other', dose_text: '', timing: 'morning', notes: '', cycle_mode: 'none', cycle_on_weeks: 4, cycle_off_weeks: 1 });

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const resetForm = () => setForm({ name: '', category: 'other', dose_text: '', timing: 'morning', notes: '', cycle_mode: 'none', cycle_on_weeks: 4, cycle_off_weeks: 1 });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      if (editId) {
        await updateSup.mutateAsync({ id: editId, name: form.name, category: form.category, dose_text: form.dose_text, timing: form.timing, notes: form.notes });
        const { error } = await (await import('@/integrations/supabase/client')).supabase
          .from('supplements').update({ cycle_mode: form.cycle_mode, cycle_on_weeks: form.cycle_on_weeks, cycle_off_weeks: form.cycle_off_weeks }).eq('id', editId);
        if (error) throw error;
        toast.success(i18n.supplementsUpdated);
      } else {
        await addSup.mutateAsync(form);
        toast.success(i18n.supplementsAdded);
      }
      setAddOpen(false);
      setEditId(null);
      resetForm();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const startEdit = (s: any) => {
    setEditId(s.id);
    setForm({ name: s.name, category: s.category || 'other', dose_text: s.dose_text || '', timing: s.timing || 'morning', notes: s.notes || '', cycle_mode: s.cycle_mode || 'none', cycle_on_weeks: s.cycle_on_weeks || 4, cycle_off_weeks: s.cycle_off_weeks || 1 });
    setAddOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <PageHeader title={i18n.supplementsTitle} gradient />

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }} className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-4">
          <div className="metric-card text-center">
            <TrendingUp className="w-5 h-5 mx-auto text-primary mb-2" />
            <p className="text-3xl font-mono font-bold">{adherence7d?.rate ?? 0}%</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{i18n.supplementsThisWeek}</p>
          </div>
          <div className="metric-card text-center">
            <Calendar className="w-5 h-5 mx-auto text-metric-purple mb-2" />
            <p className="text-3xl font-mono font-bold">{adherence30d?.rate ?? 0}%</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{i18n.supplements30Days}</p>
          </div>
        </motion.div>

        <motion.div variants={fadeUp} className="flex justify-between items-center">
          <h3 className="text-sm font-semibold">{i18n.supplementsYourStack} ({supplements?.length ?? 0})</h3>
          <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setEditId(null); resetForm(); } }}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-xl"><Plus className="w-3.5 h-3.5 mr-1" />{i18n.add}</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editId ? i18n.supplementsEditTitle : i18n.supplementsAddTitle}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2"><Label>{i18n.supplementsName}</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Creatine" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{i18n.supplementsCategory}</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>{i18n.supplementsDose}</Label><Input value={form.dose_text} onChange={e => setForm(f => ({ ...f, dose_text: e.target.value }))} placeholder="5g" /></div>
                </div>
                <div className="space-y-2">
                  <Label>{i18n.supplementsTiming}</Label>
                  <Select value={form.timing} onValueChange={v => setForm(f => ({ ...f, timing: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIMINGS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>{i18n.supplementsNotes}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>

                <div className="border-t border-border/40 pt-4 space-y-3">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">{i18n.supplementsCycle}</Label>
                  <Select value={form.cycle_mode} onValueChange={v => setForm(f => ({ ...f, cycle_mode: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{i18n.supplementsNoCycle}</SelectItem>
                      <SelectItem value="on_off">{i18n.supplementsOnOff}</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.cycle_mode === 'on_off' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">{i18n.supplementsWeeksOn}</Label>
                        <Input type="number" value={form.cycle_on_weeks} onChange={e => setForm(f => ({ ...f, cycle_on_weeks: Number(e.target.value) }))} min={1} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">{i18n.supplementsWeeksOff}</Label>
                        <Input type="number" value={form.cycle_off_weeks} onChange={e => setForm(f => ({ ...f, cycle_off_weeks: Number(e.target.value) }))} min={1} />
                      </div>
                    </div>
                  )}
                </div>

                <Button onClick={handleSave} disabled={addSup.isPending || updateSup.isPending} className="w-full">
                  {addSup.isPending || updateSup.isPending ? i18n.saving : editId ? i18n.save : i18n.add}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </motion.div>

        {supplements && supplements.length > 0 ? (
          supplements.map(s => (
            <motion.div key={s.id} variants={fadeUp} className="glass-card p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Pill className="w-4 h-4 text-primary" />
                    <p className="font-medium text-sm">{s.name}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{s.category}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{s.dose_text} · {TIMINGS.find(t => t.value === s.timing)?.label || s.timing}</p>
                  {s.cycle_mode === 'on_off' && (
                    <p className="text-[10px] text-metric-purple mt-1">🔄 Cycle: {s.cycle_on_weeks} {i18n.supplementsWeeksOn} / {s.cycle_off_weeks} {i18n.supplementsWeeksOff}</p>
                  )}
                  {s.notes && <p className="text-[10px] text-muted-foreground mt-1">📝 {s.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(s)}><Edit className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => { deleteSup.mutate(s.id); toast.success(i18n.deleted); }}><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></Button>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <motion.div variants={fadeUp} className="text-center py-12 text-muted-foreground">
            <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{i18n.supplementsNoItems}</p>
          </motion.div>
        )}
      </motion.main>
    </div>
  );
};

export default Supplements;

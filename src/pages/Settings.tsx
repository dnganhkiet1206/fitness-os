import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Target, Moon, Pill, Plus, Trash2, Save, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { useSupplements, useAddSupplement, useUpdateSupplement, useDeleteSupplement } from '@/hooks/useSupplements';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { ...spring, duration: 0.6 } },
};

interface ProfileForm {
  name: string;
  dob: string;
  sex: string;
  height_cm: string;
  weight_kg: string;
  activity_level: string;
  goal: string;
  tdee_target_kcal: string;
  macro_protein_g: string;
  macro_carbs_g: string;
  macro_fat_g: string;
  macro_fiber_g: string;
  sleep_target_hours: string;
  sleep_target_bedtime: string;
  sleep_target_waketime: string;
  water_target_ml: string;
}

const Settings = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: supplements, isLoading: suppLoading } = useSupplements();
  const addSupplement = useAddSupplement();
  const updateSupplement = useUpdateSupplement();
  const deleteSupplement = useDeleteSupplement();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [form, setForm] = useState<ProfileForm>({
    name: '', dob: '', sex: 'other', height_cm: '170', weight_kg: '70',
    activity_level: 'moderate', goal: 'maintain', tdee_target_kcal: '2200',
    macro_protein_g: '150', macro_carbs_g: '250', macro_fat_g: '70', macro_fiber_g: '30',
    sleep_target_hours: '8', sleep_target_bedtime: '23:00', sleep_target_waketime: '07:00',
    water_target_ml: '2500',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'nutrition' | 'sleep' | 'supplements'>('profile');

  // New supplement form
  const [newSup, setNewSup] = useState({ name: '', category: 'vitamin', dose_text: '', timing: 'morning', notes: '' });
  const [showAddSup, setShowAddSup] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        name: profile.name || '',
        dob: profile.dob || '',
        sex: profile.sex || 'other',
        height_cm: String(profile.height_cm ?? 170),
        weight_kg: String(profile.weight_kg ?? 70),
        activity_level: profile.activity_level || 'moderate',
        goal: profile.goal || 'maintain',
        tdee_target_kcal: String(profile.tdee_target_kcal ?? 2200),
        macro_protein_g: String(profile.macro_protein_g ?? 150),
        macro_carbs_g: String(profile.macro_carbs_g ?? 250),
        macro_fat_g: String(profile.macro_fat_g ?? 70),
        macro_fiber_g: String(profile.macro_fiber_g ?? 30),
        sleep_target_hours: String(profile.sleep_target_hours ?? 8),
        sleep_target_bedtime: profile.sleep_target_bedtime || '23:00',
        sleep_target_waketime: profile.sleep_target_waketime || '07:00',
        water_target_ml: String(profile.water_target_ml ?? 2500),
      });
    }
  }, [profile]);

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">Đang tải...</motion.div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      name: form.name,
      dob: form.dob || null,
      sex: form.sex,
      height_cm: Number(form.height_cm),
      weight_kg: Number(form.weight_kg),
      activity_level: form.activity_level,
      goal: form.goal,
      tdee_target_kcal: Number(form.tdee_target_kcal),
      macro_protein_g: Number(form.macro_protein_g),
      macro_carbs_g: Number(form.macro_carbs_g),
      macro_fat_g: Number(form.macro_fat_g),
      macro_fiber_g: Number(form.macro_fiber_g),
      sleep_target_hours: Number(form.sleep_target_hours),
      sleep_target_bedtime: form.sleep_target_bedtime,
      sleep_target_waketime: form.sleep_target_waketime,
      water_target_ml: Number(form.water_target_ml),
    }).eq('user_id', user.id);

    if (error) {
      toast.error('Lỗi khi lưu: ' + error.message);
    } else {
      toast.success('Đã lưu thành công!');
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
    }
    setSaving(false);
  };

  const handleAddSupplement = async () => {
    if (!newSup.name.trim()) return toast.error('Tên supplement không được trống');
    await addSupplement.mutateAsync(newSup);
    setNewSup({ name: '', category: 'vitamin', dose_text: '', timing: 'morning', notes: '' });
    setShowAddSup(false);
    toast.success('Đã thêm supplement!');
  };

  const tabs = [
    { id: 'profile' as const, label: 'Hồ Sơ', icon: User },
    { id: 'nutrition' as const, label: 'Dinh Dưỡng', icon: Target },
    { id: 'sleep' as const, label: 'Giấc Ngủ', icon: Moon },
    { id: 'supplements' as const, label: 'Supplements', icon: Pill },
  ];

  const update = (key: keyof ProfileForm, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' as const }}
        className="sticky top-0 z-50 border-b border-border/50"
        style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px) saturate(1.5)' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              transition={spring}
              onClick={() => navigate('/')}
              className="w-9 h-9 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </motion.button>
            <h1 className="text-lg font-bold tracking-tight">Cài Đặt</h1>
          </div>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={spring}>
            <Button onClick={handleSave} disabled={saving} size="sm" className="rounded-xl gap-1.5">
              {saving ? <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </motion.div>
        </div>
      </motion.header>

      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="relative max-w-3xl mx-auto px-4 py-8 space-y-6"
      >
        {/* Tabs */}
        <motion.div variants={fadeUp} className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map(tab => (
            <motion.button
              key={tab.id}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={spring}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </motion.button>
          ))}
        </motion.div>

        {/* Profile Tab */}
        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ ...spring, duration: 0.4 }}
              className="space-y-5"
            >
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Thông Tin Cá Nhân</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tên</Label>
                    <Input value={form.name} onChange={e => update('name', e.target.value)} className="rounded-xl bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Ngày sinh</Label>
                    <Input type="date" value={form.dob} onChange={e => update('dob', e.target.value)} className="rounded-xl bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Giới tính</Label>
                    <Select value={form.sex} onValueChange={v => update('sex', v)}>
                      <SelectTrigger className="rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Nam</SelectItem>
                        <SelectItem value="female">Nữ</SelectItem>
                        <SelectItem value="other">Khác</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chiều cao (cm)</Label>
                    <Input type="number" value={form.height_cm} onChange={e => update('height_cm', e.target.value)} className="rounded-xl bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cân nặng (kg)</Label>
                    <Input type="number" value={form.weight_kg} onChange={e => update('weight_kg', e.target.value)} className="rounded-xl bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Mức hoạt động</Label>
                    <Select value={form.activity_level} onValueChange={v => update('activity_level', v)}>
                      <SelectTrigger className="rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sedentary">Ít vận động</SelectItem>
                        <SelectItem value="light">Nhẹ</SelectItem>
                        <SelectItem value="moderate">Trung bình</SelectItem>
                        <SelectItem value="high">Cao</SelectItem>
                        <SelectItem value="athlete">Vận động viên</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Mục tiêu</Label>
                    <Select value={form.goal} onValueChange={v => update('goal', v)}>
                      <SelectTrigger className="rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bulk">Tăng cân</SelectItem>
                        <SelectItem value="cut">Giảm cân</SelectItem>
                        <SelectItem value="maintain">Duy trì</SelectItem>
                        <SelectItem value="recomp">Recomp</SelectItem>
                        <SelectItem value="strength">Tăng sức mạnh</SelectItem>
                        <SelectItem value="endurance">Tăng sức bền</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'nutrition' && (
            <motion.div
              key="nutrition"
              initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ ...spring, duration: 0.4 }}
              className="space-y-5"
            >
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mục Tiêu Calories & Macros</h3>
                <div className="space-y-2">
                  <Label>TDEE Target (kcal/ngày)</Label>
                  <Input type="number" value={form.tdee_target_kcal} onChange={e => update('tdee_target_kcal', e.target.value)} className="rounded-xl bg-background/50 text-2xl font-mono font-bold h-14" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { key: 'macro_protein_g' as const, label: 'Protein (g)', color: 'text-readiness-green' },
                    { key: 'macro_carbs_g' as const, label: 'Carbs (g)', color: 'text-metric-blue' },
                    { key: 'macro_fat_g' as const, label: 'Fat (g)', color: 'text-readiness-yellow' },
                    { key: 'macro_fiber_g' as const, label: 'Fiber (g)', color: 'text-muted-foreground' },
                  ].map(macro => (
                    <div key={macro.key} className="space-y-2">
                      <Label className={macro.color}>{macro.label}</Label>
                      <Input type="number" value={form[macro.key]} onChange={e => update(macro.key, e.target.value)} className="rounded-xl bg-background/50 font-mono" />
                    </div>
                  ))}
                </div>
                {/* Visual summary */}
                <div className="bg-secondary/30 rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-3">Phân bổ Macros</p>
                  <div className="flex h-3 rounded-full overflow-hidden">
                    {(() => {
                      const p = Number(form.macro_protein_g) * 4;
                      const c = Number(form.macro_carbs_g) * 4;
                      const f = Number(form.macro_fat_g) * 9;
                      const total = p + c + f || 1;
                      return (
                        <>
                          <div className="bg-readiness-green transition-all" style={{ width: `${(p / total) * 100}%` }} />
                          <div className="bg-metric-blue transition-all" style={{ width: `${(c / total) * 100}%` }} />
                          <div className="bg-readiness-yellow transition-all" style={{ width: `${(f / total) * 100}%` }} />
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                    <span className="text-readiness-green">P: {Math.round((Number(form.macro_protein_g) * 4 / (Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9 || 1)) * 100)}%</span>
                    <span className="text-metric-blue">C: {Math.round((Number(form.macro_carbs_g) * 4 / (Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9 || 1)) * 100)}%</span>
                    <span className="text-readiness-yellow">F: {Math.round((Number(form.macro_fat_g) * 9 / (Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9 || 1)) * 100)}%</span>
                    <span>Tổng: {Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9} kcal</span>
                  </div>
                </div>
              </div>

              {/* Water target */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mục Tiêu Nước Uống</h3>
                <div className="space-y-2">
                  <Label>Mục tiêu mỗi ngày (ml)</Label>
                  <Input type="number" step="250" min="500" max="6000" value={form.water_target_ml} onChange={e => update('water_target_ml', e.target.value)} className="rounded-xl bg-background/50 text-2xl font-mono font-bold h-14" />
                  <p className="text-xs text-muted-foreground">Khuyến nghị: 30-35ml × cân nặng (kg) = {Math.round(Number(form.weight_kg) * 33)}ml</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sleep' && (
            <motion.div
              key="sleep"
              initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ ...spring, duration: 0.4 }}
              className="space-y-5"
            >
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mục Tiêu Giấc Ngủ</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Số giờ mục tiêu</Label>
                    <Input type="number" step="0.5" min="4" max="12" value={form.sleep_target_hours} onChange={e => update('sleep_target_hours', e.target.value)} className="rounded-xl bg-background/50 font-mono text-xl font-bold h-14" />
                  </div>
                  <div className="space-y-2">
                    <Label>Giờ đi ngủ</Label>
                    <Input type="time" value={form.sleep_target_bedtime} onChange={e => update('sleep_target_bedtime', e.target.value)} className="rounded-xl bg-background/50 font-mono" />
                  </div>
                  <div className="space-y-2">
                    <Label>Giờ thức dậy</Label>
                    <Input type="time" value={form.sleep_target_waketime} onChange={e => update('sleep_target_waketime', e.target.value)} className="rounded-xl bg-background/50 font-mono" />
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-xl p-4 flex items-center gap-3">
                  <Moon className="w-5 h-5 text-metric-purple" />
                  <p className="text-sm text-muted-foreground">
                    Mục tiêu: <span className="text-foreground font-semibold">{form.sleep_target_bedtime}</span> → <span className="text-foreground font-semibold">{form.sleep_target_waketime}</span> ({form.sleep_target_hours}h)
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'supplements' && (
            <motion.div
              key="supplements"
              initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ ...spring, duration: 0.4 }}
              className="space-y-5"
            >
              <div className="metric-card space-y-5 relative">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Supplement Stack</h3>
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={spring}>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowAddSup(!showAddSup)}>
                      <Plus className="w-3 h-3 mr-1.5" />Thêm
                    </Button>
                  </motion.div>
                </div>

                {/* Add form */}
                <AnimatePresence>
                  {showAddSup && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ ...spring, duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="bg-secondary/30 rounded-xl p-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Tên</Label>
                            <Input value={newSup.name} onChange={e => setNewSup(s => ({ ...s, name: e.target.value }))} placeholder="VD: Creatine" className="rounded-xl bg-background/50 h-9 text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Liều</Label>
                            <Input value={newSup.dose_text} onChange={e => setNewSup(s => ({ ...s, dose_text: e.target.value }))} placeholder="VD: 5g/ngày" className="rounded-xl bg-background/50 h-9 text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Loại</Label>
                            <Select value={newSup.category} onValueChange={v => setNewSup(s => ({ ...s, category: v }))}>
                              <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vitamin">Vitamin</SelectItem>
                                <SelectItem value="mineral">Khoáng chất</SelectItem>
                                <SelectItem value="performance">Hiệu suất</SelectItem>
                                <SelectItem value="recovery">Phục hồi</SelectItem>
                                <SelectItem value="health">Sức khỏe</SelectItem>
                                <SelectItem value="other">Khác</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Thời điểm</Label>
                            <Select value={newSup.timing} onValueChange={v => setNewSup(s => ({ ...s, timing: v }))}>
                              <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="morning">Sáng</SelectItem>
                                <SelectItem value="pre_workout">Trước tập</SelectItem>
                                <SelectItem value="post_workout">Sau tập</SelectItem>
                                <SelectItem value="evening">Tối</SelectItem>
                                <SelectItem value="with_meal">Cùng bữa ăn</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-xl" onClick={handleAddSupplement} disabled={addSupplement.isPending}>
                            <Check className="w-3 h-3 mr-1" />Thêm
                          </Button>
                          <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setShowAddSup(false)}>Hủy</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* List */}
                {suppLoading ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Đang tải...</p>
                ) : supplements && supplements.length > 0 ? (
                  <div className="space-y-2.5">
                    {supplements.map((sup, i) => (
                      <motion.div
                        key={sup.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ ...spring, delay: i * 0.04 }}
                        className="flex items-center justify-between bg-secondary/30 rounded-xl p-4 group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Pill className="w-4 h-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold truncate">{sup.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {sup.dose_text && <span>{sup.dose_text} · </span>}
                              <span className="capitalize">{sup.timing?.replace('_', ' ')}</span>
                              {sup.category && <span> · {sup.category}</span>}
                            </div>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          transition={spring}
                          onClick={() => {
                            deleteSupplement.mutate(sup.id);
                            toast.success('Đã xóa supplement');
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </motion.button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 space-y-2">
                    <div className="w-10 h-10 rounded-2xl bg-secondary/60 flex items-center justify-center mx-auto mb-3">
                      <Pill className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                    <p className="text-sm text-muted-foreground">Chưa có supplement nào.</p>
                    <p className="text-xs text-muted-foreground">Nhấn "Thêm" để bắt đầu.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="h-8" />
      </motion.main>
    </div>
  );
};

export default Settings;

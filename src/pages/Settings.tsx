import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Target, Moon, Pill, Plus, Trash2, Save, Check, Download, Lock, Scale, Globe, Sun, Monitor } from 'lucide-react';
import { useAppSettings, type ThemeMode } from '@/hooks/useAppSettings';
import { LANGUAGES, CURRENCIES, type GroceryLang, type CurrencyCode } from '@/lib/grocery-i18n';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { useSupplements, useAddSupplement, useUpdateSupplement, useDeleteSupplement } from '@/hooks/useSupplements';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  units_weight: string;
  units_height: string;
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
    water_target_ml: '2500', units_weight: 'kg', units_height: 'cm',
  });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'profile' | 'nutrition' | 'sleep' | 'supplements' | 'data'>('general');
  const appSettings = useAppSettings();
  const [newSup, setNewSup] = useState({ name: '', category: 'vitamin', dose_text: '', timing: 'morning', notes: '' });
  const [showAddSup, setShowAddSup] = useState(false);

  // PIN state
  const [pinEnabled, setPinEnabled] = useState(() => !!localStorage.getItem('app_pin'));
  const [pinInput, setPinInput] = useState('');

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
        units_weight: profile.units_weight || 'kg',
        units_height: profile.units_height || 'cm',
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
      units_weight: form.units_weight,
      units_height: form.units_height,
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

  // Export functions
  const exportData = async (format: 'csv' | 'json') => {
    const tables = ['weight_logs', 'daily_logs', 'meal_entries', 'workout_sessions', 'sleep_logs'] as const;
    const allData: Record<string, any[]> = {};

    for (const table of tables) {
      const { data } = await supabase.from(table).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500);
      allData[table] = data ?? [];
    }

    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify(allData, null, 2);
      filename = `fitness-os-export-${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      // CSV: flatten all tables
      const lines: string[] = [];
      for (const [table, rows] of Object.entries(allData)) {
        if (rows.length === 0) continue;
        lines.push(`\n--- ${table} ---`);
        const headers = Object.keys(rows[0]);
        lines.push(headers.join(','));
        rows.forEach(row => {
          lines.push(headers.map(h => {
            const v = row[h];
            if (v === null || v === undefined) return '';
            if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
            return `"${String(v).replace(/"/g, '""')}"`;
          }).join(','));
        });
      }
      content = lines.join('\n');
      filename = `fitness-os-export-${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${format.toUpperCase()}!`);
  };

  // PIN management
  const handleSetPin = () => {
    if (pinInput.length < 4) return toast.error('PIN phải có ít nhất 4 ký tự');
    localStorage.setItem('app_pin', pinInput);
    setPinEnabled(true);
    setPinInput('');
    toast.success('Đã cài đặt PIN!');
  };

  const handleRemovePin = () => {
    localStorage.removeItem('app_pin');
    setPinEnabled(false);
    toast.info('Đã xóa PIN');
  };

  const tabs = [
    { id: 'general' as const, label: 'Chung', icon: Globe },
    { id: 'profile' as const, label: 'Hồ Sơ', icon: User },
    { id: 'nutrition' as const, label: 'Dinh Dưỡng', icon: Target },
    { id: 'sleep' as const, label: 'Giấc Ngủ', icon: Moon },
    { id: 'supplements' as const, label: 'Supplements', icon: Pill },
    { id: 'data' as const, label: 'Dữ Liệu', icon: Download },
  ];

  const update = (key: keyof ProfileForm, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="relative max-w-3xl mx-auto px-4 py-8 space-y-6"
      >
        <motion.div variants={fadeUp} className="flex items-center justify-between">
          <h2 className="text-2xl font-bold tracking-tight">Cài Đặt</h2>
          <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={spring}>
            <Button onClick={handleSave} disabled={saving} size="sm" className="rounded-xl gap-1.5">
              {saving ? <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </motion.div>
        </motion.div>

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

        <AnimatePresence mode="wait">
          {activeTab === 'general' && (
            <motion.div key="general" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, duration: 0.4 }} className="space-y-5">
              {/* Theme */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Giao Diện</h3>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: 'light' as ThemeMode, label: 'Sáng', icon: Sun },
                    { value: 'dark' as ThemeMode, label: 'Tối', icon: Moon },
                    { value: 'system' as ThemeMode, label: 'Hệ thống', icon: Monitor },
                  ]).map(opt => (
                    <motion.button
                      key={opt.value}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      onClick={() => appSettings.setTheme(opt.value)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${
                        appSettings.theme === opt.value
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <opt.icon className="w-5 h-5" />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Ngôn Ngữ</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LANGUAGES.map(l => (
                    <motion.button
                      key={l.code}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      onClick={() => appSettings.setLang(l.code)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border transition-all text-left ${
                        appSettings.lang === l.code
                          ? 'bg-primary/10 border-primary text-foreground'
                          : 'bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="text-lg">{l.flag}</span>
                      <span className="text-sm font-medium">{l.label}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Currency */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Tiền Tệ</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CURRENCIES.map(c => (
                    <motion.button
                      key={c.code}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      transition={spring}
                      onClick={() => appSettings.setCurrency(c.code)}
                      className={`flex items-center justify-center gap-1.5 p-3 rounded-xl border transition-all text-sm font-medium ${
                        appSettings.currency === c.code
                          ? 'bg-primary/10 border-primary text-foreground'
                          : 'bg-secondary/30 border-border/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <span className="text-base">{c.symbol}</span>
                      <span>{c.code}</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, duration: 0.4 }} className="space-y-5">
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
                    <Label>Chiều cao ({form.units_height})</Label>
                    <Input type="number" value={form.height_cm} onChange={e => update('height_cm', e.target.value)} className="rounded-xl bg-background/50" />
                  </div>
                  <div className="space-y-2">
                    <Label>Cân nặng ({form.units_weight})</Label>
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

              {/* Units */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Đơn Vị</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cân nặng</Label>
                    <Select value={form.units_weight} onValueChange={v => update('units_weight', v)}>
                      <SelectTrigger className="rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">Kilogram (kg)</SelectItem>
                        <SelectItem value="lb">Pound (lb)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Chiều cao</Label>
                    <Select value={form.units_height} onValueChange={v => update('units_height', v)}>
                      <SelectTrigger className="rounded-xl bg-background/50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cm">Centimeter (cm)</SelectItem>
                        <SelectItem value="in">Inch (in)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'nutrition' && (
            <motion.div key="nutrition" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, duration: 0.4 }} className="space-y-5">
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

              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Mục Tiêu Nước Uống</h3>
                <div className="space-y-2">
                  <Label>Mục tiêu mỗi ngày (ml)</Label>
                  <Input type="number" step="250" min="500" max="6000" value={form.water_target_ml} onChange={e => update('water_target_ml', e.target.value)} className="rounded-xl bg-background/50 text-2xl font-mono font-bold h-14" />
                  <p className="text-xs text-muted-foreground">Khuyến nghị: 30-35ml × cân nặng ({form.units_weight}) = {Math.round(Number(form.weight_kg) * 33)}ml</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sleep' && (
            <motion.div key="sleep" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, duration: 0.4 }} className="space-y-5">
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
            <motion.div key="supplements" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, duration: 0.4 }} className="space-y-5">
              <div className="metric-card space-y-5 relative">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Supplement Stack</h3>
                  <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={spring}>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setShowAddSup(!showAddSup)}>
                      <Plus className="w-3 h-3 mr-1.5" />Thêm
                    </Button>
                  </motion.div>
                </div>

                <AnimatePresence>
                  {showAddSup && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ ...spring, duration: 0.3 }} className="overflow-hidden">
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
                          onClick={() => { deleteSupplement.mutate(sup.id); toast.success('Đã xóa supplement'); }}
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

          {activeTab === 'data' && (
            <motion.div key="data" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ ...spring, duration: 0.4 }} className="space-y-5">
              {/* Export */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Xuất Dữ Liệu</h3>
                <p className="text-sm text-muted-foreground">Tải xuống toàn bộ dữ liệu cân nặng, dinh dưỡng, tập luyện, giấc ngủ.</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="rounded-xl flex-1" onClick={() => exportData('json')}>
                    <Download className="w-4 h-4 mr-2" />Export JSON
                  </Button>
                  <Button variant="outline" className="rounded-xl flex-1" onClick={() => exportData('csv')}>
                    <Download className="w-4 h-4 mr-2" />Export CSV
                  </Button>
                </div>
              </div>

              {/* PIN Lock */}
              <div className="metric-card space-y-5 relative">
                <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Privacy Lock</h3>
                {pinEnabled ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 bg-primary/10 rounded-xl p-4">
                      <Lock className="w-5 h-5 text-primary" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">PIN đã được cài đặt</p>
                        <p className="text-xs text-muted-foreground">Ứng dụng sẽ yêu cầu PIN khi mở lại</p>
                      </div>
                    </div>
                    <Button variant="destructive" size="sm" className="rounded-xl" onClick={handleRemovePin}>Xóa PIN</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">Cài đặt PIN để bảo vệ dữ liệu cá nhân.</p>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Nhập PIN (≥4 ký tự)"
                        value={pinInput}
                        onChange={e => setPinInput(e.target.value)}
                        className="rounded-xl bg-background/50 flex-1"
                        maxLength={8}
                      />
                      <Button size="sm" className="rounded-xl" onClick={handleSetPin}>
                        <Lock className="w-3 h-3 mr-1" />Cài đặt
                      </Button>
                    </div>
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

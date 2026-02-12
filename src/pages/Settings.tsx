import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Target, Moon, Pill, Plus, Trash2, Save, Check, Download,
  Lock, Scale, Globe, Sun, Monitor, ChevronRight, LogOut, Droplets,
  Utensils, Languages, Palette, DollarSign, Ruler, BedDouble
} from 'lucide-react';
import { useAppSettings, type ThemeMode } from '@/hooks/useAppSettings';
import { LANGUAGES, CURRENCIES, t } from '@/lib/i18n';
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

type SectionKey = 'profile' | 'theme' | 'language' | 'currency' | 'units' | 'nutrition' | 'sleep' | 'water' | 'supplements' | 'export' | 'pin';

const Settings = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: supplements, isLoading: suppLoading } = useSupplements();
  const addSupplement = useAddSupplement();
  const deleteSupplement = useDeleteSupplement();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const appSettings = useAppSettings();
  const i18n = t(appSettings.lang);

  const [form, setForm] = useState<ProfileForm>({
    name: '', dob: '', sex: 'other', height_cm: '170', weight_kg: '70',
    activity_level: 'moderate', goal: 'maintain', tdee_target_kcal: '2200',
    macro_protein_g: '150', macro_carbs_g: '250', macro_fat_g: '70', macro_fiber_g: '30',
    sleep_target_hours: '8', sleep_target_bedtime: '23:00', sleep_target_waketime: '07:00',
    water_target_ml: '2500', units_weight: 'kg', units_height: 'cm',
  });
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<SectionKey | null>(null);
  const [newSup, setNewSup] = useState({ name: '', category: 'vitamin', dose_text: '', timing: 'morning', notes: '' });
  const [showAddSup, setShowAddSup] = useState(false);
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-muted-foreground">{i18n.loading}</motion.div>
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;

  const toggle = (key: SectionKey) => setExpanded(prev => prev === key ? null : key);
  const update = (key: keyof ProfileForm, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      name: form.name, dob: form.dob || null, sex: form.sex,
      height_cm: Number(form.height_cm), weight_kg: Number(form.weight_kg),
      activity_level: form.activity_level, goal: form.goal,
      tdee_target_kcal: Number(form.tdee_target_kcal),
      macro_protein_g: Number(form.macro_protein_g), macro_carbs_g: Number(form.macro_carbs_g),
      macro_fat_g: Number(form.macro_fat_g), macro_fiber_g: Number(form.macro_fiber_g),
      sleep_target_hours: Number(form.sleep_target_hours),
      sleep_target_bedtime: form.sleep_target_bedtime, sleep_target_waketime: form.sleep_target_waketime,
      water_target_ml: Number(form.water_target_ml),
      units_weight: form.units_weight, units_height: form.units_height,
    }).eq('user_id', user.id);
    if (error) toast.error(i18n.settingsErrorSaving + ': ' + error.message);
    else { toast.success(i18n.settingsSavedSuccess); queryClient.invalidateQueries({ queryKey: ['profile', user.id] }); }
    setSaving(false);
  };

  const handleAddSupplement = async () => {
    if (!newSup.name.trim()) return toast.error(i18n.settingsSupNameEmpty);
    await addSupplement.mutateAsync(newSup);
    setNewSup({ name: '', category: 'vitamin', dose_text: '', timing: 'morning', notes: '' });
    setShowAddSup(false);
    toast.success(i18n.settingsSupAdded);
  };

  const exportData = async (format: 'csv' | 'json') => {
    const tables = ['weight_logs', 'daily_logs', 'meal_entries', 'workout_sessions', 'sleep_logs'] as const;
    const allData: Record<string, any[]> = {};
    for (const table of tables) {
      const { data } = await supabase.from(table).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(500);
      allData[table] = data ?? [];
    }
    let content: string, filename: string, mimeType: string;
    if (format === 'json') {
      content = JSON.stringify(allData, null, 2);
      filename = `fitness-os-export-${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
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
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    toast.success(`${i18n.settingsExported} ${format.toUpperCase()}!`);
  };

  const handleSetPin = () => {
    if (pinInput.length < 4) return toast.error(i18n.settingsPinMinLength);
    localStorage.setItem('app_pin', pinInput);
    setPinEnabled(true); setPinInput('');
    toast.success(i18n.settingsPinDone);
  };

  const handleRemovePin = () => {
    localStorage.removeItem('app_pin');
    setPinEnabled(false);
    toast.info(i18n.settingsPinRemoved);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  // Row component
  const SettingsRow = ({ icon: Icon, label, sectionKey, subtitle }: { icon: any; label: string; sectionKey: SectionKey; subtitle?: string }) => {
    const isOpen = expanded === sectionKey;
    return (
      <motion.button
        onClick={() => toggle(sectionKey)}
        className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-secondary/40 transition-colors"
        whileTap={{ scale: 0.98 }}
        transition={spring}
      >
        <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 90 : 0 }}
          transition={spring}
        >
          <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
        </motion.div>
      </motion.button>
    );
  };

  const Divider = () => <div className="h-px bg-border/30 mx-4" />;

  const SectionPanel = ({ children, sectionKey }: { children: React.ReactNode; sectionKey: SectionKey }) => (
    <AnimatePresence>
      {expanded === sectionKey && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ ...spring, duration: 0.35 }}
          className="overflow-hidden"
        >
          <div className="px-4 pb-4 pt-1 space-y-3">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, duration: 0.5 }}
        className="relative max-w-lg mx-auto px-4 pt-6 pb-28 space-y-5"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">{i18n.settingsTitle}</h2>
          <motion.div whileTap={{ scale: 0.95 }} transition={spring}>
            <Button onClick={handleSave} disabled={saving} size="sm" className="rounded-xl gap-1.5">
              {saving ? <div className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? i18n.saving : i18n.save}
            </Button>
          </motion.div>
        </div>

        {/* Account Section */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground px-1 mb-2">{i18n.settingsProfile}</p>
          <div className="rounded-2xl bg-card/60 border border-border/30 overflow-hidden backdrop-blur-sm">
            <SettingsRow icon={User} label={i18n.settingsPersonalInfo} sectionKey="profile" subtitle={form.name || user.email} />
            <SectionPanel sectionKey="profile">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsName}</Label>
                  <Input value={form.name} onChange={e => update('name', e.target.value)} className="rounded-xl bg-background/50 h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsDob}</Label>
                  <Input type="date" value={form.dob} onChange={e => update('dob', e.target.value)} className="rounded-xl bg-background/50 h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsSex}</Label>
                  <Select value={form.sex} onValueChange={v => update('sex', v)}>
                    <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">{i18n.settingsSexMale}</SelectItem>
                      <SelectItem value="female">{i18n.settingsSexFemale}</SelectItem>
                      <SelectItem value="other">{i18n.settingsSexOther}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsActivityLevel}</Label>
                  <Select value={form.activity_level} onValueChange={v => update('activity_level', v)}>
                    <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">{i18n.activitySedentary}</SelectItem>
                      <SelectItem value="light">{i18n.activityLight}</SelectItem>
                      <SelectItem value="moderate">{i18n.activityModerate}</SelectItem>
                      <SelectItem value="high">{i18n.activityHigh}</SelectItem>
                      <SelectItem value="athlete">{i18n.activityAthlete}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsHeight} ({form.units_height})</Label>
                  <Input type="number" value={form.height_cm} onChange={e => update('height_cm', e.target.value)} className="rounded-xl bg-background/50 h-9 text-sm font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsWeight} ({form.units_weight})</Label>
                  <Input type="number" value={form.weight_kg} onChange={e => update('weight_kg', e.target.value)} className="rounded-xl bg-background/50 h-9 text-sm font-mono" />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">{i18n.settingsGoal}</Label>
                  <Select value={form.goal} onValueChange={v => update('goal', v)}>
                    <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bulk">{i18n.goalBulk}</SelectItem>
                      <SelectItem value="cut">{i18n.goalCut}</SelectItem>
                      <SelectItem value="maintain">{i18n.goalMaintain}</SelectItem>
                      <SelectItem value="recomp">{i18n.goalRecomp}</SelectItem>
                      <SelectItem value="strength">{i18n.goalStrength}</SelectItem>
                      <SelectItem value="endurance">{i18n.goalEndurance}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={Ruler} label={i18n.settingsUnits} sectionKey="units" subtitle={`${form.units_weight} / ${form.units_height}`} />
            <SectionPanel sectionKey="units">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsWeight}</Label>
                  <Select value={form.units_weight} onValueChange={v => update('units_weight', v)}>
                    <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">Kilogram (kg)</SelectItem>
                      <SelectItem value="lb">Pound (lb)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsHeight}</Label>
                  <Select value={form.units_height} onValueChange={v => update('units_height', v)}>
                    <SelectTrigger className="rounded-xl bg-background/50 h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cm">Centimeter (cm)</SelectItem>
                      <SelectItem value="in">Inch (in)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </SectionPanel>
          </div>
        </div>

        {/* Preferences Section */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground px-1 mb-2">{i18n.settingsGeneral}</p>
          <div className="rounded-2xl bg-card/60 border border-border/30 overflow-hidden backdrop-blur-sm">
            <SettingsRow icon={Palette} label={i18n.settingsTheme} sectionKey="theme" subtitle={appSettings.theme === 'dark' ? i18n.settingsThemeDark : appSettings.theme === 'light' ? i18n.settingsThemeLight : i18n.settingsThemeSystem} />
            <SectionPanel sectionKey="theme">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'light' as ThemeMode, label: i18n.settingsThemeLight, icon: Sun },
                  { value: 'dark' as ThemeMode, label: i18n.settingsThemeDark, icon: Moon },
                  { value: 'system' as ThemeMode, label: i18n.settingsThemeSystem, icon: Monitor },
                ]).map(opt => (
                  <motion.button
                    key={opt.value}
                    whileTap={{ scale: 0.95 }}
                    transition={spring}
                    onClick={() => appSettings.setTheme(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-xs font-medium ${
                      appSettings.theme === opt.value
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-secondary/30 border-border/40 text-muted-foreground'
                    }`}
                  >
                    <opt.icon className="w-4 h-4" />
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={Languages} label={i18n.settingsLanguage} sectionKey="language" subtitle={LANGUAGES.find(l => l.code === appSettings.lang)?.label} />
            <SectionPanel sectionKey="language">
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map(l => (
                  <motion.button
                    key={l.code}
                    whileTap={{ scale: 0.95 }}
                    transition={spring}
                    onClick={() => appSettings.setLang(l.code)}
                    className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left text-sm ${
                      appSettings.lang === l.code
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-secondary/30 border-border/40 text-muted-foreground'
                    }`}
                  >
                    <span className="text-base">{l.flag}</span>
                    <span className="font-medium text-xs">{l.label}</span>
                  </motion.button>
                ))}
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={DollarSign} label={i18n.settingsCurrency} sectionKey="currency" subtitle={appSettings.currency} />
            <SectionPanel sectionKey="currency">
              <div className="grid grid-cols-3 gap-2">
                {CURRENCIES.map(c => (
                  <motion.button
                    key={c.code}
                    whileTap={{ scale: 0.95 }}
                    transition={spring}
                    onClick={() => appSettings.setCurrency(c.code)}
                    className={`flex items-center justify-center gap-1 p-2.5 rounded-xl border transition-all text-xs font-medium ${
                      appSettings.currency === c.code
                        ? 'bg-primary/10 border-primary text-foreground'
                        : 'bg-secondary/30 border-border/40 text-muted-foreground'
                    }`}
                  >
                    <span className="text-sm">{c.symbol}</span>
                    <span>{c.code}</span>
                  </motion.button>
                ))}
              </div>
            </SectionPanel>
          </div>
        </div>

        {/* Goals & Tracking */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground px-1 mb-2">{i18n.settingsNutrition} & {i18n.settingsSleep}</p>
          <div className="rounded-2xl bg-card/60 border border-border/30 overflow-hidden backdrop-blur-sm">
            <SettingsRow icon={Utensils} label={i18n.settingsCaloriesMacros} sectionKey="nutrition" subtitle={`${form.tdee_target_kcal} kcal`} />
            <SectionPanel sectionKey="nutrition">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">TDEE Target (kcal)</Label>
                  <Input type="number" value={form.tdee_target_kcal} onChange={e => update('tdee_target_kcal', e.target.value)} className="rounded-xl bg-background/50 font-mono text-lg font-bold h-11" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'macro_protein_g' as const, label: 'Protein (g)', color: 'text-readiness-green' },
                    { key: 'macro_carbs_g' as const, label: 'Carbs (g)', color: 'text-metric-blue' },
                    { key: 'macro_fat_g' as const, label: 'Fat (g)', color: 'text-readiness-yellow' },
                    { key: 'macro_fiber_g' as const, label: 'Fiber (g)', color: 'text-muted-foreground' },
                  ].map(macro => (
                    <div key={macro.key} className="space-y-1.5">
                      <Label className={`text-xs ${macro.color}`}>{macro.label}</Label>
                      <Input type="number" value={form[macro.key]} onChange={e => update(macro.key, e.target.value)} className="rounded-xl bg-background/50 font-mono h-9 text-sm" />
                    </div>
                  ))}
                </div>
                <div className="bg-secondary/30 rounded-xl p-3">
                  <div className="flex h-2.5 rounded-full overflow-hidden">
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
                  <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                    <span className="text-readiness-green">P {Math.round((Number(form.macro_protein_g) * 4 / (Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9 || 1)) * 100)}%</span>
                    <span className="text-metric-blue">C {Math.round((Number(form.macro_carbs_g) * 4 / (Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9 || 1)) * 100)}%</span>
                    <span className="text-readiness-yellow">F {Math.round((Number(form.macro_fat_g) * 9 / (Number(form.macro_protein_g) * 4 + Number(form.macro_carbs_g) * 4 + Number(form.macro_fat_g) * 9 || 1)) * 100)}%</span>
                  </div>
                </div>
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={BedDouble} label={i18n.settingsSleepTarget} sectionKey="sleep" subtitle={`${form.sleep_target_bedtime} → ${form.sleep_target_waketime}`} />
            <SectionPanel sectionKey="sleep">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsSleepHours}</Label>
                  <Input type="number" step="0.5" min="4" max="12" value={form.sleep_target_hours} onChange={e => update('sleep_target_hours', e.target.value)} className="rounded-xl bg-background/50 font-mono h-9 text-sm font-bold" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsBedtime}</Label>
                  <Input type="time" value={form.sleep_target_bedtime} onChange={e => update('sleep_target_bedtime', e.target.value)} className="rounded-xl bg-background/50 font-mono h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{i18n.settingsWakeTime}</Label>
                  <Input type="time" value={form.sleep_target_waketime} onChange={e => update('sleep_target_waketime', e.target.value)} className="rounded-xl bg-background/50 font-mono h-9 text-sm" />
                </div>
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={Droplets} label={i18n.settingsWaterTarget} sectionKey="water" subtitle={`${form.water_target_ml} ml`} />
            <SectionPanel sectionKey="water">
              <div className="space-y-1.5">
                <Label className="text-xs">{i18n.target} (ml)</Label>
                <Input type="number" step="250" min="500" max="6000" value={form.water_target_ml} onChange={e => update('water_target_ml', e.target.value)} className="rounded-xl bg-background/50 font-mono h-9 text-sm" />
                <p className="text-[11px] text-muted-foreground">{i18n.settingsWaterRecommend} = {Math.round(Number(form.weight_kg) * 33)}ml</p>
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={Pill} label={i18n.settingsSupplements} sectionKey="supplements" subtitle={supplements ? `${supplements.length} items` : ''} />
            <SectionPanel sectionKey="supplements">
              <div className="space-y-2.5">
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" className="rounded-xl h-8 text-xs" onClick={() => setShowAddSup(!showAddSup)}>
                    <Plus className="w-3 h-3 mr-1" />{i18n.add}
                  </Button>
                </div>

                <AnimatePresence>
                  {showAddSup && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ ...spring, duration: 0.3 }} className="overflow-hidden">
                      <div className="bg-secondary/30 rounded-xl p-3 space-y-2.5">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[10px]">{i18n.supplementsName}</Label>
                            <Input value={newSup.name} onChange={e => setNewSup(s => ({ ...s, name: e.target.value }))} placeholder="Creatine" className="rounded-xl bg-background/50 h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">{i18n.supplementsDose}</Label>
                            <Input value={newSup.dose_text} onChange={e => setNewSup(s => ({ ...s, dose_text: e.target.value }))} placeholder="5g" className="rounded-xl bg-background/50 h-8 text-xs" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">{i18n.supplementsCategory}</Label>
                            <Select value={newSup.category} onValueChange={v => setNewSup(s => ({ ...s, category: v }))}>
                              <SelectTrigger className="rounded-xl bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vitamin">{i18n.supplementsCatVitamin}</SelectItem>
                                <SelectItem value="mineral">{i18n.supplementsCatMineral}</SelectItem>
                                <SelectItem value="performance">{i18n.supplementsCatPerformance}</SelectItem>
                                <SelectItem value="recovery">{i18n.supplementsCatRecovery}</SelectItem>
                                <SelectItem value="health">{i18n.supplementsCatHealth}</SelectItem>
                                <SelectItem value="other">{i18n.supplementsCatOther}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">{i18n.supplementsTiming}</Label>
                            <Select value={newSup.timing} onValueChange={v => setNewSup(s => ({ ...s, timing: v }))}>
                              <SelectTrigger className="rounded-xl bg-background/50 h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="morning">{i18n.supplementsTimMorning}</SelectItem>
                                <SelectItem value="pre_workout">{i18n.supplementsTimPreWorkout}</SelectItem>
                                <SelectItem value="post_workout">{i18n.supplementsTimPostWorkout}</SelectItem>
                                <SelectItem value="evening">{i18n.supplementsTimEvening}</SelectItem>
                                <SelectItem value="with_meal">{i18n.supplementsTimWithMeal}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-xl h-7 text-xs" onClick={handleAddSupplement} disabled={addSupplement.isPending}>
                            <Check className="w-3 h-3 mr-1" />{i18n.add}
                          </Button>
                          <Button variant="ghost" size="sm" className="rounded-xl h-7 text-xs" onClick={() => setShowAddSup(false)}>{i18n.cancel}</Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {suppLoading ? (
                  <p className="text-xs text-muted-foreground text-center py-4">{i18n.loading}</p>
                ) : supplements && supplements.length > 0 ? (
                  <div className="space-y-1.5">
                    {supplements.map((sup) => (
                      <div key={sup.id} className="flex items-center justify-between bg-secondary/20 rounded-xl p-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Pill className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{sup.name}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {sup.dose_text && <span>{sup.dose_text} · </span>}
                              <span className="capitalize">{sup.timing?.replace('_', ' ')}</span>
                            </div>
                          </div>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          onClick={() => { deleteSupplement.mutate(sup.id); toast.success(i18n.settingsSupDeleted); }}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground active:text-destructive active:bg-destructive/10 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </motion.button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{i18n.settingsNoSup}</p>
                )}
              </div>
            </SectionPanel>
          </div>
        </div>

        {/* Data & Security */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground px-1 mb-2">{i18n.settingsData}</p>
          <div className="rounded-2xl bg-card/60 border border-border/30 overflow-hidden backdrop-blur-sm">
            <SettingsRow icon={Download} label={i18n.settingsExportData} sectionKey="export" />
            <SectionPanel sectionKey="export">
              <p className="text-xs text-muted-foreground mb-2">{i18n.settingsExportDesc}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="rounded-xl flex-1 h-9 text-xs" onClick={() => exportData('json')}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />JSON
                </Button>
                <Button variant="outline" className="rounded-xl flex-1 h-9 text-xs" onClick={() => exportData('csv')}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />CSV
                </Button>
              </div>
            </SectionPanel>

            <Divider />
            <SettingsRow icon={Lock} label={i18n.settingsPrivacyLock} sectionKey="pin" subtitle={pinEnabled ? i18n.settingsPinSet : undefined} />
            <SectionPanel sectionKey="pin">
              {pinEnabled ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 bg-primary/10 rounded-xl p-3">
                    <Lock className="w-4 h-4 text-primary" />
                    <p className="text-xs font-medium flex-1">{i18n.settingsPinSet}</p>
                  </div>
                  <Button variant="destructive" size="sm" className="rounded-xl h-8 text-xs" onClick={handleRemovePin}>{i18n.settingsPinRemove}</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{i18n.settingsPinSetupDesc}</p>
                  <div className="flex gap-2">
                    <Input type="password" placeholder={i18n.settingsPinPlaceholder} value={pinInput} onChange={e => setPinInput(e.target.value)} className="rounded-xl bg-background/50 flex-1 h-9 text-sm" maxLength={8} />
                    <Button size="sm" className="rounded-xl h-9 text-xs" onClick={handleSetPin}>
                      <Lock className="w-3 h-3 mr-1" />{i18n.settingsPinInstall}
                    </Button>
                  </div>
                </div>
              )}
            </SectionPanel>
          </div>
        </div>

        {/* Sign Out */}
        <div>
          <div className="rounded-2xl bg-card/60 border border-border/30 overflow-hidden backdrop-blur-sm">
            <motion.button
              onClick={handleSignOut}
              whileTap={{ scale: 0.98 }}
              transition={spring}
              className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left active:bg-destructive/10 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4 text-destructive" />
              </div>
              <span className="text-sm font-medium text-destructive">{i18n.settingsLogout}</span>
            </motion.button>
          </div>
        </div>
      </motion.main>
    </div>
  );
};

export default Settings;

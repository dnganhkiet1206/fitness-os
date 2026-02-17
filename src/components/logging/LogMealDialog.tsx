import { useState } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle, ResponsiveDialogDescription, ResponsiveDialogTrigger } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X, Camera, Beef, Wheat, Droplets, Flame, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ScanFoodDialog, { type ScannedFoodItem } from './ScanFoodDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { recomputeDailyLog } from '@/lib/daily-log-service';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t } from '@/lib/i18n';

interface MealItem {
  food_item_id: string | null;
  food_name: string;
  servings: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  serving_g: number;
}

export default function LogMealDialog({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const T = t(lang);
  const invalidate = useInvalidateToday();
  const [open, setOpen] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [items, setItems] = useState<MealItem[]>([]);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: foodItems } = useQuery({
    queryKey: ['food_items', search],
    enabled: open,
    queryFn: async () => {
      let query = supabase.from('food_items').select('*').order('name');
      if (search) query = query.ilike('name', `%${search}%`);
      const { data } = await query.limit(20);
      return data ?? [];
    },
  });

  const addFood = (food: any) => {
    setItems(prev => [...prev, {
      food_item_id: food.id,
      food_name: food.name,
      servings: 1,
      kcal: Number(food.kcal),
      protein_g: Number(food.protein_g),
      carbs_g: Number(food.carbs_g),
      fat_g: Number(food.fat_g),
      fiber_g: Number(food.fiber_g),
      serving_g: Number(food.serving_g),
    }]);
    setSearch('');
  };

  const handleScannedFoods = (scannedItems: ScannedFoodItem[]) => {
    const newItems: MealItem[] = scannedItems.map(item => ({
      food_item_id: null,
      food_name: item.food_name,
      servings: 1,
      kcal: item.kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      serving_g: item.serving_g,
    }));
    setItems(prev => [...prev, ...newItems]);
  };

  const updateServings = (idx: number, servings: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, servings } : item));
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const totals = items.reduce((acc, item) => ({
    kcal: acc.kcal + item.kcal * item.servings,
    protein_g: acc.protein_g + item.protein_g * item.servings,
    carbs_g: acc.carbs_g + item.carbs_g * item.servings,
    fat_g: acc.fat_g + item.fat_g * item.servings,
    fiber_g: acc.fiber_g + item.fiber_g * item.servings,
  }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

  const totalMacroG = totals.protein_g + totals.carbs_g + totals.fat_g;
  const proteinPct = totalMacroG > 0 ? Math.round((totals.protein_g / totalMacroG) * 100) : 0;
  const carbsPct = totalMacroG > 0 ? Math.round((totals.carbs_g / totalMacroG) * 100) : 0;
  const fatPct = totalMacroG > 0 ? 100 - proteinPct - carbsPct : 0;

  const handleSave = async () => {
    if (!user || items.length === 0) return;
    setSaving(true);
    try {
      const { data: mealEntry, error: mealError } = await supabase
        .from('meal_entries')
        .insert({
          user_id: user.id,
          meal_type: mealType,
          total_kcal: Math.round(totals.kcal),
          total_protein_g: Math.round(totals.protein_g),
          total_carbs_g: Math.round(totals.carbs_g),
          total_fat_g: Math.round(totals.fat_g),
          total_fiber_g: Math.round(totals.fiber_g),
        })
        .select('id')
        .single();

      if (mealError) throw mealError;

      const mealItems = items.map(item => ({
        meal_entry_id: mealEntry.id,
        food_item_id: item.food_item_id,
        food_name: item.food_name,
        servings: item.servings,
        kcal: Math.round(item.kcal * item.servings),
        protein_g: Math.round(item.protein_g * item.servings),
        carbs_g: Math.round(item.carbs_g * item.servings),
        fat_g: Math.round(item.fat_g * item.servings),
        fiber_g: Math.round(item.fiber_g * item.servings),
      }));

      await supabase.from('meal_entry_items').insert(mealItems);

      const dateStr = new Date().toISOString().split('T')[0];
      await recomputeDailyLog(user.id, dateStr);
      invalidate();
      toast.success(T.logMealSaved);
      setOpen(false);
      setItems([]);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const mealTypes = [
    { value: 'breakfast', label: T.mealBreakfast },
    { value: 'lunch', label: T.mealLunch },
    { value: 'dinner', label: T.mealDinner },
    { value: 'snack', label: T.mealSnack },
    { value: 'preworkout', label: T.mealPreWorkout },
    { value: 'postworkout', label: T.mealPostWorkout },
  ];

  return (
    <ResponsiveDialog open={open} onOpenChange={setOpen}>
      <ResponsiveDialogTrigger asChild>{children}</ResponsiveDialogTrigger>
      <ResponsiveDialogContent className="max-w-md rounded-3xl border-border/30">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="text-lg font-bold">{T.logMealTitle}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <ResponsiveDialogDescription className="sr-only">{T.logMealTitle}</ResponsiveDialogDescription>

        <div className="space-y-5">
          {/* Meal type */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logMealType}</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger className="rounded-xl bg-secondary/30 border-border/20 h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mealTypes.map(mt => <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Food search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logMealSearchFood}</Label>
              <ScanFoodDialog onFoodsScanned={handleScannedFoods}>
                <Button variant="outline" size="sm" className="rounded-xl gap-1.5 h-7 text-xs border-border/20">
                  <Camera className="w-3.5 h-3.5" />
                  {T.scanFoodTitle}
                </Button>
              </ScanFoodDialog>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={T.logMealSearchPlaceholder}
                className="pl-9 rounded-xl bg-secondary/30 border-border/20 h-11"
              />
            </div>
            <AnimatePresence>
              {search && foodItems && foodItems.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border border-border/20 rounded-2xl overflow-hidden"
                >
                  <div className="max-h-40 overflow-y-auto">
                    {foodItems.map(f => (
                      <button
                        key={f.id}
                        onClick={() => addFood(f)}
                        className="w-full text-left px-4 py-2.5 hover:bg-secondary/40 active:bg-secondary/60 transition-colors text-sm flex justify-between items-center border-b border-border/10 last:border-0"
                      >
                        <div>
                          <span className="font-medium">{f.name}</span>
                          {f.brand && <span className="text-muted-foreground ml-1 text-xs">({f.brand})</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{f.kcal}kcal</span>
                          <Plus className="w-3.5 h-3.5 text-primary" />
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Added items */}
          <AnimatePresence>
            {items.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2"
              >
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.logMealAdded}</Label>
                {items.map((item, idx) => (
                  <motion.div
                    key={`${item.food_name}-${idx}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20, height: 0 }}
                    className="flex items-center gap-2 bg-secondary/20 rounded-xl p-3 border border-border/10"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.food_name}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {Math.round(item.kcal * item.servings)}kcal · P{Math.round(item.protein_g * item.servings)} · C{Math.round(item.carbs_g * item.servings)} · F{Math.round(item.fat_g * item.servings)}
                      </p>
                    </div>
                    <Input
                      type="number"
                      value={item.servings}
                      onChange={e => updateServings(idx, Number(e.target.value))}
                      className="w-14 h-8 text-center rounded-lg bg-secondary/40 border-border/20 font-mono text-sm"
                      min={0.1}
                      step={0.5}
                    />
                    <motion.button
                      whileTap={{ scale: 0.8 }}
                      onClick={() => removeItem(idx)}
                      className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                    </motion.button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Macro summary card */}
          <AnimatePresence>
            {items.length > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-secondary/20 rounded-2xl p-4 border border-border/10"
              >
                <div className="flex items-center gap-2 mb-3">
                  <Flame className="w-4 h-4 text-[hsl(25,88%,55%)]" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {lang === 'vi' ? 'Tổng dinh dưỡng' : 'Nutrition Total'}
                  </span>
                </div>

                <div className="text-2xl font-bold font-mono mb-3">
                  {Math.round(totals.kcal)} <span className="text-sm font-normal text-muted-foreground">kcal</span>
                </div>

                {/* Macro distribution bar */}
                {totalMacroG > 0 && (
                  <div className="h-2 rounded-full overflow-hidden flex mb-4">
                    <motion.div
                      className="bg-gradient-to-r from-[hsl(38,92%,50%)] to-[hsl(42,90%,62%)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${proteinPct}%` }}
                      transition={{ duration: 0.5 }}
                    />
                    <motion.div
                      className="bg-gradient-to-r from-[hsl(215,80%,58%)] to-[hsl(265,70%,60%)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${carbsPct}%` }}
                      transition={{ duration: 0.5 }}
                    />
                    <motion.div
                      className="bg-gradient-to-r from-[hsl(25,88%,55%)] to-[hsl(0,72%,51%)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${fatPct}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                )}

                {/* Macro grid */}
                <div className="grid grid-cols-3 gap-3">
                  <MacroStat
                    icon={<Beef className="w-3.5 h-3.5" />}
                    label={lang === 'vi' ? 'Protein' : 'Protein'}
                    value={Math.round(totals.protein_g)}
                    pct={proteinPct}
                    gradient="from-[hsl(38,92%,50%)] to-[hsl(42,90%,62%)]"
                  />
                  <MacroStat
                    icon={<Wheat className="w-3.5 h-3.5" />}
                    label={lang === 'vi' ? 'Carbs' : 'Carbs'}
                    value={Math.round(totals.carbs_g)}
                    pct={carbsPct}
                    gradient="from-[hsl(215,80%,58%)] to-[hsl(265,70%,60%)]"
                  />
                  <MacroStat
                    icon={<Droplets className="w-3.5 h-3.5" />}
                    label={lang === 'vi' ? 'Chất béo' : 'Fat'}
                    value={Math.round(totals.fat_g)}
                    pct={fatPct}
                    gradient="from-[hsl(25,88%,55%)] to-[hsl(0,72%,51%)]"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Save */}
          <Button
            onClick={handleSave}
            disabled={saving || items.length === 0}
            className="w-full rounded-xl h-11 font-semibold"
          >
            {saving ? T.saving : T.save}
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function MacroStat({
  icon, label, value, pct, gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  gradient: string;
}) {
  return (
    <div className="bg-secondary/30 rounded-xl p-2.5 space-y-1.5 border border-border/10">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-center font-mono text-base font-bold">{value}g</div>
      <div className="text-center text-[9px] text-muted-foreground">{pct}%</div>
      <div className="h-1 rounded-full bg-secondary/40 overflow-hidden">
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${gradient}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

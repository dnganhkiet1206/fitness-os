import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, X } from 'lucide-react';
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{T.logMealTitle}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{T.logMealType}</Label>
            <Select value={mealType} onValueChange={setMealType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {mealTypes.map(mt => <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Food search */}
          <div className="space-y-2">
            <Label>{T.logMealSearchFood}</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={T.logMealSearchPlaceholder} className="pl-8" />
            </div>
            {search && foodItems && foodItems.length > 0 && (
              <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                {foodItems.map(f => (
                  <button key={f.id} onClick={() => addFood(f)}
                    className="w-full text-left px-3 py-2 hover:bg-secondary/50 text-sm flex justify-between">
                    <span>{f.name} {f.brand ? `(${f.brand})` : ''}</span>
                    <span className="text-muted-foreground">{f.kcal}kcal/{f.serving_g}g</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Added items */}
          {items.length > 0 && (
            <div className="space-y-2">
              <Label>{T.logMealAdded}</Label>
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-secondary/30 rounded-lg p-2">
                  <div className="flex-1 text-sm">{item.food_name}</div>
                  <Input type="number" value={item.servings} onChange={e => updateServings(idx, Number(e.target.value))}
                    className="w-16 h-8 text-center" min={0.1} step={0.5} />
                  <span className="text-xs text-muted-foreground">{T.logMealServings}</span>
                  <button onClick={() => removeItem(idx)}><X className="w-4 h-4 text-muted-foreground" /></button>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          {items.length > 0 && (
            <div className="bg-secondary/50 rounded-lg p-3 text-sm font-mono grid grid-cols-4 gap-2 text-center">
              <div><div className="text-muted-foreground text-[10px]">Kcal</div><div className="font-bold">{Math.round(totals.kcal)}</div></div>
              <div><div className="text-muted-foreground text-[10px]">Protein</div><div className="font-bold">{Math.round(totals.protein_g)}g</div></div>
              <div><div className="text-muted-foreground text-[10px]">Carbs</div><div className="font-bold">{Math.round(totals.carbs_g)}g</div></div>
              <div><div className="text-muted-foreground text-[10px]">Fat</div><div className="font-bold">{Math.round(totals.fat_g)}g</div></div>
            </div>
          )}

          <Button onClick={handleSave} disabled={saving || items.length === 0} className="w-full">
            {saving ? T.saving : T.save}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

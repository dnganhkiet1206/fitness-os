import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/hooks/useAuth';
import { useMealPlanItems, useAddMealPlanItem, useDeleteMealPlanItem, useFoodSearch, useMealPlans } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Plus, Search, Trash2, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const MealPlan = () => {
  const { id } = useParams<{ id: string }>();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const { data: plans } = useMealPlans();
  const plan = plans?.find(p => p.id === id);
  const { data: items } = useMealPlanItems(id || null);
  const addItem = useAddMealPlanItem();
  const deleteItem = useDeleteMealPlanItem();

  const MEAL_TYPES = [
    { value: 'breakfast', label: i18n.mealBreakfast },
    { value: 'lunch', label: i18n.mealLunch },
    { value: 'dinner', label: i18n.mealDinner },
    { value: 'snack', label: i18n.mealSnack },
    { value: 'preworkout', label: i18n.mealPreWorkout },
    { value: 'postworkout', label: i18n.mealPostWorkout },
  ];

  const DAY_LABELS = [i18n.dayMon, i18n.dayTue, i18n.dayWed, i18n.dayThu, i18n.dayFri, i18n.daySat, i18n.daySun];

  const [activeDay, setActiveDay] = useState(0);
  const [addingMeal, setAddingMeal] = useState(false);
  const [mealType, setMealType] = useState('lunch');
  const [search, setSearch] = useState('');
  const { data: searchResults } = useFoodSearch(search, search.length > 1);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const dayItems = items?.filter(i => i.day_index === activeDay) ?? [];

  const addFoodToPlan = async (food: any) => {
    if (!id) return;
    try {
      await addItem.mutateAsync({
        meal_plan_id: id,
        day_index: activeDay,
        meal_type: mealType,
        food_name: food.name,
        serving_g: Number(food.serving_g),
        kcal: Number(food.kcal),
        protein_g: Number(food.protein_g),
        carbs_g: Number(food.carbs_g),
        fat_g: Number(food.fat_g),
        food_item_id: food.id,
      });
      setSearch('');
      setAddingMeal(false);
      toast.success(i18n.mealAdded);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const allItems = items ?? [];
  const shoppingMap = new Map<string, { name: string; total_g: number; count: number }>();
  allItems.forEach(item => {
    const key = item.food_name;
    const existing = shoppingMap.get(key);
    if (existing) {
      existing.total_g += Number(item.serving_g);
      existing.count++;
    } else {
      shoppingMap.set(key, { name: item.food_name, total_g: Number(item.serving_g), count: 1 });
    }
  });

  const dayTotals = dayItems.reduce((acc, i) => ({
    kcal: acc.kcal + Number(i.kcal), protein_g: acc.protein_g + Number(i.protein_g),
    carbs_g: acc.carbs_g + Number(i.carbs_g), fat_g: acc.fat_g + Number(i.fat_g),
  }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  return (
    <div className="bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <PageHeader title={plan?.name || i18n.mealPlanTitle} backTo="/nutrition" />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <Tabs defaultValue="plan">
          <TabsList className="grid grid-cols-2 w-full bg-secondary/40">
            <TabsTrigger value="plan">{i18n.mealPlanPlan}</TabsTrigger>
            <TabsTrigger value="shopping"><ShoppingCart className="w-3.5 h-3.5 mr-1" />{i18n.mealPlanShoppingList}</TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="space-y-4 mt-4">
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {DAY_LABELS.map((label, i) => (
                <button key={i} onClick={() => setActiveDay(i)}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${activeDay === i ? 'bg-primary text-primary-foreground' : 'bg-secondary/40 text-muted-foreground hover:bg-secondary/60'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="glass-card p-3 grid grid-cols-4 gap-2 text-center text-sm">
              <div><span className="text-[10px] text-muted-foreground block">Kcal</span><span className="font-mono font-bold">{Math.round(dayTotals.kcal)}</span></div>
              <div><span className="text-[10px] text-muted-foreground block">Protein</span><span className="font-mono font-bold">{Math.round(dayTotals.protein_g)}g</span></div>
              <div><span className="text-[10px] text-muted-foreground block">Carbs</span><span className="font-mono font-bold">{Math.round(dayTotals.carbs_g)}g</span></div>
              <div><span className="text-[10px] text-muted-foreground block">Fat</span><span className="font-mono font-bold">{Math.round(dayTotals.fat_g)}g</span></div>
            </div>

            {MEAL_TYPES.map(mt => {
              const mealItems = dayItems.filter(i => i.meal_type === mt.value);
              if (mealItems.length === 0) return null;
              return (
                <div key={mt.value} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">{mt.label}</h4>
                  {mealItems.map(item => (
                    <div key={item.id} className="glass-card p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{item.food_name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.kcal} kcal · P{item.protein_g}g · {item.serving_g}g</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteItem.mutate(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              );
            })}

            {addingMeal ? (
              <div className="glass-card p-4 space-y-3">
                <div className="space-y-2">
                  <Label>{i18n.mealType}</Label>
                  <Select value={mealType} onValueChange={setMealType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MEAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={i18n.mealSearchFood} className="pl-9" />
                </div>
                {searchResults && searchResults.length > 0 && (
                  <div className="border border-border rounded-lg max-h-40 overflow-y-auto">
                    {searchResults.map(f => (
                      <button key={f.id} onClick={() => addFoodToPlan(f)} className="w-full text-left px-3 py-2 hover:bg-secondary/50 text-sm flex justify-between">
                        <span>{f.name}</span>
                        <span className="text-muted-foreground text-xs">{f.kcal}kcal/{f.serving_g}g</span>
                      </button>
                    ))}
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => setAddingMeal(false)}>{i18n.cancel}</Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAddingMeal(true)} className="rounded-xl w-full border-dashed">
                <Plus className="w-3.5 h-3.5 mr-1.5" />{i18n.mealAddFood}
              </Button>
            )}
          </TabsContent>

          <TabsContent value="shopping" className="mt-4 space-y-3">
            {shoppingMap.size > 0 ? (
              Array.from(shoppingMap.values()).map((item, i) => (
                <div key={i} className="glass-card p-3 flex items-center justify-between">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{Math.round(item.total_g)}g × {item.count} {i18n.mealTimes}</p>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">{i18n.mealShoppingEmpty}</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default MealPlan;

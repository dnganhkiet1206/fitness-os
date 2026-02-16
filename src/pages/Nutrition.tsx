import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import LargeTitle from '@/components/LargeTitle';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import {
  useFoodSearch, useFavoriteFoods, useRecentFoods, useToggleFavoriteFood,
  useMealPlans, useCreateMealPlan, useDeleteMealPlan,
  useCreateFoodItem, useUpdateFoodItem, useDeleteFoodItem,
} from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Search, Star, Clock, Plus, Utensils, ShoppingCart, Trash2, Heart, Pencil } from 'lucide-react';
import AiMealSuggestButton from '@/components/ai/AiMealSuggestButton';
import FoodItemDialog, { type FoodFormData } from '@/components/nutrition/FoodItemDialog';
import { toast } from 'sonner';
import { useAppSettings, t } from '@/hooks/useAppSettings';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.5 } },
};

const Nutrition = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile } = useProfile();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: searchResults } = useFoodSearch(search, search.length > 0);
  const { data: favorites } = useFavoriteFoods();
  const { data: recent } = useRecentFoods();
  const toggleFav = useToggleFavoriteFood();
  const { data: mealPlans } = useMealPlans();
  const createPlan = useCreateMealPlan();
  const deletePlan = useDeleteMealPlan();
  const createFood = useCreateFoodItem();
  const updateFood = useUpdateFoodItem();
  const deleteFood = useDeleteFoodItem();

  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanGoal, setNewPlanGoal] = useState('maintain');
  const [newPlanMeals, setNewPlanMeals] = useState(3);

  // Food dialog state
  const [foodDialogOpen, setFoodDialogOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<any>(null);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleCreatePlan = async () => {
    if (!newPlanName.trim()) return;
    try {
      const result = await createPlan.mutateAsync({ name: newPlanName, goal: newPlanGoal, meals_per_day: newPlanMeals });
      toast.success(i18n.nutritionCreated);
      setNewPlanOpen(false);
      setNewPlanName('');
      navigate(`/meal-plan/${result.id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSaveFood = async (data: FoodFormData) => {
    try {
      if (editingFood?.id) {
        await updateFood.mutateAsync({ id: editingFood.id, ...data });
        toast.success(i18n.foodUpdated);
      } else {
        await createFood.mutateAsync(data);
        toast.success(i18n.foodAdded);
      }
      setFoodDialogOpen(false);
      setEditingFood(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDeleteFood = async () => {
    if (!editingFood?.id) return;
    try {
      await deleteFood.mutateAsync(editingFood.id);
      toast.success(i18n.foodDeleted);
      setFoodDialogOpen(false);
      setEditingFood(null);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openAddFood = () => {
    setEditingFood(null);
    setFoodDialogOpen(true);
  };

  const openEditFood = (food: any) => {
    setEditingFood(food);
    setFoodDialogOpen(true);
  };

  return (
    <div className="bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(38 92% 50%), transparent 70%)' }} />
      </div>

      <LargeTitle title={i18n.nutritionTitle} />

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }} className="max-w-3xl mx-auto px-4 py-3 space-y-6">
        <Tabs defaultValue="foods" className="w-full">
          <TabsList className="grid grid-cols-3 w-full bg-secondary/40">
            <TabsTrigger value="foods"><Search className="w-3.5 h-3.5 mr-1.5" />{i18n.nutritionFoods}</TabsTrigger>
            <TabsTrigger value="plans"><Utensils className="w-3.5 h-3.5 mr-1.5" />{i18n.nutritionMealPlan}</TabsTrigger>
            <TabsTrigger value="shopping"><ShoppingCart className="w-3.5 h-3.5 mr-1.5" />{i18n.nutritionShopping}</TabsTrigger>
          </TabsList>

          <TabsContent value="foods" className="space-y-5 mt-4">
            {/* Search + Add button */}
            <motion.div variants={fadeUp} className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={i18n.nutritionSearchFood} className="pl-9" />
              </div>
              <Button
                size="sm"
                onClick={openAddFood}
                className="rounded-xl h-10 gap-1.5 shrink-0"
              >
                <Plus className="w-4 h-4" />
                {i18n.foodAddCustom}
              </Button>
            </motion.div>

            {/* AI Suggest */}
            <motion.div variants={fadeUp}>
              <AiMealSuggestButton />
            </motion.div>

            {/* Search Results */}
            {search && searchResults && (
              <motion.div variants={fadeUp} className="space-y-2">
                <p className="text-xs text-muted-foreground">{searchResults.length} {i18n.nutritionResults}</p>
                {searchResults.map(f => (
                  <FoodCard
                    key={f.id}
                    food={f}
                    onToggleFav={() => toggleFav.mutate({ id: f.id, is_favorite: !f.is_favorite })}
                    onEdit={() => openEditFood(f)}
                    isOwned={f.user_id === user.id}
                  />
                ))}
              </motion.div>
            )}

            {/* Favorites */}
            {!search && favorites && favorites.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> {i18n.nutritionFavorites}
                </h3>
                {favorites.map(f => (
                  <FoodCard
                    key={f.id}
                    food={f}
                    onToggleFav={() => toggleFav.mutate({ id: f.id, is_favorite: false })}
                    onEdit={() => openEditFood(f)}
                    isFavorite
                    isOwned={f.user_id === user.id}
                  />
                ))}
              </motion.div>
            )}

            {/* Recent */}
            {!search && recent && recent.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> {i18n.nutritionRecent}
                </h3>
                {recent.map((f, i) => (
                  <div key={i} className="glass-card p-3.5 rounded-2xl">
                    <p className="text-sm font-medium">{f.food_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{f.kcal} kcal · P{f.protein_g}g · C{f.carbs_g}g · F{f.fat_g}g</p>
                  </div>
                ))}
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="plans" className="space-y-5 mt-4">
            <motion.div variants={fadeUp} className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{i18n.nutritionYourPlans}</h3>
              <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl"><Plus className="w-3.5 h-3.5 mr-1" />{i18n.nutritionCreateNew}</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{i18n.nutritionCreatePlan}</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>{i18n.nutritionPlanName}</Label>
                      <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} placeholder="VD: Meal Prep Tuần 1" />
                    </div>
                    <div className="space-y-2">
                      <Label>{i18n.settingsGoal}</Label>
                      <Select value={newPlanGoal} onValueChange={setNewPlanGoal}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bulk">{i18n.goalBulk}</SelectItem>
                          <SelectItem value="cut">{i18n.goalCut}</SelectItem>
                          <SelectItem value="maintain">{i18n.goalMaintain}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{i18n.nutritionMealsPerDay}</Label>
                      <Select value={String(newPlanMeals)} onValueChange={v => setNewPlanMeals(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[3, 4, 5, 6].map(n => <SelectItem key={n} value={String(n)}>{n} {i18n.nutritionMeals}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCreatePlan} disabled={createPlan.isPending} className="w-full">
                      {createPlan.isPending ? i18n.nutritionCreating : i18n.nutritionCreateBtn}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </motion.div>

            {mealPlans && mealPlans.length > 0 ? (
              mealPlans.map(plan => (
                <motion.div key={plan.id} variants={fadeUp} className="glass-card p-4 flex items-center justify-between">
                  <div className="cursor-pointer flex-1" onClick={() => navigate(`/meal-plan/${plan.id}`)}>
                    <p className="font-medium text-sm">{plan.name}</p>
                    <p className="text-xs text-muted-foreground">{plan.meals_per_day} {i18n.nutritionMeals}/{lang === 'vi' ? 'ngày' : 'day'} · {plan.goal}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { deletePlan.mutate(plan.id); toast.success(i18n.deleted); }}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </motion.div>
              ))
            ) : (
              <motion.div variants={fadeUp} className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Utensils className="w-12 h-12 mb-4 opacity-20" />
                <p className="text-sm font-medium">{i18n.nutritionNoPlans}</p>
              </motion.div>
            )}
          </TabsContent>

          <TabsContent value="shopping" className="space-y-5 mt-4">
            <motion.div variants={fadeUp} className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ShoppingCart className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-medium">{i18n.nutritionShoppingEmpty}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{i18n.nutritionShoppingDesc}</p>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.main>

      {/* Food Add/Edit Dialog */}
      <FoodItemDialog
        open={foodDialogOpen}
        onOpenChange={setFoodDialogOpen}
        initialData={editingFood}
        onSave={handleSaveFood}
        onDelete={editingFood?.id ? handleDeleteFood : undefined}
        saving={createFood.isPending || updateFood.isPending}
      />
    </div>
  );
};

// Apple-style food card
function FoodCard({
  food, onToggleFav, onEdit, isFavorite, isOwned,
}: {
  food: any;
  onToggleFav: () => void;
  onEdit: () => void;
  isFavorite?: boolean;
  isOwned: boolean;
}) {
  return (
    <motion.div
      className="glass-card p-3.5 rounded-2xl flex items-center gap-3 active:scale-[0.98] transition-transform"
      whileTap={{ scale: 0.98 }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {food.name}
          {food.brand ? <span className="text-muted-foreground ml-1">({food.brand})</span> : ''}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[11px] font-mono text-metric-orange font-semibold">{food.kcal} kcal</span>
          <span className="text-[10px] text-muted-foreground">P{food.protein_g}g · C{food.carbs_g}g · F{food.fat_g}g</span>
          <span className="text-[10px] text-muted-foreground/50">/ {food.serving_g}g</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isOwned && (
          <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="w-8 h-8 rounded-full" onClick={onToggleFav}>
          <Heart className={`w-4 h-4 ${isFavorite || food.is_favorite ? 'fill-readiness-red text-readiness-red' : 'text-muted-foreground'}`} />
        </Button>
      </div>
    </motion.div>
  );
}

export default Nutrition;

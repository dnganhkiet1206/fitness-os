import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useTodayData';
import { useFoodSearch, useFavoriteFoods, useRecentFoods, useToggleFavoriteFood, useMealPlans, useCreateMealPlan, useDeleteMealPlan } from '@/hooks/useDashboardData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Search, Star, Clock, Plus, Utensils, ShoppingCart, Trash2, Heart } from 'lucide-react';
import { toast } from 'sonner';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { ...spring, duration: 0.5 } },
};

const Nutrition = () => {
  const { user, loading: authLoading } = useAuth();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: searchResults } = useFoodSearch(search, search.length > 0);
  const { data: favorites } = useFavoriteFoods();
  const { data: recent } = useRecentFoods();
  const toggleFav = useToggleFavoriteFood();
  const { data: mealPlans } = useMealPlans();
  const createPlan = useCreateMealPlan();
  const deletePlan = useDeleteMealPlan();
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanGoal, setNewPlanGoal] = useState('maintain');
  const [newPlanMeals, setNewPlanMeals] = useState(3);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const handleCreatePlan = async () => {
    if (!newPlanName.trim()) return;
    try {
      const result = await createPlan.mutateAsync({ name: newPlanName, goal: newPlanGoal, meals_per_day: newPlanMeals });
      toast.success('Đã tạo meal plan!');
      setNewPlanOpen(false);
      setNewPlanName('');
      navigate(`/meal-plan/${result.id}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full opacity-[0.03]" style={{ background: 'radial-gradient(circle, hsl(160 84% 39%), transparent 70%)' }} />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 border-b border-border/50"
        style={{ background: 'hsl(225 15% 6% / 0.7)', backdropFilter: 'blur(24px) saturate(1.5)' }}
      >
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="rounded-xl">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="text-lg font-bold">
            <span className="text-gradient-green">Dinh Dưỡng</span>
          </h1>
        </div>
      </motion.header>

      <motion.main initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08 } } }} className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <Tabs defaultValue="foods" className="w-full">
          <TabsList className="grid grid-cols-3 w-full bg-secondary/40">
            <TabsTrigger value="foods"><Search className="w-3.5 h-3.5 mr-1.5" />Thực phẩm</TabsTrigger>
            <TabsTrigger value="plans"><Utensils className="w-3.5 h-3.5 mr-1.5" />Meal Plan</TabsTrigger>
            <TabsTrigger value="shopping"><ShoppingCart className="w-3.5 h-3.5 mr-1.5" />Đi chợ</TabsTrigger>
          </TabsList>

          {/* FOODS TAB */}
          <TabsContent value="foods" className="space-y-5 mt-4">
            <motion.div variants={fadeUp}>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm thực phẩm..." className="pl-9" />
              </div>
            </motion.div>

            {/* Search results */}
            {search && searchResults && (
              <motion.div variants={fadeUp} className="space-y-2">
                <p className="text-xs text-muted-foreground">{searchResults.length} kết quả</p>
                {searchResults.map(f => (
                  <div key={f.id} className="glass-card p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.name} {f.brand ? <span className="text-muted-foreground">({f.brand})</span> : ''}</p>
                      <p className="text-xs text-muted-foreground">{f.kcal} kcal · P{f.protein_g}g · C{f.carbs_g}g · F{f.fat_g}g / {f.serving_g}g</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleFav.mutate({ id: f.id, is_favorite: !f.is_favorite })}>
                      <Heart className={`w-4 h-4 ${f.is_favorite ? 'fill-readiness-red text-readiness-red' : 'text-muted-foreground'}`} />
                    </Button>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Favorites */}
            {!search && favorites && favorites.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Yêu thích
                </h3>
                {favorites.map(f => (
                  <div key={f.id} className="glass-card p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.kcal} kcal · P{f.protein_g}g · C{f.carbs_g}g · F{f.fat_g}g</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => toggleFav.mutate({ id: f.id, is_favorite: false })}>
                      <Heart className="w-4 h-4 fill-readiness-red text-readiness-red" />
                    </Button>
                  </div>
                ))}
              </motion.div>
            )}

            {/* Recent */}
            {!search && recent && recent.length > 0 && (
              <motion.div variants={fadeUp} className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Gần đây
                </h3>
                {recent.map((f, i) => (
                  <div key={i} className="glass-card p-3">
                    <p className="text-sm font-medium">{f.food_name}</p>
                    <p className="text-xs text-muted-foreground">{f.kcal} kcal · P{f.protein_g}g · C{f.carbs_g}g · F{f.fat_g}g</p>
                  </div>
                ))}
              </motion.div>
            )}
          </TabsContent>

          {/* MEAL PLANS TAB */}
          <TabsContent value="plans" className="space-y-5 mt-4">
            <motion.div variants={fadeUp} className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Meal Plans của bạn</h3>
              <Dialog open={newPlanOpen} onOpenChange={setNewPlanOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="rounded-xl"><Plus className="w-3.5 h-3.5 mr-1" />Tạo mới</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Tạo Meal Plan</DialogTitle></DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Tên plan</Label>
                      <Input value={newPlanName} onChange={e => setNewPlanName(e.target.value)} placeholder="VD: Meal Prep Tuần 1" />
                    </div>
                    <div className="space-y-2">
                      <Label>Mục tiêu</Label>
                      <Select value={newPlanGoal} onValueChange={setNewPlanGoal}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bulk">Tăng cân</SelectItem>
                          <SelectItem value="cut">Giảm cân</SelectItem>
                          <SelectItem value="maintain">Duy trì</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Số bữa/ngày</Label>
                      <Select value={String(newPlanMeals)} onValueChange={v => setNewPlanMeals(Number(v))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[3, 4, 5, 6].map(n => <SelectItem key={n} value={String(n)}>{n} bữa</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCreatePlan} disabled={createPlan.isPending} className="w-full">
                      {createPlan.isPending ? 'Đang tạo...' : 'Tạo Plan'}
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
                    <p className="text-xs text-muted-foreground">{plan.meals_per_day} bữa/ngày · {plan.goal}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { deletePlan.mutate(plan.id); toast.success('Đã xóa'); }}>
                    <Trash2 className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </motion.div>
              ))
            ) : (
              <motion.div variants={fadeUp} className="text-center py-12 text-muted-foreground">
                <Utensils className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chưa có meal plan nào</p>
              </motion.div>
            )}
          </TabsContent>

          {/* SHOPPING LIST TAB */}
          <TabsContent value="shopping" className="space-y-5 mt-4">
            <motion.div variants={fadeUp} className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Tạo meal plan trước để có danh sách đi chợ</p>
              <p className="text-xs mt-1">Shopping list được tạo tự động từ meal plan của bạn</p>
            </motion.div>
          </TabsContent>
        </Tabs>
      </motion.main>
    </div>
  );
};

export default Nutrition;

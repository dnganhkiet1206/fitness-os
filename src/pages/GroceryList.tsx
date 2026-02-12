import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ShoppingCart, Check, DollarSign, Beef } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const CHEAP_PROTEIN: { name: string; protein: string; cost: string }[] = [
  { name: 'Trứng gà', protein: '~13g/2 quả', cost: '~5k/quả' },
  { name: 'Đậu phụ', protein: '~8g/100g', cost: '~3k/miếng' },
  { name: 'Ức gà', protein: '~31g/100g', cost: '~50k/kg' },
  { name: 'Cá ngừ đóng hộp', protein: '~26g/100g', cost: '~25k/lon' },
  { name: 'Đậu lăng', protein: '~9g/100g (nấu)', cost: '~40k/kg' },
  { name: 'Sữa tươi', protein: '~3.4g/100ml', cost: '~15k/lít' },
  { name: 'Đậu nành', protein: '~36g/100g', cost: '~30k/kg' },
  { name: 'Whey protein', protein: '~24g/scoop', cost: '~10k/scoop' },
];

interface GroceryItem {
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  cost: number | null;
}

export default function GroceryList() {
  const { user, loading } = useAuth();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  // Fetch active meal plan items
  const { data: mealPlanItems } = useQuery({
    queryKey: ['grocery-meal-plan', user?.id],
    queryFn: async () => {
      // Get most recent meal plan
      const { data: plans } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!plans || plans.length === 0) return [];

      const { data: items } = await supabase
        .from('meal_plan_items')
        .select('food_name, serving_g, kcal, protein_g, carbs_g, fat_g')
        .eq('meal_plan_id', plans[0].id);

      return items ?? [];
    },
    enabled: !!user,
  });

  // Aggregate into grocery list
  const groceryList = useMemo(() => {
    if (!mealPlanItems || mealPlanItems.length === 0) return [];
    const map = new Map<string, { totalG: number; count: number }>();
    mealPlanItems.forEach(item => {
      const name = item.food_name.toLowerCase().trim();
      const existing = map.get(name) || { totalG: 0, count: 0 };
      map.set(name, { totalG: existing.totalG + (Number(item.serving_g) || 100), count: existing.count + 1 });
    });
    return Array.from(map.entries()).map(([name, data]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      totalG: data.totalG,
      count: data.count,
    }));
  }, [mealPlanItems]);

  const toggleCheck = (name: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary" /> Grocery & Budget
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Danh sách mua sắm từ meal plan & tham khảo protein giá rẻ</p>
      </motion.div>

      {/* Shopping list from meal plan */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="w-4 h-4" /> Shopping List
              {groceryList.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-auto">
                  {checkedItems.size}/{groceryList.length} đã mua
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {groceryList.length > 0 ? (
              <div className="space-y-2">
                {groceryList.map(item => (
                  <motion.div
                    key={item.name}
                    whileTap={{ scale: 0.98 }}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${checkedItems.has(item.name) ? 'bg-primary/5 opacity-60' : 'bg-secondary/30 hover:bg-secondary/50'}`}
                    onClick={() => toggleCheck(item.name)}
                  >
                    <Checkbox checked={checkedItems.has(item.name)} className="pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${checkedItems.has(item.name) ? 'line-through text-muted-foreground' : ''}`}>{item.name}</p>
                      <p className="text-xs text-muted-foreground">{Math.round(item.totalG)}g · {item.count} lần dùng</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <ShoppingCart className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                <p className="text-sm text-muted-foreground">Chưa có meal plan nào.</p>
                <p className="text-xs text-muted-foreground">Tạo meal plan trong Dinh dưỡng để tự động sinh shopping list.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Cheap Protein Quick Reference */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Beef className="w-4 h-4 text-primary" /> Cheap Protein List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {CHEAP_PROTEIN.map(item => (
                <div key={item.name} className="flex items-center justify-between bg-secondary/20 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-primary">{item.protein}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <DollarSign className="w-3 h-3" />{item.cost}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

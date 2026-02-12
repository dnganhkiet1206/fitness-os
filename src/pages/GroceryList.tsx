import { useState, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Check, DollarSign, Beef, Plus, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t, formatPrice, CURRENCIES } from '@/lib/grocery-i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const CATEGORIES = ['Thịt & Cá', 'Rau củ', 'Trái cây', 'Sữa & Trứng', 'Gia vị', 'Đồ khô', 'Đồ uống', 'Supplements', 'Khác'];

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

export default function GroceryList() {
  const { user, loading } = useAuth();
  const queryClient = useQueryClient();
  const { lang, currency } = useAppSettings();
  const i18n = t(lang);
  const currencySymbol = CURRENCIES.find(c => c.code === currency)?.symbol ?? '';

  const [checkedMealItems, setCheckedMealItems] = useState<Set<string>>(new Set());
  const [newItemName, setNewItemName] = useState('');
  const [newItemQty, setNewItemQty] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('Khác');
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch meal plan items
  const { data: mealPlanItems } = useQuery({
    queryKey: ['grocery-meal-plan', user?.id],
    queryFn: async () => {
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

  // Fetch custom grocery items
  const { data: customItems } = useQuery({
    queryKey: ['grocery-custom', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('*')
        .eq('user_id', user!.id)
        .order('category', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Add custom item
  const addItem = useMutation({
    mutationFn: async () => {
      if (!newItemName.trim()) throw new Error(i18n.nameRequired);
      const priceVal = newItemPrice.trim() ? parseFloat(newItemPrice) : null;
      const { error } = await supabase.from('grocery_items').insert({
        user_id: user!.id,
        name: newItemName.trim(),
        quantity: newItemQty.trim(),
        category: newItemCategory,
        price: priceVal,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-custom'] });
      setNewItemName('');
      setNewItemQty('');
      setNewItemPrice('');
      setShowAddForm(false);
      toast.success(i18n.addedToList);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Toggle custom item checked
  const toggleItem = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from('grocery_items').update({ checked }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grocery-custom'] }),
  });

  // Delete custom item
  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('grocery_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-custom'] });
      toast.success(i18n.deleted);
    },
  });

  // Clear all checked items
  const clearChecked = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('user_id', user!.id)
        .eq('checked', true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-custom'] });
      toast.success(i18n.clearedBought);
    },
  });

  // Aggregate meal plan items
  const groceryFromPlan = useMemo(() => {
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

  // Group custom items by category
  const groupedCustom = useMemo(() => {
    if (!customItems) return {};
    const groups: Record<string, typeof customItems> = {};
    customItems.forEach(item => {
      const cat = item.category || 'Khác';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [customItems]);

  const checkedCount = customItems?.filter(i => i.checked).length ?? 0;
  const totalCustom = customItems?.length ?? 0;
  const totalPrice = customItems?.reduce((sum, i) => sum + (Number(i.price) || 0), 0) ?? 0;
  const checkedPrice = customItems?.filter(i => i.checked).reduce((sum, i) => sum + (Number(i.price) || 0), 0) ?? 0;

  const toggleMealCheck = (name: string) => {
    setCheckedMealItems(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const catLabel = (cat: string) => i18n.categories[cat] || cat;

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShoppingCart className="w-6 h-6 text-primary" /> {i18n.title}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{i18n.subtitle}</p>
      </motion.div>

      {/* Custom grocery list */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Check className="w-4 h-4" /> {i18n.shoppingList}
              <span className="text-xs text-muted-foreground font-normal ml-auto flex items-center gap-2">
                {checkedCount}/{totalCustom} {i18n.bought}
                {totalPrice > 0 && (
                  <span className="text-primary font-medium">
                    {checkedPrice > 0 && <>{formatPrice(checkedPrice, currency)} / </>}
                    {formatPrice(totalPrice, currency)}
                  </span>
                )}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add item form */}
            <AnimatePresence>
              {showAddForm ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex flex-col gap-2 p-3 rounded-xl bg-secondary/30 border border-border/30"
                >
                  <div className="flex gap-2">
                    <Input
                      value={newItemName}
                      onChange={e => setNewItemName(e.target.value)}
                      placeholder={i18n.productName}
                      className="rounded-lg bg-background/60 text-sm flex-1"
                      autoFocus
                    />
                    <Input
                      value={newItemQty}
                      onChange={e => setNewItemQty(e.target.value)}
                      placeholder={i18n.quantity}
                      className="rounded-lg bg-background/60 text-sm w-24"
                    />
                    <Input
                      value={newItemPrice}
                      onChange={e => setNewItemPrice(e.target.value)}
                      placeholder={`${i18n.price} (${currencySymbol})`}
                      type="number"
                      className="rounded-lg bg-background/60 text-sm w-28"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                      <SelectTrigger className="rounded-lg bg-background/60 text-sm flex-1 h-9">
                        <SelectValue>{catLabel(newItemCategory)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border z-50">
                        {CATEGORIES.map(c => (
                          <SelectItem key={c} value={c}>{catLabel(c)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" className="rounded-lg" onClick={() => addItem.mutate()} disabled={addItem.isPending}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> {i18n.add}
                    </Button>
                    <Button size="sm" variant="ghost" className="rounded-lg" onClick={() => setShowAddForm(false)}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl border-dashed border-border/60 text-xs flex-1"
                    onClick={() => setShowAddForm(true)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> {i18n.addProduct}
                  </Button>
                  {checkedCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-xl text-xs text-destructive"
                      onClick={() => clearChecked.mutate()}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" /> {i18n.clearBought}
                    </Button>
                  )}
                </div>
              )}
            </AnimatePresence>

            {/* Custom items grouped by category */}
            {Object.keys(groupedCustom).length > 0 ? (
              Object.entries(groupedCustom).map(([cat, items]) => (
                <div key={cat}>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-1.5 mt-3">{catLabel(cat)}</p>
                  <div className="space-y-1">
                    {items.map(item => (
                      <motion.div
                        key={item.id}
                        whileTap={{ scale: 0.98 }}
                        className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${item.checked ? 'bg-primary/5 opacity-60' : 'bg-secondary/30 hover:bg-secondary/50'}`}
                        onClick={() => toggleItem.mutate({ id: item.id, checked: !item.checked })}
                      >
                        <Checkbox checked={item.checked ?? false} className="pointer-events-none" />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${item.checked ? 'line-through text-muted-foreground' : ''}`}>{item.name}</p>
                          <div className="flex items-center gap-2">
                            {item.quantity && <span className="text-xs text-muted-foreground">{item.quantity}</span>}
                            {item.price && <span className="text-xs text-primary font-medium">{formatPrice(Number(item.price), currency)}</span>}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 rounded-lg opacity-40 hover:opacity-100 shrink-0"
                          onClick={(e) => { e.stopPropagation(); deleteItem.mutate(item.id); }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6">
                <p className="text-xs text-muted-foreground">{i18n.noItems}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Shopping list from meal plan */}
      {groceryFromPlan.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}>
          <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="w-4 h-4" /> {i18n.fromMealPlan}
                <span className="text-xs text-muted-foreground font-normal ml-auto">
                  {checkedMealItems.size}/{groceryFromPlan.length} {i18n.bought}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {groceryFromPlan.map(item => (
                  <motion.div
                    key={item.name}
                    whileTap={{ scale: 0.98 }}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${checkedMealItems.has(item.name) ? 'bg-primary/5 opacity-60' : 'bg-secondary/30 hover:bg-secondary/50'}`}
                    onClick={() => toggleMealCheck(item.name)}
                  >
                    <Checkbox checked={checkedMealItems.has(item.name)} className="pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${checkedMealItems.has(item.name) ? 'line-through text-muted-foreground' : ''}`}>{item.name}</p>
                      <p className="text-xs text-muted-foreground">{Math.round(item.totalG)}g · {item.count} {i18n.timesUsed}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Cheap Protein Quick Reference */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
        <Card className="border-border/40 bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Beef className="w-4 h-4 text-primary" /> {i18n.cheapProtein}
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

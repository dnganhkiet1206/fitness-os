import { useState, useEffect } from 'react';
import { ResponsiveDialog, ResponsiveDialogContent, ResponsiveDialogHeader, ResponsiveDialogTitle } from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { Beef, Wheat, Droplets, Flame, Trash2 } from 'lucide-react';
import { useAppSettings, t } from '@/hooks/useAppSettings';

export interface FoodFormData {
  name: string;
  brand: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}

interface FoodItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: FoodFormData & { id?: string };
  onSave: (data: FoodFormData) => void;
  onDelete?: () => void;
  saving?: boolean;
}

const macroColors = {
  protein: 'from-[hsl(38,92%,50%)] to-[hsl(42,90%,62%)]',
  carbs: 'from-[hsl(215,80%,58%)] to-[hsl(265,70%,60%)]',
  fat: 'from-[hsl(25,88%,55%)] to-[hsl(0,72%,51%)]',
};

export default function FoodItemDialog({ open, onOpenChange, initialData, onSave, onDelete, saving }: FoodItemDialogProps) {
  const { lang } = useAppSettings();
  const T = t(lang);
  const isEdit = !!initialData?.id;

  const [form, setForm] = useState<FoodFormData>({
    name: '', brand: '', serving_g: 100, kcal: 0,
    protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0,
  });

  useEffect(() => {
    if (open && initialData) {
      setForm({
        name: initialData.name || '',
        brand: initialData.brand || '',
        serving_g: initialData.serving_g || 100,
        kcal: initialData.kcal || 0,
        protein_g: initialData.protein_g || 0,
        carbs_g: initialData.carbs_g || 0,
        fat_g: initialData.fat_g || 0,
        fiber_g: initialData.fiber_g || 0,
      });
    } else if (open) {
      setForm({ name: '', brand: '', serving_g: 100, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });
    }
  }, [open, initialData]);

  const set = (key: keyof FoodFormData, value: string | number) => {
    setForm(prev => ({ ...prev, [key]: value === '' ? 0 : value }));
  };

  const numVal = (v: number) => v === 0 ? '' : v;

  // Auto-calc kcal from macros
  const calcKcal = Math.round(form.protein_g * 4 + form.carbs_g * 4 + form.fat_g * 9);
  const totalMacroG = form.protein_g + form.carbs_g + form.fat_g;
  const proteinPct = totalMacroG > 0 ? Math.round((form.protein_g / totalMacroG) * 100) : 0;
  const carbsPct = totalMacroG > 0 ? Math.round((form.carbs_g / totalMacroG) * 100) : 0;
  const fatPct = totalMacroG > 0 ? 100 - proteinPct - carbsPct : 0;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-md rounded-3xl border-border/30">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="text-lg font-bold">
            {isEdit ? T.foodEditTitle : T.foodAddTitle}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>

        <div className="space-y-5">
          {/* Name & Brand */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.foodName}</Label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder={T.foodNamePlaceholder}
                className="rounded-xl bg-secondary/30 border-border/20 h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.foodBrand}</Label>
              <Input
                value={form.brand}
                onChange={e => set('brand', e.target.value)}
                placeholder={T.foodBrandPlaceholder}
                className="rounded-xl bg-secondary/30 border-border/20 h-11"
              />
            </div>
          </div>

          {/* Serving size */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">{T.foodServing}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={numVal(form.serving_g)}
                onChange={e => set('serving_g', e.target.value === '' ? '' as any : Number(e.target.value))}
                className="rounded-xl bg-secondary/30 border-border/20 h-11 w-24 text-center font-mono"
                min={1}
              />
              <span className="text-sm text-muted-foreground">g</span>
            </div>
          </div>

          {/* Macro visual ring */}
          <div className="bg-secondary/20 rounded-2xl p-4 border border-border/10">
            <div className="flex items-center gap-2 mb-3">
              <Flame className="w-4 h-4 text-metric-orange" />
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{T.foodCalories}</span>
            </div>

            <div className="flex items-center justify-between mb-4">
              <div className="flex items-baseline gap-1">
                <Input
                  type="number"
                  value={numVal(form.kcal)}
                  onChange={e => set('kcal', e.target.value === '' ? '' as any : Number(e.target.value))}
                  className="rounded-xl bg-secondary/30 border-border/20 h-11 w-24 text-center font-mono text-lg font-bold"
                  min={0}
                />
                <span className="text-xs text-muted-foreground">kcal</span>
              </div>
              <button
                type="button"
                onClick={() => set('kcal', calcKcal)}
                className="text-[10px] px-2.5 py-1 rounded-full bg-secondary/40 text-muted-foreground hover:text-foreground transition-colors"
              >
                {T.foodAutoCalc} ({calcKcal})
              </button>
            </div>

            {/* Macro distribution bar */}
            {totalMacroG > 0 && (
              <div className="h-2 rounded-full overflow-hidden flex mb-3">
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

            {/* Macro inputs */}
            <div className="grid grid-cols-3 gap-3">
              <MacroInput
                icon={<Beef className="w-3.5 h-3.5" />}
                label={T.foodProtein}
                value={form.protein_g}
                onChange={v => set('protein_g', v)}
                pct={proteinPct}
                gradient={macroColors.protein}
              />
              <MacroInput
                icon={<Wheat className="w-3.5 h-3.5" />}
                label={T.foodCarbs}
                value={form.carbs_g}
                onChange={v => set('carbs_g', v)}
                pct={carbsPct}
                gradient={macroColors.carbs}
              />
              <MacroInput
                icon={<Droplets className="w-3.5 h-3.5" />}
                label={T.foodFat}
                value={form.fat_g}
                onChange={v => set('fat_g', v)}
                pct={fatPct}
                gradient={macroColors.fat}
              />
            </div>

            {/* Fiber */}
            <div className="mt-3 flex items-center gap-2">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{T.foodFiber}</Label>
              <Input
                type="number"
                value={numVal(form.fiber_g)}
                onChange={e => set('fiber_g', e.target.value === '' ? '' as any : Number(e.target.value))}
                className="rounded-xl bg-secondary/40 border-border/20 h-8 w-16 text-center font-mono text-sm"
                min={0}
              />
              <span className="text-xs text-muted-foreground">g</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {isEdit && onDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Button
              onClick={() => onSave(form)}
              disabled={saving || !form.name.trim()}
              className="flex-1 rounded-xl h-11 font-semibold"
            >
              {saving ? T.saving : (isEdit ? T.save : T.add)}
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function MacroInput({
  icon, label, value, onChange, pct, gradient,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onChange: (v: number) => void;
  pct: number;
  gradient: string;
}) {
  return (
    <div className="bg-secondary/30 rounded-xl p-2.5 space-y-1.5 border border-border/10">
      <div className="flex items-center gap-1">
        {icon}
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <Input
        type="number"
        value={value === 0 ? '' : value}
        onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
        className="rounded-lg bg-transparent border-0 h-8 text-center font-mono text-base font-bold p-0 focus-visible:ring-0"
        min={0}
      />
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground">g</span>
        <span className="text-[9px] text-muted-foreground">{pct}%</span>
      </div>
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

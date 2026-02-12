import { useState } from 'react';
import { motion } from 'framer-motion';
import { Scale, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  todayWeight: number | null;
  profileWeight: number | null;
  onLog: (weight: number) => void;
  saving?: boolean;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 25 };

export default function WeightCheckin({ todayWeight, profileWeight, onLog, saving }: Props) {
  const [weight, setWeight] = useState(todayWeight?.toString() || profileWeight?.toString() || '70');
  const [editing, setEditing] = useState(!todayWeight);

  const diff = todayWeight && profileWeight ? todayWeight - profileWeight : null;
  const TrendIcon = diff ? (diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus) : Minus;

  const handleSubmit = () => {
    const val = parseFloat(weight);
    if (isNaN(val) || val <= 0) return;
    onLog(val);
    setEditing(false);
  };

  return (
    <div className="metric-card space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
        <Scale className="w-3.5 h-3.5" /> Cân Nặng
      </h3>

      {todayWeight && !editing ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring} className="flex items-center justify-between">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-mono font-bold">{todayWeight}</span>
            <span className="text-sm text-muted-foreground">kg</span>
          </div>
          <div className="flex items-center gap-2">
            {diff !== null && (
              <div className={`flex items-center gap-1 text-xs font-mono ${diff > 0 ? 'text-readiness-red' : diff < 0 ? 'text-readiness-green' : 'text-muted-foreground'}`}>
                <TrendIcon className="w-3 h-3" />
                {diff > 0 ? '+' : ''}{diff.toFixed(1)} kg
              </div>
            )}
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setEditing(true)}>Sửa</Button>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={spring} className="flex items-center gap-2">
          <Input
            type="number"
            value={weight}
            onChange={e => setWeight(e.target.value)}
            step={0.1}
            className="w-28 font-mono"
            placeholder="70.0"
          />
          <span className="text-sm text-muted-foreground">kg</span>
          <Button size="sm" onClick={handleSubmit} disabled={saving} className="rounded-xl">
            {saving ? '...' : 'Lưu'}
          </Button>
        </motion.div>
      )}
    </div>
  );
}

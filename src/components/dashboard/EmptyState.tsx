import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="metric-card flex flex-col items-center justify-center py-8 text-center space-y-2 relative overflow-hidden"
    >
      <div className="w-10 h-10 rounded-full bg-secondary/50 flex items-center justify-center mb-1">
        <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
      </div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">{title}</h3>
      <p className="text-[13px] text-muted-foreground/80 max-w-[220px] leading-relaxed">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="rounded-full mt-1 haptic-press border-border/40 text-xs h-8 px-4">
          <Plus className="w-3 h-3 mr-1" />
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
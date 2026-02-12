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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="metric-card flex flex-col items-center justify-center py-10 text-center space-y-3 relative"
    >
      <div className="w-10 h-10 rounded-2xl bg-secondary/60 flex items-center justify-center mb-1">
        <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
      </div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[240px] leading-relaxed">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="rounded-xl mt-1">
          <Plus className="w-3 h-3 mr-1.5" />
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}

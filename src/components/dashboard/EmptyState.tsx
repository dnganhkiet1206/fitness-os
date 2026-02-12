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
      className="metric-card card-shimmer flex flex-col items-center justify-center py-10 text-center space-y-3 relative overflow-hidden"
    >
      <div className="absolute inset-0 pointer-events-none opacity-[0.02]" style={{ background: 'radial-gradient(ellipse at center, hsl(220 15% 50%), transparent 60%)' }} />
      
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 200, damping: 20 }}
        className="w-12 h-12 rounded-2xl bg-secondary/40 flex items-center justify-center mb-1 border border-border/20 relative"
      >
        <div className="w-3 h-3 rounded-full bg-muted-foreground/20" />
      </motion.div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground relative">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-[240px] leading-relaxed relative">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction} className="rounded-xl mt-1 haptic-press border-border/40">
          <Plus className="w-3 h-3 mr-1.5" />
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}

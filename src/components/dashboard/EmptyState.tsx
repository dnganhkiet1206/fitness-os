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
    <div className="metric-card flex flex-col items-center justify-center py-8 text-center space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{message}</p>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" onClick={onAction}>
          <Plus className="w-3 h-3 mr-1" />
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

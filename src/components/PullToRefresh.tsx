import { useState, useRef, useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}

const THRESHOLD = 80;
const MAX_PULL = 120;

export default function PullToRefresh({ onRefresh, children, className = '' }: PullToRefreshProps) {
  const [refreshing, setRefreshing] = useState(false);
  const pullY = useMotionValue(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const indicatorOpacity = useTransform(pullY, [0, 40, THRESHOLD], [0, 0.5, 1]);
  const indicatorScale = useTransform(pullY, [0, THRESHOLD], [0.5, 1]);
  const indicatorRotate = useTransform(pullY, [0, THRESHOLD, MAX_PULL], [0, 180, 270]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (refreshing) return;
    const el = containerRef.current;
    if (el && el.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    }
  }, [refreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling.current || refreshing) return;
    const diff = Math.max(0, e.touches[0].clientY - startY.current);
    const dampened = Math.min(MAX_PULL, diff * 0.5);
    pullY.set(dampened);
  }, [refreshing, pullY]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current || refreshing) return;
    pulling.current = false;
    const currentPull = pullY.get();

    if (currentPull >= THRESHOLD) {
      setRefreshing(true);
      animate(pullY, 50, { type: 'spring', stiffness: 300, damping: 30 });
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
      }
    } else {
      animate(pullY, 0, { type: 'spring', stiffness: 300, damping: 30 });
    }
  }, [refreshing, pullY, onRefresh]);

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div
        className="flex items-center justify-center pointer-events-none"
        style={{
          height: pullY,
          opacity: indicatorOpacity,
        }}
      >
        {refreshing ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        ) : (
          <motion.div
            style={{ scale: indicatorScale, rotate: indicatorRotate }}
            className="w-5 h-5 text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12l7-7 7 7" />
            </svg>
          </motion.div>
        )}
      </motion.div>

      {children}
    </div>
  );
}

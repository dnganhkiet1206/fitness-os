import { useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { haptic } from '@/lib/haptics';
import { NO_SWIPE_ROUTES } from '@/lib/route-config';

const EDGE_WIDTH = 28;
const THRESHOLD = 80;
const SCREEN_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 375;

export default function SwipeBack({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const x = useMotionValue(0);
  const isDragging = useRef(false);
  const startedFromEdge = useRef(false);
  const startX = useRef(0);

  const overlayOpacity = useTransform(x, [0, SCREEN_WIDTH * 0.5], [0, 0.15]);
  const edgeOpacity = useTransform(x, [0, 20, THRESHOLD * 0.6, THRESHOLD], [0, 0.3, 0.7, 1]);
  const edgeWidth = useTransform(x, [0, THRESHOLD * 0.5, THRESHOLD], [3, 4, 6]);
  const edgeBlur = useTransform(x, [0, THRESHOLD * 0.6, THRESHOLD], [0, 4, 10]);
  const edgeScaleY = useTransform(x, [0, THRESHOLD], [0.7, 1]);
  const edgeFilter = useTransform(edgeBlur, v => `blur(${v}px)`);

  const canSwipe = !NO_SWIPE_ROUTES.has(location.pathname);

  // Manual pointer-based edge swipe (avoids framer-motion drag interfering with child clicks)
  useEffect(() => {
    if (!canSwipe) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.clientX <= EDGE_WIDTH) {
        startedFromEdge.current = true;
        startX.current = e.clientX;
        isDragging.current = false;
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!startedFromEdge.current) return;
      const dx = Math.max(0, e.clientX - startX.current);
      if (dx > 4) isDragging.current = true;
      x.set(dx);
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (!startedFromEdge.current) return;
      const dx = e.clientX - startX.current;
      const shouldNavigate = dx > THRESHOLD || (isDragging.current && dx > THRESHOLD * 0.5);

      if (shouldNavigate) {
        // Hand off to the route pop transition: it carries the screen off from
        // the dragged position (each route has its own SwipeBack instance, so
        // x needs no reset — the incoming screen starts fresh at 0).
        haptic('medium');
        navigate(-1);
      } else {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
      }

      startedFromEdge.current = false;
      isDragging.current = false;
    };

    const handlePointerCancel = () => {
      if (startedFromEdge.current) {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
        startedFromEdge.current = false;
        isDragging.current = false;
      }
    };

    document.addEventListener('pointerdown', handlePointerDown, { passive: true });
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerup', handlePointerUp, { passive: true });
    document.addEventListener('pointercancel', handlePointerCancel, { passive: true });

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };
  }, [canSwipe, navigate, x]);

  if (!canSwipe) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {/* Edge glow indicator */}
      <motion.div
        className="fixed left-0 top-[10%] bottom-[10%] z-[9999] rounded-r-full pointer-events-none"
        style={{
          opacity: edgeOpacity,
          width: edgeWidth,
          scaleY: edgeScaleY,
          filter: edgeFilter,
          background: 'linear-gradient(180deg, hsl(var(--primary) / 0.8), hsl(var(--primary) / 0.3), hsl(var(--primary) / 0.8))',
          boxShadow: '0 0 12px hsl(var(--primary) / 0.4)',
        }}
      />
      {/* Dim overlay during swipe */}
      <motion.div
        className="fixed inset-0 bg-black pointer-events-none z-[99]"
        style={{ opacity: overlayOpacity }}
      />
      {/* Content — NO drag prop, so child buttons work normally */}
      <motion.div
        style={{ x }}
        className="relative z-[100] min-h-screen bg-background"
      >
        {children}
      </motion.div>
    </div>
  );
}
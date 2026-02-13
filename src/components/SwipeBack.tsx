import { useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const EDGE_WIDTH = 28;
const THRESHOLD = 80;
const SCREEN_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 375;

const NO_SWIPE_PAGES = ['/', '/auth', '/onboarding'];

export default function SwipeBack({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const x = useMotionValue(0);
  const isDragging = useRef(false);
  const startedFromEdge = useRef(false);

  // All hooks MUST be called before any conditional return
  const overlayOpacity = useTransform(x, [0, SCREEN_WIDTH * 0.5], [0, 0.15]);
  const edgeOpacity = useTransform(x, [0, 20, THRESHOLD * 0.6, THRESHOLD], [0, 0.3, 0.7, 1]);
  const edgeWidth = useTransform(x, [0, THRESHOLD * 0.5, THRESHOLD], [3, 4, 6]);
  const edgeBlur = useTransform(x, [0, THRESHOLD * 0.6, THRESHOLD], [0, 4, 10]);
  const edgeScaleY = useTransform(x, [0, THRESHOLD], [0.7, 1]);
  const edgeFilter = useTransform(edgeBlur, v => `blur(${v}px)`);

  const canSwipe = !NO_SWIPE_PAGES.includes(location.pathname);

  useEffect(() => {
    x.set(0);
  }, [location.pathname, x]);

  const handleDragStart = useCallback(
    (_: any, info: { point: { x: number } }) => {
      startedFromEdge.current = canSwipe && info.point.x <= EDGE_WIDTH;
    },
    [canSwipe]
  );

  const handleDrag = useCallback(
    (_: any, info: { offset: { x: number } }) => {
      if (!startedFromEdge.current) { x.set(0); return; }
      x.set(Math.max(0, info.offset.x));
      isDragging.current = info.offset.x > 4;
    },
    [x]
  );

  const handleDragEnd = useCallback(
    (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
      if (!startedFromEdge.current) {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
        isDragging.current = false;
        startedFromEdge.current = false;
        return;
      }
      const shouldNavigate = info.offset.x > THRESHOLD || info.velocity.x > 600;
      if (shouldNavigate) {
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(12);
        animate(x, SCREEN_WIDTH, {
          type: 'spring', stiffness: 300, damping: 30,
          onComplete: () => { navigate(-1); requestAnimationFrame(() => x.set(0)); },
        });
      } else {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
      }
      isDragging.current = false;
      startedFromEdge.current = false;
    },
    [navigate, x]
  );

  if (!canSwipe) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
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
      <motion.div
        className="fixed inset-0 bg-black pointer-events-none z-[99]"
        style={{ opacity: overlayOpacity }}
      />
      <motion.div
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: SCREEN_WIDTH }}
        dragElastic={0}
        dragMomentum={false}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        className="relative z-[100] min-h-screen bg-background"
      >
        {children}
      </motion.div>
    </div>
  );
}

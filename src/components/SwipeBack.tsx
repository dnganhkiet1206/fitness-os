import { useRef, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const EDGE_WIDTH = 28; // px from left edge to start swipe
const THRESHOLD = 80; // px to trigger navigation
const SCREEN_WIDTH = typeof window !== 'undefined' ? window.innerWidth : 375;

// Pages that should NOT have swipe-back (root-level tabs)
const NO_SWIPE_PAGES = ['/', '/auth', '/onboarding'];

export default function SwipeBack({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const x = useMotionValue(0);
  const isDragging = useRef(false);
  const startedFromEdge = useRef(false);

  const canSwipe = !NO_SWIPE_PAGES.includes(location.pathname);

  // Shadow overlay opacity
  const overlayOpacity = useTransform(x, [0, SCREEN_WIDTH * 0.5], [0, 0.15]);
  // Slight scale on the page behind (iOS-style parallax)
  const behindX = useTransform(x, [0, SCREEN_WIDTH], [-80, 0]);

  const handleDragStart = useCallback(
    (_: any, info: { point: { x: number } }) => {
      if (!canSwipe) return;
      startedFromEdge.current = info.point.x <= EDGE_WIDTH;
    },
    [canSwipe]
  );

  const handleDrag = useCallback(
    (_: any, info: { offset: { x: number } }) => {
      if (!startedFromEdge.current || !canSwipe) {
        x.set(0);
        return;
      }
      const val = Math.max(0, info.offset.x);
      x.set(val);
      isDragging.current = val > 4;
    },
    [canSwipe, x]
  );

  const handleDragEnd = useCallback(
    (_: any, info: { offset: { x: number }; velocity: { x: number } }) => {
      if (!startedFromEdge.current || !canSwipe) {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
        isDragging.current = false;
        startedFromEdge.current = false;
        return;
      }

      const shouldNavigate =
        info.offset.x > THRESHOLD || info.velocity.x > 600;

      if (shouldNavigate) {
        animate(x, SCREEN_WIDTH, {
          type: 'spring',
          stiffness: 300,
          damping: 30,
          onComplete: () => {
            navigate(-1);
            // Reset after navigation
            requestAnimationFrame(() => x.set(0));
          },
        });
      } else {
        animate(x, 0, { type: 'spring', stiffness: 400, damping: 40 });
      }

      isDragging.current = false;
      startedFromEdge.current = false;
    },
    [canSwipe, navigate, x]
  );

  // Reset on route change
  useEffect(() => {
    x.set(0);
  }, [location.pathname, x]);

  if (!canSwipe) return <>{children}</>;

  return (
    <div className="relative overflow-hidden">
      {/* Edge indicator line */}
      <motion.div
        className="fixed left-0 top-0 bottom-0 w-[3px] z-[9999] rounded-r-full pointer-events-none"
        style={{
          opacity: useTransform(x, [0, 30, THRESHOLD], [0, 0.6, 1]),
          background: 'linear-gradient(180deg, hsl(var(--primary) / 0.5), hsl(var(--primary) / 0.2))',
        }}
      />

      {/* Dark overlay behind */}
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

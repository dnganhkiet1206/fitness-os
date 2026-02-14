import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

interface LargeTitleProps {
  title: string;
  children?: React.ReactNode;
}

/**
 * Apple Fitness+ style large title that collapses on scroll.
 * Reads scroll position from the nearest `.scroll-container` ancestor.
 */
export default function LargeTitle({ title, children }: LargeTitleProps) {
  const [scrollY, setScrollY] = useState(0);
  const threshold = 44; // px before fully collapsed

  useEffect(() => {
    const scroller = document.querySelector('.scroll-container');
    if (!scroller) return;
    const handler = () => setScrollY(scroller.scrollTop);
    scroller.addEventListener('scroll', handler, { passive: true });
    return () => scroller.removeEventListener('scroll', handler);
  }, []);

  const progress = Math.min(scrollY / threshold, 1);
  const largeTitleOpacity = 1 - progress;
  const largeTitleScale = 1 - progress * 0.15;
  const largeTitleY = -progress * 12;
  const inlineOpacity = progress;
  const barBorder = progress > 0.9 ? 0.6 : 0;

  return (
    <>
      {/* Inline title bar — appears on scroll */}
      <div
        className="sticky top-0 z-40 shrink-0"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: `hsl(var(--background) / ${0.72 + progress * 0.2})`,
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          borderBottom: `0.5px solid hsl(var(--border) / ${barBorder})`,
        }}
      >
        <div className="max-w-4xl mx-auto px-4 h-[44px] flex items-center justify-between">
          <h1
            className="text-[17px] font-semibold tracking-tight transition-opacity duration-150"
            style={{ opacity: inlineOpacity }}
          >
            {title}
          </h1>
          <div className="flex items-center gap-1">
            {children}
          </div>
        </div>
      </div>

      {/* Large title — visible at top */}
      <div
        className="px-4 pt-0 pb-1 max-w-4xl mx-auto"
        style={{
          opacity: largeTitleOpacity,
          transform: `scale(${largeTitleScale}) translateY(${largeTitleY}px)`,
          transformOrigin: 'left center',
          pointerEvents: largeTitleOpacity < 0.1 ? 'none' : 'auto',
        }}
      >
        <h1 className="text-[26px] font-bold tracking-tight leading-snug">{title}</h1>
      </div>
    </>
  );
}

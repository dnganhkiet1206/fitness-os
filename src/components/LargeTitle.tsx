import { useEffect, useRef, useState } from 'react';

interface LargeTitleProps {
  title: string;
  children?: React.ReactNode;
}

/**
 * Apple Fitness+ style large title that collapses on scroll.
 * Uses transparent background that blends with the page.
 */
export default function LargeTitle({ title, children }: LargeTitleProps) {
  const [scrollY, setScrollY] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const threshold = 44;

  useEffect(() => {
    // Bind to this page's own scroll container (scrollers are per-route)
    const scroller = barRef.current?.closest('.scroll-container');
    if (!scroller) return;
    const handler = () => setScrollY(scroller.scrollTop);
    scroller.addEventListener('scroll', handler, { passive: true });
    return () => scroller.removeEventListener('scroll', handler);
  }, []);

  const progress = Math.min(scrollY / threshold, 1);
  const largeTitleOpacity = 1 - progress;
  const largeTitleScale = 1 - progress * 0.12;
  const largeTitleY = -progress * 10;
  const inlineOpacity = progress;
  const barBorder = progress > 0.85 ? 0.6 : 0;
  const barBlur = progress > 0.3 ? 1 : progress / 0.3;

  return (
    <>
      {/* Inline collapsed title bar — transparent, blends with page */}
      <div
        ref={barRef}
        className="sticky top-0 z-40 shrink-0"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: progress > 0.3
            ? `hsl(var(--background) / ${0.6 + progress * 0.3})`
            : 'transparent',
          backdropFilter: barBlur > 0.1
            ? `blur(${barBlur * 40}px) saturate(${1 + barBlur * 0.8})`
            : 'none',
          WebkitBackdropFilter: barBlur > 0.1
            ? `blur(${barBlur * 40}px) saturate(${1 + barBlur * 0.8})`
            : 'none',
          borderBottom: `0.5px solid hsl(var(--border) / ${barBorder})`,
          boxShadow: progress > 0.85 ? '0 1px 8px hsl(0 0% 0% / 0.1)' : 'none',
          transition: 'background 0.15s ease, box-shadow 0.2s ease',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 h-[44px] flex items-center justify-center relative">
          <h1
            className="text-[17px] font-semibold tracking-tight text-center text-foreground"
            style={{
              opacity: inlineOpacity,
              transform: `translateY(${(1 - inlineOpacity) * 6}px)`,
              transition: 'opacity 0.18s ease, transform 0.18s ease',
            }}
          >
            {title}
          </h1>
          <div className="absolute right-4 flex items-center gap-1">
            {children}
          </div>
        </div>
      </div>

      {/* Large title — visible at top, fades as user scrolls */}
      <div
        className="px-4 pt-0.5 pb-1.5 max-w-4xl mx-auto"
        style={{
          opacity: largeTitleOpacity,
          transform: `scale(${largeTitleScale}) translateY(${largeTitleY}px)`,
          transformOrigin: 'left center',
          pointerEvents: largeTitleOpacity < 0.1 ? 'none' : 'auto',
          transition: 'opacity 0.12s ease-out, transform 0.12s ease-out',
        }}
      >
        <h1 className="text-[28px] font-bold tracking-tight leading-snug text-foreground">{title}</h1>
      </div>
    </>
  );
}

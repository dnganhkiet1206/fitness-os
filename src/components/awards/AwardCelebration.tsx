import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Dumbbell, Calendar, Target, Moon, Footprints, Beef, X } from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
  flame: Flame, dumbbell: Dumbbell, trophy: Trophy, calendar: Calendar,
  target: Target, moon: Moon, footprints: Footprints, beef: Beef,
};

const TIER_CONFIG: Record<string, { gradient: string; glow: string; label: string }> = {
  bronze: { gradient: 'from-[hsl(25,60%,45%)] to-[hsl(35,70%,55%)]', glow: 'hsl(30 65% 50% / 0.5)', label: 'Bronze' },
  silver: { gradient: 'from-[hsl(220,10%,60%)] to-[hsl(220,15%,80%)]', glow: 'hsl(220 15% 70% / 0.5)', label: 'Silver' },
  gold: { gradient: 'from-[hsl(43,96%,46%)] to-[hsl(43,96%,66%)]', glow: 'hsl(43 96% 56% / 0.6)', label: 'Gold' },
  platinum: { gradient: 'from-[hsl(265,90%,56%)] to-[hsl(190,95%,60%)]', glow: 'hsl(265 90% 66% / 0.6)', label: 'Platinum' },
};

const CONFETTI_COLORS = [
  'hsl(43, 96%, 56%)', 'hsl(25, 95%, 58%)', 'hsl(160, 84%, 39%)',
  'hsl(265, 90%, 66%)', 'hsl(217, 91%, 60%)', 'hsl(350, 89%, 60%)',
  'hsl(43, 96%, 76%)', 'hsl(190, 95%, 60%)',
];

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  rotation: number;
  scale: number;
  type: 'circle' | 'rect' | 'star';
}

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 0.6,
    rotation: Math.random() * 720 - 360,
    scale: 0.5 + Math.random() * 0.8,
    type: (['circle', 'rect', 'star'] as const)[Math.floor(Math.random() * 3)],
  }));
}

export interface CelebrationAward {
  title: string;
  description: string;
  icon: string;
  tier: string;
}

// Global event system
type Listener = (award: CelebrationAward) => void;
const listeners: Listener[] = [];

export function fireCelebration(award: CelebrationAward) {
  listeners.forEach(fn => fn(award));
}

export function AwardCelebrationOverlay() {
  const [queue, setQueue] = useState<CelebrationAward[]>([]);
  const [current, setCurrent] = useState<CelebrationAward | null>(null);
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    const handler: Listener = (award) => {
      setQueue(q => [...q, award]);
    };
    listeners.push(handler);
    return () => {
      const idx = listeners.indexOf(handler);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(q => q.slice(1));
      setConfetti(generateConfetti(40));
    }
  }, [current, queue]);

  const dismiss = useCallback(() => setCurrent(null), []);

  // Auto-dismiss after 4s
  useEffect(() => {
    if (current) {
      const t = setTimeout(dismiss, 4000);
      return () => clearTimeout(t);
    }
  }, [current, dismiss]);

  const tier = current ? (TIER_CONFIG[current.tier] || TIER_CONFIG.bronze) : TIER_CONFIG.bronze;
  const Icon = current ? (ICON_MAP[current.icon] || Trophy) : Trophy;

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] flex items-center justify-center pointer-events-none"
        >
          {/* Confetti layer */}
          <div className="absolute inset-0 overflow-hidden">
            {confetti.map(p => (
              <motion.div
                key={p.id}
                initial={{ y: -20, x: `${p.x}vw`, opacity: 1, rotate: 0, scale: 0 }}
                animate={{
                  y: '110vh',
                  rotate: p.rotation,
                  scale: p.scale,
                  opacity: [1, 1, 0.8, 0],
                }}
                transition={{ duration: 2.5 + Math.random(), delay: p.delay, ease: 'easeOut' }}
                className="absolute top-0"
                style={{ left: 0 }}
              >
                {p.type === 'circle' && (
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
                )}
                {p.type === 'rect' && (
                  <div className="w-2 h-3 rounded-sm" style={{ background: p.color }} />
                )}
                {p.type === 'star' && (
                  <svg width="12" height="12" viewBox="0 0 12 12">
                    <polygon points="6,0 7.5,4.5 12,4.5 8.25,7.5 9.75,12 6,9 2.25,12 3.75,7.5 0,4.5 4.5,4.5" fill={p.color} />
                  </svg>
                )}
              </motion.div>
            ))}
          </div>

          {/* Toast card */}
          <motion.div
            initial={{ scale: 0.3, y: 40, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.8, y: -30, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="relative pointer-events-auto max-w-sm w-[90vw] mx-4"
            onClick={dismiss}
          >
            <div
              className="relative rounded-3xl border border-border/30 bg-card/90 backdrop-blur-2xl p-6 text-center overflow-hidden cursor-pointer"
              style={{ boxShadow: `0 0 60px ${tier.glow}, 0 20px 50px hsl(225 15% 6% / 0.6)` }}
            >
              {/* Ambient glow */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 20%, ${tier.glow}, transparent 70%)` }} />

              {/* Close hint */}
              <button onClick={dismiss} className="absolute top-3 right-3 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>

              {/* Medal icon */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                className="relative mx-auto mb-4"
              >
                <div className={`w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br ${tier.gradient} flex items-center justify-center`}
                  style={{ boxShadow: `0 0 30px ${tier.glow}` }}
                >
                  <Icon className="w-9 h-9 text-white drop-shadow-lg" />
                </div>
                {/* Pulse rings */}
                <motion.div
                  className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${tier.gradient}`}
                  initial={{ scale: 1, opacity: 0.4 }}
                  animate={{ scale: 1.6, opacity: 0 }}
                  transition={{ duration: 1.2, repeat: 2, ease: 'easeOut' }}
                />
              </motion.div>

              {/* Text */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="relative space-y-1"
              >
                <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-muted-foreground">Huy Chương Mới!</p>
                <h3 className="text-xl font-bold">{current.title}</h3>
                <p className="text-sm text-muted-foreground">{current.description}</p>
                <span className={`inline-block mt-2 text-[9px] uppercase tracking-[0.2em] font-bold px-3 py-1 rounded-full bg-gradient-to-r ${tier.gradient} text-white`}>
                  {tier.label}
                </span>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

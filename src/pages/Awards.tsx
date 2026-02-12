import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Dumbbell, Calendar, Target, Moon, Footprints, Beef, Medal, Sparkles, Share2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useAwards, useCheckAwards, AWARD_DEFINITIONS, type Award } from '@/hooks/useAwards';
import { ShareAwardCard } from '@/components/awards/ShareAwardCard';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const ICON_MAP: Record<string, React.ElementType> = {
  flame: Flame,
  dumbbell: Dumbbell,
  trophy: Trophy,
  calendar: Calendar,
  target: Target,
  moon: Moon,
  footprints: Footprints,
  beef: Beef,
};

const TIER_CONFIG = {
  bronze: {
    gradient: 'from-[hsl(25,60%,45%)] to-[hsl(35,70%,55%)]',
    glow: 'hsl(30 65% 50% / 0.3)',
    ring: 'hsl(30, 65%, 50%)',
    bg: 'bg-[hsl(30,60%,50%)]/10',
    text: 'text-[hsl(30,65%,55%)]',
    label: 'Bronze',
  },
  silver: {
    gradient: 'from-[hsl(220,10%,60%)] to-[hsl(220,15%,80%)]',
    glow: 'hsl(220 15% 70% / 0.3)',
    ring: 'hsl(220, 15%, 70%)',
    bg: 'bg-[hsl(220,15%,70%)]/10',
    text: 'text-[hsl(220,15%,80%)]',
    label: 'Silver',
  },
  gold: {
    gradient: 'from-[hsl(43,96%,46%)] to-[hsl(43,96%,66%)]',
    glow: 'hsl(43 96% 56% / 0.4)',
    ring: 'hsl(43, 96%, 56%)',
    bg: 'bg-readiness-yellow/10',
    text: 'text-readiness-yellow',
    label: 'Gold',
  },
  platinum: {
    gradient: 'from-[hsl(265,90%,56%)] to-[hsl(190,95%,60%)]',
    glow: 'hsl(265 90% 66% / 0.4)',
    ring: 'hsl(265, 90%, 66%)',
    bg: 'bg-metric-purple/10',
    text: 'text-metric-purple',
    label: 'Platinum',
  },
};

function AwardMedal({ award, index, earned }: { award: typeof AWARD_DEFINITIONS[0]; index: number; earned: Award | undefined }) {
  const tier = TIER_CONFIG[award.tier];
  const Icon = ICON_MAP[award.icon] || Trophy;
  const isEarned = !!earned;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ ...spring, delay: 0.05 * index }}
      className={`relative flex flex-col items-center gap-3 p-5 rounded-2xl border transition-all duration-300 overflow-hidden ${
        isEarned
          ? 'border-border/30 bg-card/60'
          : 'border-border/10 bg-card/20 opacity-40 grayscale'
      }`}
    >
      {/* Ambient glow for earned */}
      {isEarned && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 30%, ${tier.glow}, transparent 70%)` }} />
      )}

      {/* Medal ring */}
      <div className="relative">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" fill="none" stroke="hsl(225 10% 12%)" strokeWidth="3" />
          {isEarned && (
            <motion.circle
              cx="36" cy="36" r="30"
              fill="none"
              stroke={tier.ring}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 30}
              initial={{ strokeDashoffset: 2 * Math.PI * 30 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.1 * index }}
              style={{ transformOrigin: '36px 36px', rotate: '-90deg', filter: `drop-shadow(0 0 4px ${tier.glow})` }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={isEarned ? { scale: [1, 1.1, 1] } : {}}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Icon className={`w-7 h-7 ${isEarned ? tier.text : 'text-muted-foreground/40'}`} />
          </motion.div>
        </div>
      </div>

      {/* Tier badge */}
      <span className={`text-[9px] uppercase tracking-[0.2em] font-bold px-2 py-0.5 rounded-full ${isEarned ? `${tier.bg} ${tier.text}` : 'bg-secondary/20 text-muted-foreground/40'}`}>
        {tier.label}
      </span>

      {/* Title & description */}
      <div className="text-center relative">
        <p className={`text-sm font-bold ${isEarned ? 'text-foreground' : 'text-muted-foreground/40'}`}>{award.title}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{award.desc}</p>
      </div>

      {/* Earned date + share */}
      {earned && (
        <div className="flex items-center gap-2">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-muted-foreground font-mono"
          >
            {new Date(earned.earned_at).toLocaleDateString('vi-VN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </motion.p>
          <ShareAwardCard award={award} earned={earned}>
            <motion.button
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              className="p-1 rounded-lg hover:bg-secondary/30 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
            </motion.button>
          </ShareAwardCard>
        </div>
      )}
    </motion.div>
  );
}

export default function Awards() {
  const { user, loading } = useAuth();
  const { data: awards, isLoading } = useAwards();
  const { checkAndGrant } = useCheckAwards();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (awards && !checked) {
      checkAndGrant();
      setChecked(true);
    }
  }, [awards, checked]);

  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;

  const earnedMap = new Map((awards ?? []).map(a => [a.award_key, a]));
  const earnedCount = earnedMap.size;
  const totalCount = AWARD_DEFINITIONS.length;
  const pct = totalCount > 0 ? Math.round((earnedCount / totalCount) * 100) : 0;

  // Group by tier
  const tiers: ('platinum' | 'gold' | 'silver' | 'bronze')[] = ['platinum', 'gold', 'silver', 'bronze'];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
        className="text-center space-y-4"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...spring, delay: 0.2 }}
          className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-readiness-yellow/20 to-metric-orange/20 flex items-center justify-center border border-readiness-yellow/20"
          style={{ boxShadow: '0 0 30px hsl(43 96% 56% / 0.15)' }}
        >
          <Medal className="w-10 h-10 text-readiness-yellow" />
        </motion.div>
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Huy Chương</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Đã đạt <span className="font-mono font-bold text-foreground">{earnedCount}</span> / {totalCount} huy chương
          </p>
        </div>

        {/* Overall progress ring */}
        <div className="flex justify-center">
          <div className="relative">
            <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
              <circle cx="40" cy="40" r="32" fill="none" stroke="hsl(225 10% 12%)" strokeWidth="4" />
              <defs>
                <linearGradient id="awards-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(43, 96%, 56%)" />
                  <stop offset="100%" stopColor="hsl(25, 95%, 58%)" />
                </linearGradient>
              </defs>
              <motion.circle
                cx="40" cy="40" r="32"
                fill="none"
                stroke="url(#awards-grad)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 32}
                initial={{ strokeDashoffset: 2 * Math.PI * 32 }}
                animate={{ strokeDashoffset: 2 * Math.PI * 32 * (1 - pct / 100) }}
                transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-mono font-bold text-readiness-yellow">{pct}%</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Awards grid by tier */}
      {tiers.map(tier => {
        const tierAwards = AWARD_DEFINITIONS.filter(a => a.tier === tier);
        if (tierAwards.length === 0) return null;
        const tc = TIER_CONFIG[tier];

        return (
          <motion.div
            key={tier}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.1 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <Sparkles className={`w-4 h-4 ${tc.text}`} />
              <h3 className={`text-sm font-bold uppercase tracking-[0.15em] ${tc.text}`}>{tc.label}</h3>
              <div className="flex-1 h-px bg-border/20" />
              <span className="text-[10px] text-muted-foreground font-mono">
                {tierAwards.filter(a => earnedMap.has(a.key)).length}/{tierAwards.length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {tierAwards.map((award, i) => (
                <AwardMedal key={award.key} award={award} index={i} earned={earnedMap.get(award.key)} />
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

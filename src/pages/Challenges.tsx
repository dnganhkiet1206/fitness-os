import { useEffect, useState } from 'react';
import PageLoader from '@/components/PageLoader';
import { Navigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { motion } from 'framer-motion';
import { Trophy, Flame, Dumbbell, Calendar, Target, Moon, Footprints, Beef, Droplets, Swords, Check, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useWeeklyChallenges, useInitWeeklyChallenges, useUpdateChallengeProgress, getWeekStart, type WeeklyChallenge } from '@/hooks/useWeeklyChallenges';
import { Progress } from '@/components/ui/progress';
import { useAppSettings, t } from '@/hooks/useAppSettings';
import { getLocale } from '@/lib/i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30, mass: 0.8 };

const ICON_MAP: Record<string, React.ElementType> = {
  flame: Flame, dumbbell: Dumbbell, trophy: Trophy, calendar: Calendar,
  target: Target, moon: Moon, footprints: Footprints, beef: Beef, droplets: Droplets,
};

const TIER_CONFIG: Record<string, { gradient: string; glow: string; text: string; bg: string }> = {
  bronze: { gradient: 'from-[hsl(25,60%,45%)] to-[hsl(35,70%,55%)]', glow: 'hsl(30 65% 50% / 0.3)', text: 'text-[hsl(30,65%,55%)]', bg: 'bg-[hsl(30,60%,50%)]/10' },
  silver: { gradient: 'from-[hsl(220,10%,60%)] to-[hsl(220,15%,80%)]', glow: 'hsl(220 15% 70% / 0.3)', text: 'text-[hsl(220,15%,80%)]', bg: 'bg-[hsl(220,15%,70%)]/10' },
  gold: { gradient: 'from-[hsl(43,96%,46%)] to-[hsl(43,96%,66%)]', glow: 'hsl(43 96% 56% / 0.4)', text: 'text-readiness-yellow', bg: 'bg-readiness-yellow/10' },
  platinum: { gradient: 'from-[hsl(265,90%,56%)] to-[hsl(190,95%,60%)]', glow: 'hsl(265 90% 66% / 0.4)', text: 'text-metric-purple', bg: 'bg-metric-purple/10' },
};

function ChallengeCard({ challenge, index, i18n }: { challenge: WeeklyChallenge; index: number; i18n: ReturnType<typeof t> }) {
  const Icon = ICON_MAP[challenge.icon] || Target;
  const tier = TIER_CONFIG[challenge.reward_tier] || TIER_CONFIG.bronze;
  const pct = challenge.target_value > 0 ? Math.round((challenge.current_value / challenge.target_value) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring, delay: 0.08 * index }}
      className={`relative rounded-2xl border overflow-hidden transition-all duration-300 ${
        challenge.completed ? 'border-primary/30 bg-primary/5' : 'border-border/20 bg-card/60'
      }`}
    >
      {challenge.completed && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 30%, ${tier.glow}, transparent 70%)` }} />
      )}
      <div className="relative p-5 space-y-4">
        <div className="flex items-start gap-4">
          <motion.div
            animate={challenge.completed ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
              challenge.completed ? `bg-gradient-to-br ${tier.gradient}` : 'bg-secondary/30 border border-border/20'
            }`}
            style={challenge.completed ? { boxShadow: `0 0 20px ${tier.glow}` } : {}}
          >
            {challenge.completed ? <Check className="w-6 h-6 text-white" /> : <Icon className="w-6 h-6 text-muted-foreground" />}
          </motion.div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold">{challenge.title}</h3>
              {challenge.completed && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className={`text-[9px] uppercase tracking-[0.15em] font-bold px-2 py-0.5 rounded-full ${tier.bg} ${tier.text}`}>
                  ✓ Done
                </motion.span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{challenge.description}</p>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{i18n.challengesProgress}</span>
            <span className={`font-mono font-bold ${challenge.completed ? tier.text : 'text-foreground'}`}>
              {challenge.current_value.toLocaleString()} / {challenge.target_value.toLocaleString()}
            </span>
          </div>
          <div className="h-2 rounded-full bg-secondary/30 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.2 + index * 0.1 }}
              className={`h-full rounded-full ${challenge.completed ? `bg-gradient-to-r ${tier.gradient}` : 'bg-primary/60'}`}
              style={challenge.completed ? { boxShadow: `0 0 8px ${tier.glow}` } : {}}
            />
          </div>
        </div>
        {challenge.reward_title && (
          <div className={`flex items-center gap-2 text-[11px] ${challenge.completed ? tier.text : 'text-muted-foreground/60'}`}>
            <Trophy className="w-3 h-3" />
            <span>{i18n.challengesReward}: <span className="font-semibold">{challenge.reward_title}</span></span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function Challenges() {
  const { user, loading } = useAuth();
  const { lang } = useAppSettings();
  const i18n = t(lang);
  const locale = getLocale(lang);
  const { data: challenges, isLoading } = useWeeklyChallenges();
  const initChallenges = useInitWeeklyChallenges();
  const updateProgress = useUpdateChallengeProgress();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (user && !initialized && challenges !== undefined) {
      if (challenges.length === 0) {
        initChallenges.mutate(undefined, { onSuccess: () => { updateProgress.mutate(); } });
      } else {
        updateProgress.mutate();
      }
      setInitialized(true);
    }
  }, [user, initialized, challenges]);

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth" replace />;

  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekLabel = `${new Date(weekStart).toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}`;

  const completed = (challenges ?? []).filter(c => c.completed).length;
  const total = (challenges ?? []).length;

  const now = new Date();
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 7);
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="bg-background">
      <PageHeader title={i18n.challengesTitle} />
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="text-center space-y-2">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...spring, delay: 0.2 }}
          className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-metric-orange/20 to-readiness-yellow/20 flex items-center justify-center border border-metric-orange/20"
          style={{ boxShadow: '0 0 30px hsl(25 95% 58% / 0.15)' }}>
          <Swords className="w-7 h-7 text-metric-orange" />
        </motion.div>
        <div>
          <h2 className="text-xl font-bold tracking-tight">{i18n.challengesTitle}</h2>
          <p className="text-xs text-muted-foreground mt-1">{weekLabel}</p>
        </div>
        <div className="flex items-center justify-center gap-6 text-sm">
          <div className="text-center">
            <p className="font-mono font-bold text-lg text-foreground">{completed}/{total}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{i18n.challengesCompleted}</p>
          </div>
          <div className="w-px h-8 bg-border/20" />
          <div className="text-center">
            <p className="font-mono font-bold text-lg text-metric-orange">{daysLeft}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{i18n.challengesDaysLeft}</p>
          </div>
        </div>
      </motion.div>

      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-card/30 animate-pulse" />
          ))
        ) : (
          (challenges ?? []).map((ch, i) => (
            <ChallengeCard key={ch.id} challenge={ch} index={i} i18n={i18n} />
          ))
        )}
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-center">
        <button onClick={() => updateProgress.mutate()} disabled={updateProgress.isPending} className="text-xs text-muted-foreground hover:text-foreground transition-colors haptic-press">
          {updateProgress.isPending ? i18n.challengesUpdating : i18n.challengesUpdateProgress}
        </button>
      </motion.div>
    </div>
    </div>
  );
}

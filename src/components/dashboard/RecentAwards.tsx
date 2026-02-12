import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Trophy, Flame, Dumbbell, Calendar, Target, Moon, Footprints, Beef, ChevronRight } from 'lucide-react';
import { useRecentAwards, type Award } from '@/hooks/useAwards';
import { useAppSettings } from '@/hooks/useAppSettings';
import { t, getLocale } from '@/lib/i18n';

const spring = { type: 'spring' as const, stiffness: 260, damping: 30 };

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

const TIER_GRADIENT: Record<string, string> = {
  bronze: 'from-[hsl(25,60%,45%)] to-[hsl(35,70%,55%)]',
  silver: 'from-[hsl(220,10%,60%)] to-[hsl(220,15%,80%)]',
  gold: 'from-[hsl(43,96%,46%)] to-[hsl(43,96%,66%)]',
  platinum: 'from-[hsl(265,90%,56%)] to-[hsl(190,95%,60%)]',
};

const TIER_GLOW: Record<string, string> = {
  bronze: 'hsl(30 65% 50% / 0.2)',
  silver: 'hsl(220 15% 70% / 0.2)',
  gold: 'hsl(43 96% 56% / 0.3)',
  platinum: 'hsl(265 90% 66% / 0.3)',
};

export default function RecentAwards() {
  const { data: awards } = useRecentAwards(3);
  const navigate = useNavigate();
  const { lang } = useAppSettings();
  const T = t(lang);
  const locale = getLocale(lang);

  if (!awards || awards.length === 0) return null;

  return (
    <div className="metric-card card-shimmer space-y-4 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at center, hsl(43 96% 56%), transparent 60%)' }} />

      <div className="flex items-center justify-between relative">
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5 text-readiness-yellow" /> {T.dcRecentAwards}
        </h3>
        <motion.button
          whileHover={{ x: 2 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/awards')}
          className="text-xs text-primary flex items-center gap-0.5 haptic-press"
        >
          {T.dcViewAll} <ChevronRight className="w-3 h-3" />
        </motion.button>
      </div>

      <div className="flex gap-3 relative">
        {awards.map((award, i) => {
          const Icon = ICON_MAP[award.icon] || Trophy;
          const gradient = TIER_GRADIENT[award.tier] || TIER_GRADIENT.bronze;
          const glow = TIER_GLOW[award.tier] || TIER_GLOW.bronze;
          
          return (
            <motion.div
              key={award.id}
              initial={{ opacity: 0, scale: 0.7, rotate: -10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ ...spring, delay: 0.1 + i * 0.1 }}
              className="flex-1 flex flex-col items-center gap-2 p-3 rounded-xl bg-secondary/15 border border-border/20"
            >
              <div className="relative">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center`} style={{ boxShadow: `0 0 16px ${glow}` }}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
              </div>
              <p className="text-[11px] font-semibold text-center leading-tight">{award.title}</p>
              <p className="text-[9px] text-muted-foreground font-mono">
                {new Date(award.earned_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

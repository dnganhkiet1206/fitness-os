import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { Trophy, Flame, Dumbbell, Calendar, Target, Moon, Footprints, Beef, X, Download, Share2, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Award, AWARD_DEFINITIONS } from '@/hooks/useAwards';

const ICON_MAP: Record<string, React.ElementType> = {
  flame: Flame, dumbbell: Dumbbell, trophy: Trophy, calendar: Calendar,
  target: Target, moon: Moon, footprints: Footprints, beef: Beef,
};

const TIER_STYLES: Record<string, { gradient: string; bg: string; accent: string; glow: string }> = {
  bronze: { gradient: 'linear-gradient(135deg, hsl(25,60%,45%), hsl(35,70%,55%))', bg: 'hsl(25, 40%, 12%)', accent: 'hsl(30, 65%, 55%)', glow: 'hsl(30 65% 50% / 0.4)' },
  silver: { gradient: 'linear-gradient(135deg, hsl(220,10%,60%), hsl(220,15%,80%))', bg: 'hsl(220, 15%, 12%)', accent: 'hsl(220, 15%, 80%)', glow: 'hsl(220 15% 70% / 0.4)' },
  gold: { gradient: 'linear-gradient(135deg, hsl(43,96%,46%), hsl(43,96%,66%))', bg: 'hsl(43, 30%, 10%)', accent: 'hsl(43, 96%, 56%)', glow: 'hsl(43 96% 56% / 0.5)' },
  platinum: { gradient: 'linear-gradient(135deg, hsl(265,90%,56%), hsl(190,95%,60%))', bg: 'hsl(265, 40%, 12%)', accent: 'hsl(265, 90%, 66%)', glow: 'hsl(265 90% 66% / 0.5)' },
};

interface ShareAwardCardProps {
  award: typeof AWARD_DEFINITIONS[number];
  earned: Award;
  children: React.ReactNode;
}

export function ShareAwardCard({ award, earned, children }: ShareAwardCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'idle' | 'generating' | 'done'>('idle');
  const tier = TIER_STYLES[award.tier] || TIER_STYLES.bronze;
  const Icon = ICON_MAP[award.icon] || Trophy;

  const generateImage = async (): Promise<Blob | null> => {
    if (!cardRef.current) return null;
    setStatus('generating');
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 3,
        cacheBust: true,
      });
      const res = await fetch(dataUrl);
      return await res.blob();
    } catch {
      setStatus('idle');
      return null;
    }
  };

  const handleDownload = async () => {
    const blob = await generateImage();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `award-${award.key}.png`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('done');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const handleShare = async () => {
    const blob = await generateImage();
    if (!blob) return;
    const file = new File([blob], `award-${award.key}.png`, { type: 'image/png' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: `🏅 ${award.title}`,
          text: `Tôi vừa đạt huy chương "${award.title}" - ${award.desc}!`,
          files: [file],
        });
      } catch {
        // User cancelled
      }
    } else {
      // Fallback to download
      await handleDownload();
    }
    setStatus('done');
    setTimeout(() => setStatus('idle'), 2000);
  };

  const earnedDate = new Date(earned.earned_at).toLocaleDateString('vi-VN', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md p-0 bg-transparent border-none shadow-none [&>button]:hidden">
        <div className="space-y-4">
          {/* The share card (rendered for screenshot) */}
          <div
            ref={cardRef}
            style={{
              background: `linear-gradient(160deg, hsl(225, 15%, 8%), ${tier.bg}, hsl(225, 15%, 6%))`,
              borderRadius: '24px',
              padding: '40px 32px',
              position: 'relative',
              overflow: 'hidden',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
            }}
          >
            {/* Background pattern */}
            <div style={{
              position: 'absolute', inset: 0, opacity: 0.04,
              backgroundImage: `radial-gradient(circle at 25% 25%, ${tier.accent} 1px, transparent 1px), radial-gradient(circle at 75% 75%, ${tier.accent} 1px, transparent 1px)`,
              backgroundSize: '30px 30px',
            }} />

            {/* Ambient glow */}
            <div style={{
              position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
              width: '80%', height: '60%', borderRadius: '50%',
              background: `radial-gradient(circle, ${tier.glow}, transparent 70%)`,
            }} />

            {/* Content */}
            <div style={{ position: 'relative', textAlign: 'center' }}>
              {/* Medal */}
              <div style={{
                width: 96, height: 96, borderRadius: 28, margin: '0 auto 20px',
                background: tier.gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 0 40px ${tier.glow}, 0 8px 32px hsl(225 15% 4% / 0.5)`,
              }}>
                <Icon style={{ width: 44, height: 44, color: 'white', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }} />
              </div>

              {/* Tier label */}
              <div style={{
                display: 'inline-block', padding: '4px 16px', borderRadius: 20,
                background: tier.gradient, fontSize: 10, fontWeight: 800,
                letterSpacing: '0.2em', textTransform: 'uppercase' as const, color: 'white',
                marginBottom: 16,
              }}>
                {award.tier}
              </div>

              {/* Title */}
              <h2 style={{
                fontSize: 28, fontWeight: 800, color: 'white',
                margin: '0 0 6px', lineHeight: 1.2,
              }}>
                {award.title}
              </h2>

              {/* Description */}
              <p style={{
                fontSize: 14, color: 'hsl(225, 10%, 55%)', margin: '0 0 16px',
                lineHeight: 1.5,
              }}>
                {award.desc}
              </p>

              {/* Date */}
              <p style={{
                fontSize: 11, color: 'hsl(225, 10%, 40%)',
                fontFamily: 'monospace', margin: 0,
              }}>
                Đạt được · {earnedDate}
              </p>

              {/* Branding */}
              <div style={{
                marginTop: 24, paddingTop: 16,
                borderTop: '1px solid hsl(225 10% 15%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Trophy style={{ width: 12, height: 12, color: 'hsl(225 10% 30%)' }} />
                <span style={{ fontSize: 10, color: 'hsl(225 10% 30%)', letterSpacing: '0.15em', textTransform: 'uppercase' as const, fontWeight: 600 }}>
                  Fitness Tracker
                </span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 px-1">
            <Button
              variant="outline"
              className="flex-1 rounded-xl border-border/30 bg-card/80 backdrop-blur-xl"
              onClick={handleDownload}
              disabled={status === 'generating'}
            >
              {status === 'done' ? <Check className="w-4 h-4 mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              {status === 'generating' ? 'Đang tạo...' : status === 'done' ? 'Đã lưu!' : 'Tải ảnh'}
            </Button>
            <Button
              className="flex-1 rounded-xl"
              onClick={handleShare}
              disabled={status === 'generating'}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Chia sẻ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

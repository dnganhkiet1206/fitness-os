import { useEffect } from 'react';

import { AwardCelebrationModal } from '@/components/ascnd/award-celebration';
import { MascotCelebrationModal } from '@/components/ascnd/mascot-unlock';
import { triggerMascotAction } from '@/hooks/use-mascot-emotion';
import { dequeueCelebration, useCelebrationHead } from '@/lib/celebration-queue';
import { MASCOTS } from '@/lib/mascots';

/**
 * Renders the single celebration at the front of the shared queue —
 * award medals and mascot unlocks take turns instead of stacking two
 * full-screen modals. Each modal calls dequeueCelebration on close,
 * which promotes the next item.
 */
export function CelebrationHost() {
  const head = useCelebrationHead();

  // Any award medal or mascot unlock makes the buddy celebrate too.
  useEffect(() => {
    if (head) triggerMascotAction('celebrate');
  }, [head?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!head) return null;

  if (head.kind === 'award') {
    return <AwardCelebrationModal key={head.id} award={head.award} onClose={dequeueCelebration} />;
  }

  const mascot = MASCOTS.find((m) => m.id === head.mascotId);
  // Ids are always derived from MASCOTS, so this is defensive only
  if (!mascot) return null;
  return <MascotCelebrationModal key={head.id} mascot={mascot} onClose={dequeueCelebration} />;
}

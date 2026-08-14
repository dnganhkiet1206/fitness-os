import { useEffect } from 'react';

import { useQuestAutoClaim } from '@/hooks/use-quest-autoclaim';
import { loadPersonalModel } from '@/lib/personal-model';

/**
 * The watcher, as a component, so it can be mounted in the root's JSX.
 *
 * It draws nothing. A hook cannot be called from `_layout`'s tree without a
 * component to hang it on, and putting the call inside the layout component
 * itself would run it above the providers the queries need.
 */
export function QuestAutoClaim() {
  useQuestAutoClaim();
  /* The learned model is read once per launch, here, because this is already
     the one component mounted for the whole session whose entire job is the
     quest stream — and the store it fills is what ranks Koa's sentence. */
  useEffect(() => {
    loadPersonalModel();
  }, []);
  return null;
}

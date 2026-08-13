import { useQuestAutoClaim } from '@/hooks/use-quest-autoclaim';

/**
 * The watcher, as a component, so it can be mounted in the root's JSX.
 *
 * It draws nothing. A hook cannot be called from `_layout`'s tree without a
 * component to hang it on, and putting the call inside the layout component
 * itself would run it above the providers the queries need.
 */
export function QuestAutoClaim() {
  useQuestAutoClaim();
  return null;
}

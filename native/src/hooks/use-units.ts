import { useProfile } from '@/hooks/useTodayData';
import type { HeightUnit, WeightUnit } from '@/lib/units';

/**
 * The user's chosen display units, read from their profile. Defaults to
 * metric until the profile loads. Body metrics are always stored metric;
 * these drive display/entry conversion only.
 */
export function useUnits(): { weight: WeightUnit; height: HeightUnit } {
  const { data: profile } = useProfile();
  return {
    weight: profile?.units_weight === 'lbs' ? 'lbs' : 'kg',
    height: profile?.units_height === 'in' ? 'in' : 'cm',
  };
}

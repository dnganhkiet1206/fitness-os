import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';

export type Tier = 'free' | 'plus' | 'max';

/** Ranked, so a gate can ask "at least plus" instead of listing tiers. */
const RANK: Record<Tier, number> = { free: 0, plus: 1, max: 2 };

/**
 * What this account has paid for.
 *
 * ── why it reads a table and not a receipt ──
 *
 * The device knows what it bought — StoreKit will happily say so — and that
 * answer is worth nothing here, because it comes from the same place a person
 * wanting a free subscription would tamper with. `entitlements` is written only
 * by the server, after asking Apple, and has no write policy for any user role;
 * reading it is the one way to learn the tier that cannot be forged from the
 * client.
 *
 * ── it fails to `free`, and that has to be deliberate ──
 *
 * A network error, an expired session, a row that does not exist yet: all of
 * them land on `free`. That is the safe direction, and it is also the one that
 * will occasionally annoy somebody who has paid — which is why `refetch` is
 * exposed and why the paywall screen offers "restore purchases" rather than
 * treating `free` as final. Getting this backwards, so that an error implies
 * "probably subscribed", is how a paid app quietly becomes a free one.
 */
export function useEntitlement() {
  const { user } = useAuth();

  const q = useQuery({
    queryKey: ['entitlement', user?.id],
    enabled: !!user,
    /* Subscriptions change rarely and the answer is needed on nearly every
       screen; a minute of staleness costs nothing and saves a request per
       navigation. Apple's webhook is what makes a downgrade arrive promptly —
       this cache only decides how soon the app notices. */
    staleTime: 60_000,
    queryFn: async (): Promise<{ tier: Tier; expiresAt: string | null }> => {
      const { data, error } = await supabase
        .from('entitlements')
        .select('tier, expires_at')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { tier: 'free', expiresAt: null };

      /* Expiry is enforced here as well as on the server. The row is written
         by a webhook, and a webhook that has not arrived yet — Apple retries,
         networks fail — would otherwise leave a lapsed subscription looking
         current until it did. */
      const expiresAt = data.expires_at ?? null;
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return { tier: 'free', expiresAt };
      }
      return { tier: (data.tier as Tier) ?? 'free', expiresAt };
    },
  });

  const tier: Tier = q.data?.tier ?? 'free';

  return {
    tier,
    expiresAt: q.data?.expiresAt ?? null,
    /** `at least this tier` — never an equality test, or `max` fails a `plus` gate. */
    has: (needed: Tier) => RANK[tier] >= RANK[needed],
    isPending: q.isPending,
    isError: q.isError,
    refetch: q.refetch,
  };
}

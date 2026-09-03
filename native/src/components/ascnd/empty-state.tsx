import * as Haptics from 'expo-haptics';
import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { useMascotIdentity } from '@/hooks/use-mascot';
import { PressScale } from '@/components/ascnd/press-scale';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * The screen somebody sees before they have used it.
 *
 * ── why this is one component now ──
 *
 * Twenty-six screens drew an empty state and no two drew it the same way.
 * There were ten naming schemes for the same element — `empty`, `emptyText`,
 * `emptyTitle`, `emptyMsg`, `emptyHint`, `emptyBody`, `emptyLine`, `emptyCard`,
 * `emptyCta`, `emptyBtn` — which is what happens when a thing is rebuilt each
 * time instead of being made once. A user meets several of these in their first
 * five minutes, and they were not recognisably the same app.
 *
 * ── and why most of them needed a button ──
 *
 * Five of the twenty-six offered a way out. The rest said the shelf was empty
 * and stopped: Sleep Insights told a new user there was no sleep data and left
 * them to find the log sheet on another tab.
 *
 * That is the whole difference between an empty state and a dead end. Every
 * app worth copying treats this the same way — an icon, one line saying what
 * goes here, and the button that puts the first one in. It is the least visited
 * screen state in a mature account and the most visited one in a new account,
 * which is exactly backwards from how much attention it usually gets.
 *
 * ── the action is optional, and the omission is meaningful ──
 *
 * Some of these genuinely have no button. What the coach remembers is learned
 * from conversation, not typed in; a chart saying it needs four readings to
 * draw a trend is asking for time, not a tap. Inventing a destination for those
 * would be worse than the dead end, because a button that does not lead to the
 * thing it promises is a lie rather than an absence. So `action` is optional
 * and left out on purpose in those places.
 *
 * ── and sometimes the icon is Koa ──
 *
 * `companion` swaps the glyph chip for the app's own character. Not everywhere:
 * only where the screen is empty because of something *the person* has not done
 * and can do in one tap from this very state.
 *
 * That line is the whole rule, and it comes from what a mascot is for. Duolingo
 * puts Duo at exactly these moments because a character turns a dead end into a
 * small piece of theatre — and the same character in front of an emptiness the
 * person cannot fix today is not charming, it is a cartoon shrugging at you. A
 * chart that needs seven days of data is not the user's fault and gets the
 * glyph; "no sessions logged" is a state one button changes, and gets Koa.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  companion = false,
}: {
  icon: LucideIcon;
  /** One line. What goes here, not an apology for it being missing. */
  title: string;
  /** Optional second line — why it is empty, or what to do about it. */
  hint?: string;
  /** Omit when there is genuinely nothing to press. */
  action?: { label: string; onPress: () => void };
  /**
   * Show Koa instead of the glyph.
   *
   * Only true where the emptiness is the person's to change and `action` is the
   * way to change it — see the note above. `icon` is still required and is what
   * shows if the companion is switched off in settings, so no screen loses its
   * empty state to a preference.
   */
  companion?: boolean;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  /* Identity only — the same rule the error card is built on. This renders
     *because* a read came back with nothing, and a hook that reads would put a
     fresh observer on the very query that came back empty. See
     `useMascotIdentity`. */
  const { enabled, mascot } = useMascotIdentity();
  const showKoa = enabled;

  return (
    <View style={styles.root}>
      {companion && showKoa ? (
        /* No chip behind it: the chip exists to stop a lone outline glyph
           reading as a broken image, and a drawn character has no such
           problem. `happy` rather than `sad` on purpose — a disappointed
           companion in front of a screen you have not used yet is a scold
           before you have done anything, which is the failure mode a mascot
           has to avoid rather than lean into. */
        <MascotFigure mascot={mascot} size={72} emotion="happy" animated />
      ) : (
        /* A tinted chip rather than a bare glyph: a lone outline icon on a dark
           card reads as a broken image. */
        <View style={styles.chip}>
          <Icon icon={icon} size={24} color={c.mutedForeground} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {action ? (
        <PressScale
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={() => {
            Haptics.selectionAsync();
            action.onPress();
          }}>
          <Text style={styles.buttonText}>{action.label}</Text>
        </PressScale>
      ) : null}
    </View>
  );
}

/*
  ── sized for the room it is standing in ──

  The first version of this was built to the same scale as a row inside a busy
  card: a 44pt icon chip, a footnote-sized label, and a 40pt button. That is the
  right scale for a control competing with a dozen others. It is the wrong scale
  for the only thing on the screen — a small cluster marooned in a page of
  space, which reads as timid rather than calm.

  40pt was also under Apple's 44pt floor. Small **icon** buttons are allowed to
  be under it and are common — a 28pt glyph with `hitSlop` out to 44 is what
  most of this app's row controls do, and nobody notices the invisible margin.
  A button with a word in it has no such excuse: there is no aesthetic reason
  for it to be short, and a labelled button drawn under the floor simply looks
  weak. This one is the single action on an empty page, so it is 48.

  `minWidth` matters more than it looks. A pill sized to its text makes "Ghi"
  a third of the width of "Nhập số đo", so the same component lands at three
  different sizes across three screens and stops reading as one thing.
*/
const stylesFor = makeStyles((c) => ({
  root: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  chip: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: { ...type.title2, color: c.foreground, textAlign: 'center' },
  hint: { ...type.footnote, color: c.mutedForeground, textAlign: 'center', lineHeight: 18, maxWidth: 280 },
  button: {
    marginTop: spacing.sm,
    height: 48,
    minWidth: 176,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    backgroundColor: c.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { ...type.headline, color: c.primaryForeground },
}));

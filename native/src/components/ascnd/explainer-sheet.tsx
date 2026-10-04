/**
 * Shared shell for the term/body explainer sheets (activity, nutrition),
 * 03/10/2026.
 *
 * Both sheets were the same FormSheet + lede paragraph + rows of
 * term/body with byte-identical styles — only the copy differed. This
 * component owns the shell; each sheet keeps its copy as data.
 *
 * readiness-explainer and training-explainer are NOT migrated: their bodies
 * are genuinely different structures (tagged parts with weights, sections),
 * and forcing them into term/body rows would be a redesign, not a dedup.
 */
import { Text, View } from 'react-native';

import { FormSheet } from '@/components/ascnd/form-sheet';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

export interface ExplainerRow {
  term: string;
  body: string;
}

export function ExplainerSheet({
  visible,
  onClose,
  title,
  lede,
  rows,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  lede: string;
  rows: ExplainerRow[];
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  return (
    <FormSheet visible={visible} title={title} onClose={onClose}>
      <Text style={styles.lede}>{lede}</Text>
      {rows.map((r) => (
        <View key={r.term} style={styles.row}>
          <Text style={styles.term}>{r.term}</Text>
          <Text style={styles.body}>{r.body}</Text>
        </View>
      ))}
    </FormSheet>
  );
}

const stylesFor = makeStyles((c) => ({
  lede: { ...type.body, color: c.foreground, marginBottom: spacing.md },
  row: { gap: 4, marginBottom: spacing.md },
  term: { ...type.headline, color: c.foreground },
  body: { ...type.footnote, color: c.mutedForeground, lineHeight: 19 },
}));

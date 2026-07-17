import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, type } from '@/constants/ascnd';

/**
 * Minimal markdown renderer for AI chat replies — mirrors what the web
 * shows via ReactMarkdown for the subset the coach actually produces:
 * #/##/### headings, -/* bullets, 1. numbered lists, **bold** inline.
 */
export function MarkdownLite({ text }: { text: string }) {
  const blocks = text.split('\n');
  return (
    <View style={styles.root}>
      {blocks.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.trim() === '') return <View key={i} style={styles.gap} />;

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} style={heading[1].length === 1 ? styles.h1 : styles.h2}>
              {renderInline(heading[2])}
            </Text>
          );
        }

        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.body}>{renderInline(bullet[1])}</Text>
            </View>
          );
        }

        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletNum}>{numbered[1]}.</Text>
              <Text style={styles.body}>{renderInline(numbered[2])}</Text>
            </View>
          );
        }

        return (
          <Text key={i} style={styles.body}>
            {renderInline(line)}
          </Text>
        );
      })}
    </View>
  );
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <Text key={i} style={styles.bold}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

const styles = StyleSheet.create({
  root: { gap: 2 },
  gap: { height: 6 },
  h1: { ...type.headline, fontSize: 16, color: colors.foreground, marginTop: 2 },
  h2: { ...type.headline, fontSize: 14, color: colors.foreground, marginTop: 2 },
  body: { ...type.body, color: colors.foreground, lineHeight: 21, flexShrink: 1 },
  bold: { fontWeight: '700', color: colors.foreground },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 2 },
  bulletDot: { ...type.body, color: colors.mutedForeground, lineHeight: 21 },
  bulletNum: { ...type.body, color: colors.mutedForeground, lineHeight: 21 },
});

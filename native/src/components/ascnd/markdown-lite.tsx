import { StyleSheet, Text, View } from 'react-native';

import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';

/**
 * Minimal markdown renderer for AI chat replies — mirrors what the web
 * shows via ReactMarkdown for the subset the coach actually produces:
 * #/##/### headings, -/* bullets, 1. numbered lists, **bold** inline.
 */
export function MarkdownLite({
  text,
  mutedColor,
}: {
  text: string;
  /**
   * Colour for the list markers.
   *
   * They default to `mutedForeground`, which is measured against a card. The
   * coach's bubbles are `LiquidGlass` over a drifting aura, where that grey
   * lands at 2.57:1 — so on the one screen this component is used, every
   * bullet and every number would be the part of a list you cannot see.
   * `colors.glassMuted` carries the measurement.
   */
  mutedColor?: string;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const blocks = text.split('\n');
  const marker = mutedColor ? { color: mutedColor } : null;
  return (
    <View style={styles.root}>
      {blocks.map((raw, i) => {
        const line = raw.trimEnd();
        if (line.trim() === '') return <View key={i} style={styles.gap} />;

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          return (
            <Text key={i} style={heading[1].length === 1 ? styles.h1 : styles.h2}>
              {renderInline(heading[2], styles)}
            </Text>
          );
        }

        const bullet = line.match(/^\s*[-*]\s+(.*)$/);
        if (bullet) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, marker]}>•</Text>
              <Text style={styles.body}>{renderInline(bullet[1], styles)}</Text>
            </View>
          );
        }

        const numbered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
        if (numbered) {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletNum, marker]}>{numbered[1]}.</Text>
              <Text style={styles.body}>{renderInline(numbered[2], styles)}</Text>
            </View>
          );
        }

        return (
          <Text key={i} style={styles.body}>
            {renderInline(line, styles)}
          </Text>
        );
      })}
    </View>
  );
}

/*
  `styles` vào bằng THAM SỐ, không bằng hook.

  Bản trước gọi `usePalette()` ngay ở đây, và hàm này được gọi MỘT LẦN CHO MỖI
  DÒNG bên trong `blocks.map(…)` — bốn chỗ gọi, mỗi chỗ trong một nhánh khác
  nhau của cùng vòng lặp. Tức số lần gọi hook thay đổi theo số dòng của văn bản
  và theo nhánh mà từng dòng rơi vào: đúng cả hai điều mà quy tắc hook cấm.

  Một văn bản dài ra một dòng là React ném "Rendered more hooks than during the
  previous render" — và ở màn hình duy nhất dùng component này, văn bản đến từ
  câu trả lời của trợ lý, tức nó đổi độ dài ở mỗi tin nhắn.

  TypeScript không thấy chuyện đó. `tools/theme-migrate.mjs` chèn nhầm ở lần
  chạy đầu, khi nó còn nhận MỌI hàm ở phạm vi module là component; nó đã học
  quy ước tên viết hoa từ đó, và `tools/hook-scope.mjs` canh cho lần sau.
*/
function renderInline(text: string, styles: ReturnType<typeof stylesFor>): React.ReactNode {
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

const stylesFor = makeStyles((c) => ({
  root: { gap: 2 },
  gap: { height: 6 },
  h1: { ...type.headline, fontSize: 16, color: c.foreground, marginTop: 2 },
  h2: { ...type.headline, fontSize: 14, color: c.foreground, marginTop: 2 },
  body: { ...type.body, color: c.foreground, lineHeight: 21, flexShrink: 1 },
  bold: { fontWeight: '700', color: c.foreground },
  bulletRow: { flexDirection: 'row', gap: spacing.sm, paddingLeft: 2 },
  bulletDot: { ...type.body, color: c.mutedForeground, lineHeight: 21 },
  bulletNum: { ...type.body, color: c.mutedForeground, lineHeight: 21 },
}));

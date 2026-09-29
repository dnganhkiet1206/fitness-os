import { Text, View } from 'react-native';

import { Segmented } from '@/components/ascnd/segmented';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { styleLabel } from '@/lib/community-art';

/**
 * Chọn phong cách ảnh cho bài sắp đăng (#163). Chỉ hiện khi thư viện có từ hai
 * phong cách trở lên cho loại bài này — một lựa chọn duy nhất không phải một
 * lựa chọn.
 */
export function ArtStylePicker({
  styles: options,
  value,
  onChange,
}: {
  styles: readonly string[];
  value: string | null;
  onChange: (style: string) => void;
}) {
  const c = usePalette();
  const s = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  if (options.length < 2 || !value) return null;
  return (
    <View style={s.wrap}>
      <Text style={s.label}>{i18n.nCmArtStyle}</Text>
      <Segmented
        variant="capsule"
        options={options.map((k) => ({ key: k, label: styleLabel(k, lang === 'vi' ? 'vi' : 'en') }))}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  wrap: { gap: spacing.sm },
  label: { ...type.footnote, color: c.mutedForeground, fontWeight: '600' },
}));

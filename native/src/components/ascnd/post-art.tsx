import { Image } from 'expo-image';
import { ChefHat, Dumbbell, TrendingUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Icon } from '@/components/ascnd/icon';
import { radius } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useAppSettings } from '@/hooks/use-app-settings';
import { usePalette } from '@/hooks/use-palette';
import { supabase } from '@/integrations/supabase/client';
import type { ArtKind, CommunityArt } from '@/lib/community-art';

/**
 * Ảnh của bài, lấy từ thư viện do app cấp (#163).
 *
 * ── thẻ không bao giờ vỡ ──
 *
 * Tỉ lệ cố định (16:9), nên thẻ cao đúng như nhau trước và sau khi ảnh về —
 * feed không nhảy dưới ngón tay. Dưới ảnh luôn có một NỀN theo loại bài (một
 * glyph lớn, mờ, trên mặt `secondary`): đó là thứ người ta thấy khi ảnh chưa
 * tải xong, khi tải hỏng, và ở bài đăng trước #163 (chưa có ảnh). Ba trường hợp
 * ấy ra cùng một hình, và không trường hợp nào là một ô vỡ hay một khoảng trắng.
 *
 * ── tải hỏng: khung tự gỡ ảnh, không trông vào thư viện ──
 *
 * Tải hỏng thì `<Image>` không còn được vẽ (`failed`), nên nền ở dưới lộ ra, và
 * khung thôi tự xưng là một ảnh (`role="img"` mang alt của một ảnh không có trên
 * màn). Đổi `uri` thì thử lại — một lần, không vòng lặp.
 *
 * Trước đây nhánh này dựa vào expo-image tự gỡ `<img>` khi lỗi. Đo trên bản web
 * (expo-image 57.0.1, 30/09, sáng lẫn tối):
 *   · lần tải ĐẦU hỏng (bài trỏ vào ảnh 404 trên feed): nó có gỡ, sau ~400 ms;
 *   · ĐỔI `uri` sang một ảnh hỏng (màn chia sẻ: Mono → Neon 404): ảnh CŨ ở lại
 *     — sau 6 giây khung vẫn hiện ảnh Mono, dưới alt của Neon. Người ta thấy một
 *     ảnh không phải thứ mình vừa chọn.
 * Bản native chưa đo được ở đây. Nay khung tự biết, không trông vào thư viện.
 *
 * Bucket `community-art` công khai đọc (migration `20261002110000`), nên URL là
 * URL công khai — không ký, không hết hạn giữa lúc cuộn.
 */
export function PostArt({ art, kind }: { art: CommunityArt | null; kind: ArtKind }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const { lang } = useAppSettings();
  const uri = art ? supabase.storage.from('community-art').getPublicUrl(art.path).data.publicUrl : null;
  const glyph = kind === 'recipe' ? ChefHat : kind === 'progress' ? TrendingUp : Dumbbell;
  const alt = art ? (lang === 'vi' ? art.alt_vi : art.alt_en) : undefined;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [uri]);
  const showImage = !!uri && !failed;

  return (
    <View
      style={styles.frame}
      accessible={showImage}
      accessibilityRole={showImage ? 'image' : undefined}
      accessibilityLabel={showImage ? alt : undefined}
      importantForAccessibility={showImage ? 'yes' : 'no-hide-descendants'}
      testID="post-art">
      <View style={styles.backdrop} importantForAccessibility="no-hide-descendants">
        <Icon icon={glyph} size={44} color={alpha(c.mutedForeground, 0.45)} strokeWidth={1.5} />
      </View>
      {showImage ? (
        <Image
          source={{ uri }}
          style={styles.image}
          contentFit="cover"
          transition={180}
          accessible={false}
          onError={() => setFailed(true)}
          testID="post-art-image"
        />
      ) : null}
    </View>
  );
}

const stylesFor = makeStyles((c) => ({
  frame: {
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: c.secondary,
  },
  backdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
}));

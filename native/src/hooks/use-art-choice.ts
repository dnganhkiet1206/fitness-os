import { useState } from 'react';

import { useCommunityArt } from '@/hooks/use-community';
import { artStyles, pickArt, type ArtKind } from '@/lib/community-art';

/**
 * Ảnh cho bài đang soạn (#163): app chọn sẵn một ảnh hợp nội dung; người dùng
 * chỉ đổi PHONG CÁCH. Chưa chọn phong cách thì ảnh hợp nhất của mọi phong cách;
 * chọn rồi thì ảnh hợp nhất TRONG phong cách ấy — nên đổi phong cách là đổi ảnh.
 *
 * Thư viện chưa có ảnh nào cho loại bài này thì `art` là `null`: bài đi đường
 * cũ, và thẻ tự vẽ nền theo loại bài.
 */
export function useArtChoice(kind: ArtKind, tags: readonly string[]) {
  const lib = useCommunityArt();
  const [style, setStyle] = useState<string | null>(null);
  const library = lib.data ?? [];
  const art = pickArt(library, kind, { tags, style });
  return { art, styles: artStyles(library, kind), style: art?.style ?? null, setStyle, pending: lib.isPending };
}

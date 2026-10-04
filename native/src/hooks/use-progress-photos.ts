import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { confirmWrite } from '@/lib/write-result';
import { localDateStr } from '@/lib/local-date';
import { signPhotos } from '@/lib/photo-urls';
import { readAllPages } from '@/lib/read-all';
import { useOnlineMutation } from '@/hooks/use-online-mutation';
import { now } from '@/lib/offline-class';

const BUCKET = 'progress-photos';

export interface ProgressPhoto {
  id: string;
  date: string;
  photo_url: string;
  pose: string;
  notes: string | null;
  signedUrl?: string;
}

/** base64 → Uint8Array, dependency-free (RN has no atob by default) */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const outLen = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(outLen);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e1 = B64.indexOf(clean[i]);
    const e2 = B64.indexOf(clean[i + 1]);
    const e3 = B64.indexOf(clean[i + 2]);
    const e4 = B64.indexOf(clean[i + 3]);
    const n = (e1 << 18) | (e2 << 12) | ((e3 & 63) << 6) | (e4 & 63);
    if (p < outLen) bytes[p++] = (n >> 16) & 0xff;
    if (e3 !== -1 && p < outLen) bytes[p++] = (n >> 8) & 0xff;
    if (e4 !== -1 && p < outLen) bytes[p++] = n & 0xff;
  }
  return bytes;
}

/** Ảnh tiến trình đọc theo trang này, tới HẾT (#179). */
const PHOTO_PAGE = 200;

/**
 * Mọi ảnh tiến trình của người dùng, mới nhất trước.
 *
 * Từng là `.order('date', desc).limit(50)`: từ ảnh thứ 51, ảnh CŨ NHẤT — ảnh
 * "trước", thứ duy nhất làm cả thư viện có nghĩa — lặng lẽ rơi khỏi lưới, và
 * con số trên hàng "Ảnh tiến trình" ở Tập luyện › Cơ thể dừng ở 50 (#179). Nay
 * đọc hết theo trang trên thứ tự toàn phần `(date, id)` (nhiều ảnh cùng ngày:
 * trước, nghiêng, sau), và ký URL cả loạt (`signPhotos`).
 */
export function useProgressPhotos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['progress_photos', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const rows = await readAllPages(
        (from, to) =>
          supabase
            .from('progress_photos')
            .select('*')
            .eq('user_id', user!.id)
            .order('date', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to),
        PHOTO_PAGE,
      );
      return (await signPhotos(rows, (paths) => supabase.storage.from(BUCKET).createSignedUrls(paths, 3600))) as ProgressPhoto[];
    },
  });
}

export function useUploadProgressPhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useOnlineMutation({
    meta: { offline: now(6) },
    mutationFn: async ({ base64, pose, notes }: { base64: string; pose: string; notes?: string }) => {
      const dateStr = localDateStr();
      const path = `${user!.id}/${dateStr}-${pose}-${Date.now()}.jpg`;
      const bytes = base64ToBytes(base64);
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, bytes, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { error } = await supabase.from('progress_photos').insert({
        user_id: user!.id,
        date: dateStr,
        photo_url: path,
        pose,
        notes: notes || '',
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress_photos', user?.id] }),
  });
}

export function useDeleteProgressPhoto() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useOnlineMutation({
    meta: { offline: now(3) },
    mutationFn: async ({ id, photo_url }: { id: string; photo_url: string }) => {
      let storagePath = photo_url;
      if (photo_url.startsWith('http')) {
        storagePath = photo_url.split(`/${BUCKET}/`)[1] || '';
      }
      /*
        ── the row goes first, and that order is the whole point ──

        This used to remove the object and then delete the row. The two are not
        one transaction and cannot be made into one, so the only question is
        which failure a person is left holding.

        Object first: the file is gone the instant the request lands, and if the
        row delete then fails — offline, RLS, anything — the list still shows
        the photo, its signed URL 404s, and pressing delete again re-runs a
        removal of a file that no longer exists. A card that cannot be got rid
        of and cannot be looked at, permanently.

        Row first: if the object removal fails, an unreferenced file is left in
        the bucket. Nothing displays it, nothing shows it to anybody, and
        deleting the account sweeps the folder wholesale. Invisible, and already
        cleaned up by something that exists.

        `confirmWrite` throws on a failed delete, so the removal below is
        genuinely only reached once the row is gone.
      */
      await confirmWrite(
        supabase.from('progress_photos').delete().eq('id', id).eq('user_id', user!.id),
        'nCxNothingWrittenPhoto',
      );
      if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['progress_photos', user?.id] }),
  });
}

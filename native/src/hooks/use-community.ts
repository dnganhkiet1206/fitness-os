import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/lib/toast';
import { confirmWrite, NothingWrittenError } from '@/lib/write-result';
import { useAuth } from './use-auth';
import { useOnlineMutation } from './use-online-mutation';
import type { TemplateExercise } from './use-library';

/**
 * Dữ liệu tab Cộng đồng — giai đoạn 1: danh tính, feed, bài Workout, tương
 * tác, an toàn. Schema và mọi quyền nằm ở
 * `supabase/migrations/20260927120000_community_foundation.sql`; bộ test chạy
 * thật của nó ở `supabase/tests/community/`.
 *
 * ── vì sao đọc bằng nhiều truy vấn nhỏ thay vì một truy vấn nhúng ──
 *
 * PostgREST nhúng được tác giả vào bài (`select=*,author:community_profiles(*)`)
 * trong một lượt. Nhưng thế giới giả của bộ chạy web (`tools/live-world.mjs`)
 * mô phỏng BỘ LỌC chứ không mô phỏng phép nhúng — một feed đọc bằng phép nhúng
 * sẽ luôn trống ở mọi ảnh dựng, tức không ai nhìn thấy nó trước máy thật. Bốn
 * truy vấn nhỏ, mỗi cái đi qua RLS của bảng mình, là cái giá rẻ hơn.
 *
 * ── bài KHÔNG được tạo ở đây bằng insert ──
 *
 * `community_posts` không có policy INSERT. Bài sinh ra qua RPC
 * `share_workout`, nơi server dựng thẻ từ buổi tập thật của người gọi.
 */

export type CommunityTab = 'following' | 'discover';

export interface CommunityAuthor {
  user_id: string;
  handle: string;
  display_name: string;
  mascot_id: string | null;
  is_official: boolean;
  bio?: string;
}

export interface WorkoutExerciseLine {
  exerciseId: string | null;
  exerciseName: string;
  library: boolean;
  sets: number;
  weight: number;
  reps: number;
}

export interface WorkoutPayload {
  title: string | null;
  performedAt: string | null;
  volumeKg: number;
  pr: boolean;
  minutes: number | null;
  exerciseCount: number;
  exercises: WorkoutExerciseLine[];
}

/** Ba loại bài của MVP — khớp CHECK ở `20260927130000_community_post_kinds.sql`. */
export type PostKind = 'workout' | 'progress' | 'recipe';

export interface FeedPost {
  id: string;
  kind: PostKind;
  /** Payload đã đọc theo hình Workout. CHỈ có nghĩa khi `kind === 'workout'`. */
  payload: WorkoutPayload;
  /** Payload gốc từ server — thẻ Progress và Recipe tự đọc từ đây bằng hàm
      đọc phòng thủ của riêng chúng, như `readWorkoutPayload` làm cho Workout. */
  raw: unknown;
  caption: string;
  visibility: 'public' | 'followers';
  like_count: number;
  comment_count: number;
  save_count: number;
  hidden: boolean;
  created_at: string;
  author: CommunityAuthor | null;
  liked: boolean;
  saved: boolean;
  mine: boolean;
}

export interface CommunityComment {
  id: string;
  post_id: string;
  body: string;
  created_at: string;
  author: CommunityAuthor | null;
  mine: boolean;
}

const PROFILE_COLS = 'user_id, handle, display_name, mascot_id, is_official, bio';
/* Export cho Thư viện Đã lưu (#10, B — chủ dự án cho B sửa đúng bốn điểm ở
   #23): thư viện dựng FeedPost y như feed, nên đọc lại chính ba thứ này. */
export const POST_COLS =
  'id, author_id, kind, payload, caption, visibility, like_count, comment_count, save_count, hidden, created_at';
const PAGE = 30;

/* Payload là JSON do server dựng, nhưng một bài cũ hay một seed viết tay vẫn có
   thể thiếu trường — thẻ không được phép nổ vì thế. Đọc phòng thủ từng trường. */
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || d);
export function readWorkoutPayload(raw: unknown): WorkoutPayload {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(p.exercises) ? p.exercises : [];
  const exercises: WorkoutExerciseLine[] = list.map((e) => {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    return {
      exerciseId: typeof x.exerciseId === 'string' && x.exerciseId ? x.exerciseId : null,
      exerciseName: typeof x.exerciseName === 'string' ? x.exerciseName : '?',
      library: x.library === true,
      sets: num(x.sets),
      weight: num(x.weight),
      reps: num(x.reps),
    };
  });
  const minutes = num(p.minutes, NaN);
  return {
    title: typeof p.title === 'string' && p.title.trim() ? p.title : null,
    performedAt: typeof p.performedAt === 'string' ? p.performedAt : null,
    volumeKg: num(p.volumeKg),
    pr: p.pr === true,
    minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null,
    exerciseCount: num(p.exerciseCount, exercises.length),
    exercises,
  };
}

export type PostRow = {
  id: string;
  author_id: string;
  kind: string;
  payload: unknown;
  caption: string;
  visibility: string;
  like_count: number;
  comment_count: number;
  save_count: number;
  hidden: boolean;
  created_at: string;
};

/** Gắn tác giả + trạng thái thích/lưu của NGƯỜI XEM vào một loạt bài. */
export async function hydrate(rows: PostRow[], me: string): Promise<FeedPost[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const [authors, likes, saves] = await Promise.all([
    supabase.from('community_profiles').select(PROFILE_COLS).in('user_id', authorIds),
    supabase.from('community_likes').select('post_id').eq('user_id', me).in('post_id', ids),
    supabase.from('community_saves').select('post_id').eq('user_id', me).in('post_id', ids),
  ]);
  if (authors.error) throw authors.error;
  if (likes.error) throw likes.error;
  if (saves.error) throw saves.error;
  const byId = new Map((authors.data ?? []).map((a) => [a.user_id, a as CommunityAuthor]));
  const liked = new Set((likes.data ?? []).map((l) => l.post_id));
  const saved = new Set((saves.data ?? []).map((s) => s.post_id));
  return rows.map((r) => ({
    id: r.id,
    kind: (r.kind === 'progress' || r.kind === 'recipe' ? r.kind : 'workout') as PostKind,
    payload: readWorkoutPayload(r.payload),
    raw: r.payload,
    caption: r.caption ?? '',
    visibility: r.visibility === 'followers' ? 'followers' : 'public',
    like_count: r.like_count ?? 0,
    comment_count: r.comment_count ?? 0,
    save_count: r.save_count ?? 0,
    hidden: !!r.hidden,
    created_at: r.created_at,
    author: byId.get(r.author_id) ?? null,
    liked: liked.has(r.id),
    saved: saved.has(r.id),
    mine: r.author_id === me,
  }));
}

/* ── danh tính ──────────────────────────────────────────────────────────── */

export function useMyCommunityProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_me', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_profiles')
        .select(PROFILE_COLS)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as CommunityAuthor | null) ?? null;
    },
  });
}

export class HandleTakenError extends Error {}

export function useSaveCommunityProfile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (p: { handle: string; display_name: string; bio: string; mascot_id: string | null }) => {
      const { error } = await supabase
        .from('community_profiles')
        .upsert(
          {
            user_id: user!.id,
            handle: p.handle.trim().toLowerCase(),
            display_name: p.display_name.trim(),
            bio: p.bio.trim(),
            mascot_id: p.mascot_id,
          },
          { onConflict: 'user_id' },
        )
        .select('user_id')
        .single();
      /* 23505 trên `handle` là tên đã có người dùng — câu trả lời người ta sửa
         được, nên nó có kiểu riêng thay vì rơi vào lỗi chung. */
      if (error?.code === '23505') throw new HandleTakenError(error.message);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_me', user?.id] });
      qc.invalidateQueries({ queryKey: ['community_feed'] });
    },
  });
}

/* ── feed ───────────────────────────────────────────────────────────────── */

export function useCommunityFeed(tab: CommunityTab) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_feed', user?.id, tab],
    enabled: !!user,
    queryFn: async () => {
      const me = user!.id;
      let q = supabase.from('community_posts').select(POST_COLS).order('created_at', { ascending: false }).limit(PAGE);
      if (tab === 'following') {
        const { data: f, error: fErr } = await supabase
          .from('community_follows')
          .select('followee_id')
          .eq('follower_id', me);
        if (fErr) throw fErr;
        /* Bài của chính mình có mặt ở "Đang theo dõi", như mọi feed theo dõi:
           vừa chia sẻ xong mà quay lại không thấy bài mình là một cú hẫng. */
        q = q.in('author_id', [me, ...(f ?? []).map((x) => x.followee_id)]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return hydrate((data ?? []) as PostRow[], me);
    },
  });
}

export function useCommunityPost(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_post', user?.id, id],
    enabled: !!user && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('community_posts').select(POST_COLS).eq('id', id!).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [post] = await hydrate([data as PostRow], user!.id);
      return post;
    },
  });
}

/** Sửa một bài ở MỌI bộ nhớ đệm đang giữ nó — feed hai tab, trang chi tiết,
    trang hồ sơ — để trái tim đổi ngay dưới ngón tay ở bất cứ đâu. */
function patchPost(qc: QueryClient, id: string, fn: (p: FeedPost) => FeedPost) {
  qc.setQueriesData<FeedPost[]>({ queryKey: ['community_feed'] }, (old) =>
    old?.map((p) => (p.id === id ? fn(p) : p)),
  );
  qc.setQueriesData<FeedPost[]>({ queryKey: ['community_user_posts'] }, (old) =>
    old?.map((p) => (p.id === id ? fn(p) : p)),
  );
  qc.setQueriesData<FeedPost | null>({ queryKey: ['community_post'] }, (old) =>
    old && old.id === id ? fn(old) : old,
  );
}

function useToggle(table: 'community_likes' | 'community_saves', flag: 'liked' | 'saved', count: 'like_count' | 'save_count') {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async ({ postId, on }: { postId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from(table).insert({ post_id: postId, user_id: user!.id });
        // Đã thích từ trước (hai chạm nhanh, hay thiết bị khác) là trạng thái đúng rồi.
        if (error && error.code !== '23505') throw error;
      } else {
        try {
          await confirmWrite(
            supabase.from(table).delete().eq('post_id', postId).eq('user_id', user!.id),
            'Không bỏ được — có thể đã bỏ ở thiết bị khác',
            'post_id',
          );
        } catch (e) {
          /* Không còn dòng nào để xoá = đã bỏ ở thiết bị khác: trạng thái
             người ta muốn ĐÃ đúng, như 23505 ở nhánh trên. Không phải lỗi. */
          if (!(e instanceof NothingWrittenError)) throw e;
        }
      }
    },
    onMutate: ({ postId, on }) => {
      Haptics.selectionAsync();
      patchPost(qc, postId, (p) =>
        p[flag] === on ? p : { ...p, [flag]: on, [count]: Math.max(0, p[count] + (on ? 1 : -1)) },
      );
    },
    /*
      Hỏng thì NÓI RA (#27, B tìm ra): trước đây dấu đổi ngay rồi vài trăm mili-
      giây sau đổi ngược khi dữ liệu tải lại, không một chữ nào — người ta
      tưởng mình bấm hụt và bấm lại. Mọi thao tác ghi khác của cộng đồng đều
      `toast.fail`; riêng Thích và Lưu thì không.

      Trả DẤU về ngay (người ta vừa nhìn nó đổi), còn con SỐ thì đọc lại từ
      server thay vì đoán ngược: bộ đếm là của trigger phía server, và một phép
      trừ ở client có thể lệch khỏi nó.
    */
    onError: (e: Error, { postId, on }) => {
      patchPost(qc, postId, (p) => (p[flag] === on ? { ...p, [flag]: !on } : p));
      toast.fail(e);
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_post'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
    },
  });
}

export const useToggleLike = () => useToggle('community_likes', 'liked', 'like_count');
export const useToggleSave = () => useToggle('community_saves', 'saved', 'save_count');

export function useDeletePost() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (postId: string) => {
      await confirmWrite(
        supabase.from('community_posts').delete().eq('id', postId).eq('author_id', user!.id),
        'Không xoá được bài — có thể nó đã được xoá',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
      qc.invalidateQueries({ queryKey: ['community_shared_sessions', user?.id] });
    },
  });
}

/* ── bình luận ──────────────────────────────────────────────────────────── */

export function useComments(postId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_comments', user?.id, postId],
    enabled: !!user && !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_comments')
        .select('id, post_id, author_id, body, created_at')
        .eq('post_id', postId!)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      const ids = [...new Set(rows.map((r) => r.author_id))];
      const byId = new Map<string, CommunityAuthor>();
      if (ids.length) {
        const { data: a, error: aErr } = await supabase.from('community_profiles').select(PROFILE_COLS).in('user_id', ids);
        if (aErr) throw aErr;
        for (const x of a ?? []) byId.set(x.user_id, x as CommunityAuthor);
      }
      return rows.map<CommunityComment>((r) => ({
        id: r.id,
        post_id: r.post_id,
        body: r.body,
        created_at: r.created_at,
        author: byId.get(r.author_id) ?? null,
        mine: r.author_id === user!.id,
      }));
    },
  });
}

export function useAddComment(postId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    /* Rung lúc NGÓN TAY chạm Gửi, không phải lúc máy chủ trả lời — `selection`
       là phản hồi cho một cú chạm, và sau mạng nó trễ hàng trăm mili-giây. */
    onMutate: () => Haptics.selectionAsync(),
    mutationFn: async (body: string) => {
      const { error } = await supabase.from('community_comments').insert({ post_id: postId, author_id: user!.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_comments', user?.id, postId] });
      patchPost(qc, postId, (p) => ({ ...p, comment_count: p.comment_count + 1 }));
    },
  });
}

export function useDeleteComment(postId: string) {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (commentId: string) => {
      await confirmWrite(
        supabase.from('community_comments').delete().eq('id', commentId),
        'Không xoá được bình luận — có thể nó đã được xoá',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_comments', user?.id, postId] });
      patchPost(qc, postId, (p) => ({ ...p, comment_count: Math.max(0, p.comment_count - 1) }));
    },
  });
}

/* ── người khác: hồ sơ, theo dõi ────────────────────────────────────────── */

export function useCommunityUser(userId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_user', user?.id, userId],
    enabled: !!user && !!userId,
    queryFn: async () => {
      const [prof, followers, following, iFollow] = await Promise.all([
        supabase.from('community_profiles').select(PROFILE_COLS).eq('user_id', userId!).maybeSingle(),
        supabase.from('community_follows').select('follower_id', { count: 'exact', head: true }).eq('followee_id', userId!),
        supabase.from('community_follows').select('followee_id', { count: 'exact', head: true }).eq('follower_id', userId!),
        supabase.from('community_follows').select('followee_id').eq('follower_id', user!.id).eq('followee_id', userId!),
      ]);
      if (prof.error) throw prof.error;
      if (followers.error) throw followers.error;
      if (following.error) throw following.error;
      if (iFollow.error) throw iFollow.error;
      return {
        profile: (prof.data as CommunityAuthor | null) ?? null,
        followers: followers.count ?? 0,
        following: following.count ?? 0,
        iFollow: (iFollow.data ?? []).length > 0,
        isMe: userId === user!.id,
      };
    },
  });
}

export type PostKindFilter = PostKind | 'all';

/**
 * Bài của một người, lọc theo loại Ở SERVER (#44) — lọc một mảng đã tải thì bộ
 * lọc "Công thức" của một người đăng 30 buổi tập và 2 công thức sẽ trống, vì 30
 * dòng đầu toàn là buổi tập.
 */
export function useCommunityUserPosts(userId: string | undefined, kind: PostKindFilter = 'all') {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_user_posts', user?.id, userId, kind],
    enabled: !!user && !!userId,
    queryFn: async () => {
      let q = supabase.from('community_posts').select(POST_COLS).eq('author_id', userId!);
      if (kind !== 'all') q = q.eq('kind', kind);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(PAGE);
      if (error) throw error;
      return hydrate((data ?? []) as PostRow[], user!.id);
    },
  });
}

const KIND_ORDER: PostKind[] = ['workout', 'progress', 'recipe'];

/**
 * Những loại bài một người THẬT SỰ có — để hàng lọc không mời bấm vào một loại
 * rỗng. Khoá nằm dưới tiền tố `community_user_posts` nên thừa hưởng mọi lượt
 * làm mới sẵn có (xoá bài, xoá mọi bài, đăng bài, chặn) mà không thêm dòng nào;
 * `patchPost` duyệt qua nó vô hại — không phần tử nào có `id` khớp.
 */
export function useCommunityUserKinds(userId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_user_posts', user?.id, userId, 'kinds'],
    enabled: !!user && !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('community_posts').select('kind').eq('author_id', userId!).limit(500);
      if (error) throw error;
      const have = new Set((data ?? []).map((r) => r.kind));
      /* Mảng, không Set: cache được persist qua JSON. */
      return KIND_ORDER.filter((k) => have.has(k));
    },
  });
}

export function useFollow() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async ({ userId, on }: { userId: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from('community_follows').insert({ follower_id: user!.id, followee_id: userId });
        if (error && error.code !== '23505') throw error;
      } else {
        await confirmWrite(
          supabase.from('community_follows').delete().eq('follower_id', user!.id).eq('followee_id', userId),
          'Không bỏ theo dõi được — có thể đã bỏ ở thiết bị khác',
          'followee_id',
        );
      }
    },
    onMutate: () => Haptics.selectionAsync(),
    onSettled: (_d, _e, { userId }) => {
      qc.invalidateQueries({ queryKey: ['community_user', user?.id, userId] });
      qc.invalidateQueries({ queryKey: ['community_feed', user?.id, 'following'] });
      /* Tìm người & gợi ý (#19) mang cờ "đang theo dõi" của từng dòng. */
      qc.invalidateQueries({ queryKey: ['community_search'] });
      qc.invalidateQueries({ queryKey: ['community_suggestions'] });
    },
  });
}

/* ── an toàn ────────────────────────────────────────────────────────────── */

export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'misleading' | 'other';

export function useReport() {
  const { user } = useAuth();
  return useOnlineMutation({
    mutationFn: async (r: { postId?: string; commentId?: string; userId?: string; reason: ReportReason }) => {
      const { error } = await supabase.from('community_reports').insert({
        reporter_id: user!.id,
        post_id: r.postId ?? null,
        comment_id: r.commentId ?? null,
        reported_user_id: r.userId ?? null,
        reason: r.reason,
      });
      // Báo cáo lại cùng một bài: lần đầu đã được ghi, đó là kết quả người ta muốn.
      if (error && error.code !== '23505') throw error;
    },
  });
}

export function useBlock() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from('community_blocks').insert({ blocker_id: user!.id, blocked_id: userId });
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
    },
  });
}

/* ── chia sẻ và thử ─────────────────────────────────────────────────────── */

/** Id các buổi tập mình đã chia sẻ — để hàng buổi tập nói "Đã chia sẻ" thay
    vì mời chia sẻ lần hai (server sẽ từ chối, 23505).

    MẢNG chứ không phải `Set`: cache của app được persist xuống AsyncStorage
    qua `JSON.stringify`, thứ biến một `Set` thành `{}` — lần mở app sau,
    `.has()` trên nó là một cú ném (`tools/query-data.mjs`). */
export function useMySharedSessions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_shared_sessions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_posts')
        .select('source_id')
        .eq('author_id', user!.id)
        .not('source_id', 'is', null);
      if (error) throw error;
      return (data ?? []).map((r) => r.source_id as string);
    },
  });
}

export class AlreadySharedError extends Error {}
export class ProfileRequiredError extends Error {}

export function useShareWorkout() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (a: { sessionId: string; caption: string; visibility: 'public' | 'followers'; minutes: number | null }) => {
      const { data, error } = await supabase.rpc('share_workout', {
        p_session_id: a.sessionId,
        p_caption: a.caption,
        p_visibility: a.visibility,
        p_minutes: a.minutes ?? undefined,
      });
      if (error?.code === '23505') throw new AlreadySharedError(error.message);
      if (error?.code === 'P0001') throw new ProfileRequiredError(error.message);
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
      qc.invalidateQueries({ queryKey: ['community_shared_sessions', user?.id] });
    },
  });
}

/**
 * "Thử workout": CẤU TRÚC của bài, không phải mức tạ của người đăng.
 *
 * Tạ về 0 — con số của người khác không phải điểm xuất phát an toàn cho người
 * xem, và app đã có chỗ tự gợi ý tạ từ lịch sử của chính họ. Chỉ bài tập thuộc
 * THƯ VIỆN CHUNG được chép: bài tự tạo của người đăng thuộc về họ (RLS của
 * `exercises`), và một mẫu trỏ vào bài không đọc được là một mẫu hỏng. Số bài
 * bị bỏ được trả về để màn hình NÓI RA, thay vì lặng lẽ chép thiếu.
 */
export function workoutFromPost(p: WorkoutPayload, fallbackName: string) {
  const kept = p.exercises.filter((e) => e.library && e.exerciseId);
  const exercises: TemplateExercise[] = kept.map((e) => ({
    exerciseId: e.exerciseId!,
    exerciseName: e.exerciseName,
    sets: Math.max(1, e.sets),
    reps: Math.max(1, e.reps),
    weight: 0,
  }));
  return { name: p.title ?? fallbackName, exercises, skipped: p.exercises.length - kept.length };
}

/**
 * Bản xem trước của thẻ, dựng ở client từ CÙNG buổi tập mà server sẽ đọc.
 *
 * Nó bám đúng luật của `share_workout` (bỏ set khởi động, mỗi bài một dòng với
 * set nặng nhất rồi nhiều rep nhất, theo thứ tự xuất hiện) để thứ người ta
 * duyệt trước khi bấm Đăng là thứ người khác sẽ thấy. Bài được ĐĂNG vẫn là bản
 * server dựng — đây chỉ là tấm gương, không phải nguồn.
 */
export function payloadFromSession(
  s: { template_name: string | null; date_time: string; volume_load: number | null; pr_detected: boolean | null; sets: unknown },
  minutes: number | null,
): WorkoutPayload {
  type Raw = { exerciseId?: string; exerciseName?: string; weight?: number; reps?: number; warmup?: boolean };
  const sets = (Array.isArray(s.sets) ? s.sets : []) as Raw[];
  const order: string[] = [];
  const per = new Map<string, WorkoutExerciseLine>();
  for (const x of sets) {
    if (x.warmup) continue;
    const name = (x.exerciseName ?? '').trim() || '?';
    const k = x.exerciseId || `name:${name}`;
    const w = Number(x.weight) || 0;
    const r = Math.round(Number(x.reps) || 0);
    const cur = per.get(k);
    if (!cur) {
      order.push(k);
      per.set(k, { exerciseId: x.exerciseId ?? null, exerciseName: name, library: false, sets: 1, weight: w, reps: r });
    } else {
      cur.sets += 1;
      if (w > cur.weight || (w === cur.weight && r > cur.reps)) {
        cur.weight = w;
        cur.reps = r;
      }
    }
  }
  const exercises = order.map((k) => per.get(k)!);
  return {
    title: s.template_name?.trim() || null,
    performedAt: s.date_time,
    volumeKg: Math.round((Number(s.volume_load) || 0) * 10) / 10,
    pr: !!s.pr_detected,
    minutes: minutes && minutes >= 1 && minutes <= 600 ? minutes : null,
    exerciseCount: exercises.length,
    exercises,
  };
}

/* ── bài Progress (#8) ─────────────────────────────────────────────────── */

export interface ProgressMetric {
  start: number;
  end: number;
  /** Một điểm mỗi tuần (điểm cuối tuần), cũ trước — cho đường xu hướng. */
  series: number[];
}

export interface ProgressPayload {
  weeks: number;
  weight: ProgressMetric | null;
  waist: ProgressMetric | null;
  lift: (ProgressMetric & { name: string }) | null;
}

function readMetric(v: unknown): ProgressMetric | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const series = Array.isArray(o.series) ? o.series.map((x) => num(x)) : [];
  if (!Number.isFinite(Number(o.start)) || !Number.isFinite(Number(o.end))) return null;
  return { start: num(o.start), end: num(o.end), series };
}

/** Đọc phòng thủ, như `readWorkoutPayload`: khoá nào thiếu thì ô ấy không vẽ. */
export function readProgressPayload(raw: unknown): ProgressPayload {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lift = readMetric(p.lift);
  const liftName = p.lift && typeof (p.lift as Record<string, unknown>).name === 'string' ? ((p.lift as Record<string, unknown>).name as string) : '';
  return {
    weeks: num(p.weeks, 12),
    weight: readMetric(p.weight),
    waist: readMetric(p.waist),
    lift: lift && liftName ? { ...lift, name: liftName } : null,
  };
}

type ProgressOpts = { weeks: number; weight: boolean; waist: boolean; liftId: string | null };

/**
 * Bản xem trước — gọi ĐÚNG hàm server mà `share_progress` sẽ gọi, nên thẻ xem
 * trước và bài đăng không thể nói hai điều khác nhau. Trả về payload thô (JSON,
 * persist được), để thẻ đọc bằng `readProgressPayload` như mọi bài trên feed.
 */
export function useProgressPreview(o: ProgressOpts) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_progress_preview', user?.id, o.weeks, o.weight, o.waist, o.liftId],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('build_progress_payload', {
        p_weeks: o.weeks,
        p_weight: o.weight,
        p_waist: o.waist,
        p_lift_exercise_id: o.liftId ?? undefined,
      });
      if (error) throw error;
      return data as unknown;
    },
  });
}

export function useShareProgress() {
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (o: ProgressOpts & { caption: string; visibility: 'public' | 'followers' }) => {
      const { data, error } = await supabase.rpc('share_progress', {
        p_weeks: o.weeks,
        p_weight: o.weight,
        p_waist: o.waist,
        p_lift_exercise_id: o.liftId ?? undefined,
        p_caption: o.caption,
        p_visibility: o.visibility,
      });
      if (error?.code === 'P0001') throw new ProfileRequiredError(error.message);
      if (error) throw error;
      return data as string;
    },
    onMutate: () => Haptics.selectionAsync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
    },
  });
}

/* ── Thử thách cộng đồng (#9) ──────────────────────────────────────────── */

export interface CommunityChallenge {
  id: string;
  title: string;
  description: string;
  target: number;
  starts_on: string;
  ends_on: string;
  reward_coins: number;
  participants: number;
  joined: boolean;
  progress: number;
  claimed: boolean;
}

/**
 * Độ lệch UTC HIỆN TẠI của máy, theo phút — server đếm "ngày có tập" theo giờ
 * địa phương của người dùng, vì hồ sơ không lưu múi giờ. Đọc lại mỗi lần gọi
 * chứ không hằng số: người ta bay qua múi giờ, và giờ mùa hè đổi nó hai lần
 * mỗi năm. Xem đầu `20260930120000_community_challenges.sql`.
 */
const utcOffsetMin = () => -new Date().getTimezoneOffset();

export function useChallenges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_challenges', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_challenges_overview', { p_offset_min: utcOffsetMin() });
      if (error) throw error;
      /* Mảng thường, không Set/Map — cache được persist qua JSON. */
      return (Array.isArray(data) ? data : []) as CommunityChallenge[];
    },
  });
}

export interface ChallengeHistoryItem {
  id: string;
  title: string;
  description: string;
  target: number;
  starts_on: string;
  ends_on: string;
  /** Số xu ĐÃ VÀO SỔ khi nhận — không phải `reward_coins` hiện tại. */
  coins: number;
  claimed_at: string;
}

/**
 * Thử thách mình ĐÃ hoàn thành (đã nhận thưởng), mới nhất trước — #41. Tổng
 * quan bỏ thử thách hết hạn quá 7 ngày; đây là chỗ chúng ở lại.
 *
 * Khoá nằm dưới `['community_challenges', me]`, nên lượt làm mới sau khi nhận
 * thưởng (`useClaimChallenge`) làm mới cả nó mà không thêm dòng nào.
 */
export function useChallengeHistory(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_challenges', user?.id, 'history'],
    enabled: !!user && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_challenge_history');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as ChallengeHistoryItem[];
    },
  });
}

export function useJoinChallenge() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async ({ id, on }: { id: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from('community_challenge_members').insert({ challenge_id: id, user_id: user!.id });
        if (error && error.code !== '23505') throw error;
      } else {
        await confirmWrite(
          supabase.from('community_challenge_members').delete().eq('challenge_id', id).eq('user_id', user!.id),
          'Không rời được thử thách — có thể bạn đã nhận thưởng',
          'challenge_id',
        );
      }
    },
    onMutate: () => Haptics.selectionAsync(),
    onSettled: () => qc.invalidateQueries({ queryKey: ['community_challenges', user?.id] }),
  });
}

export function useClaimChallenge() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('claim_community_challenge', { p_challenge: id, p_offset_min: utcOffsetMin() });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onMutate: () => Haptics.selectionAsync(),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_challenges', user?.id] });
      /* Xu vừa vào sổ: số dư trong phòng linh vật phải đọc lại. */
      qc.invalidateQueries({ queryKey: ['mascot_wallet'] });
    },
  });
}

/* ── quyền riêng tư (#11) ───────────────────────────────────────────────── */

export type Visibility = 'public' | 'followers';

/**
 * Cài đặt riêng của người dùng — hiện chỉ có "mặc định khi đăng". Bảng riêng
 * chỉ chủ nhân đọc được (`20260930130000_community_privacy.sql`), không nằm
 * trên hồ sơ công khai.
 *
 * Chưa có dòng thì là `public`, đúng như DEFAULT của cột: người chưa từng mở
 * màn này không cần một lần ghi để có giá trị.
 */
export function useCommunitySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_settings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('community_settings')
        .select('default_visibility, show_badges')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return {
        defaultVisibility: (data?.default_visibility === 'followers' ? 'followers' : 'public') as Visibility,
        /* Chưa có dòng cài đặt = TẮT, đúng như DEFAULT của cột (#42). */
        showBadges: data?.show_badges === true,
      };
    },
  });
}

export function useSetDefaultVisibility() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (v: Visibility) => {
      const { error } = await supabase
        .from('community_settings')
        .upsert({ user_id: user!.id, default_visibility: v, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: () => Haptics.selectionAsync(),
    onSettled: () => qc.invalidateQueries({ queryKey: ['community_settings', user?.id] }),
  });
}

/**
 * Bật/tắt hàng huy hiệu thử thách trên hồ sơ của MÌNH (#42). Tắt sẵn: huy
 * hiệu nói người ta đã tập trong những khoảng nào, và bảng thành viên thử
 * thách cố ý không cho ai khác đọc — bật là quyết định của người ấy.
 */
export function useSetShowBadges() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (on: boolean) => {
      const { error } = await supabase
        .from('community_settings')
        .upsert({ user_id: user!.id, show_badges: on, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onMutate: () => Haptics.selectionAsync(),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['community_settings', user?.id] });
      qc.invalidateQueries({ queryKey: ['community_badges', user?.id] });
    },
  });
}

/** Không mang ngày nhận (#88): hàng huy hiệu không in ngày, và mốc giờ nhận
    thưởng của người khác là thói quen sinh hoạt — server giữ nó để xếp thứ tự. */
export interface CommunityBadge {
  challenge_id: string;
  title: string;
}

/**
 * Huy hiệu thử thách của một người (#42) — thử thách đã NHẬN THƯỞNG, tức hoàn
 * thành đã được server xác minh. Server trả rỗng khi người ấy chưa bật hay hai
 * người chặn nhau, nên màn không cần biết vì sao: rỗng thì không vẽ hàng nào.
 */
export function useUserBadges(userId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_badges', user?.id, userId],
    enabled: !!user && !!userId,
    queryFn: async (): Promise<CommunityBadge[]> => {
      const { data, error } = await supabase.rpc('community_user_badges', { p_user: userId! });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as CommunityBadge[];
    },
  });
}

export interface BlockedUser {
  user_id: string;
  since: string;
  /** Null khi người ấy đã xoá hồ sơ cộng đồng — dòng chặn vẫn còn (nó trỏ
      thẳng vào tài khoản), và vẫn phải bỏ chặn được. */
  profile: CommunityAuthor | null;
}

/** Người MÌNH đã chặn. RLS không cho thấy ai đã chặn mình. */
export function useBlockedUsers() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_blocks', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<BlockedUser[]> => {
      const { data: rows, error } = await supabase
        .from('community_blocks')
        .select('blocked_id, created_at')
        .eq('blocker_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.blocked_id);
      if (ids.length === 0) return [];
      const { data: profs, error: pe } = await supabase.from('community_profiles').select(PROFILE_COLS).in('user_id', ids);
      if (pe) throw pe;
      const byId = new Map((profs as CommunityAuthor[] | null ?? []).map((p) => [p.user_id, p]));
      return (rows ?? []).map((r) => ({ user_id: r.blocked_id, since: r.created_at, profile: byId.get(r.blocked_id) ?? null }));
    },
  });
}

export function useUnblock() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async (userId: string) => {
      /* `confirmWrite` hỏi lại cột `id`, thứ bảng chặn không có (khoá là cặp
         hai người) — nên hỏi lại chính `blocked_id`. */
      const { data, error } = await supabase
        .from('community_blocks')
        .delete()
        .eq('blocker_id', user!.id)
        .eq('blocked_id', userId)
        .select('blocked_id');
      if (error) throw error;
      if (!data || data.length === 0) throw new NothingWrittenError('Không bỏ chặn được — có thể bạn đã bỏ chặn ở thiết bị khác');
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_blocks', user?.id] });
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
    },
  });
}

/** Xoá MỌI bài của mình; hồ sơ, người theo dõi và bình luận ở bài người khác
    giữ nguyên. Trả về số bài đã xoá (0 là một câu trả lời đúng, không phải lỗi). */
export function useDeleteAllMyPosts() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('community_posts').delete().eq('author_id', user!.id).select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ['community_feed'] });
      qc.invalidateQueries({ queryKey: ['community_user_posts'] });
      qc.invalidateQueries({ queryKey: ['community_shared_sessions', user?.id] });
    },
  });
}

/* ── hộp thông báo (#13) ────────────────────────────────────────────────── */

export type NotificationKind = 'like' | 'comment' | 'follow';

/**
 * Một dòng trong hộp thư. Lượt THÍCH cùng một bài gộp làm một dòng ("Linh và
 * 3 người khác đã thích bài của bạn"); bình luận và theo dõi mỗi cái một dòng,
 * vì mỗi cái là một người, một việc.
 */
export interface InboxItem {
  key: string;
  kind: NotificationKind;
  /** Người mới nhất đứng đầu. Chỉ những người còn hồ sơ. */
  actors: CommunityAuthor[];
  /** Tổng số người, kể cả người không còn hồ sơ — "và N người khác" đếm đủ. */
  count: number;
  postId: string | null;
  at: string;
  unread: boolean;
}

const INBOX_LIMIT = 100;

export function useInbox() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_inbox', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<InboxItem[]> => {
      const { data: rows, error } = await supabase
        .from('community_notifications')
        .select('id, actor_id, kind, post_id, created_at, read_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(INBOX_LIMIT);
      if (error) throw error;
      const list = rows ?? [];
      if (list.length === 0) return [];
      const ids = [...new Set(list.map((r) => r.actor_id))];
      const { data: profs, error: pe } = await supabase.from('community_profiles').select(PROFILE_COLS).in('user_id', ids);
      if (pe) throw pe;
      const byId = new Map(((profs as CommunityAuthor[] | null) ?? []).map((p) => [p.user_id, p]));

      /* Hàng đã theo thứ tự mới → cũ, nên dòng gộp đầu tiên của một bài mang
         thời điểm của lượt thích MỚI NHẤT, và người đứng đầu là người ấy. */
      const out: InboxItem[] = [];
      const likeGroups = new Map<string, InboxItem>();
      for (const r of list) {
        const kind = (['like', 'comment', 'follow'] as const).find((k) => k === r.kind);
        if (!kind) continue;
        const actor = byId.get(r.actor_id);
        if (kind === 'like' && r.post_id) {
          const g = likeGroups.get(r.post_id);
          if (g) {
            g.count += 1;
            if (actor) g.actors.push(actor);
            g.unread ||= r.read_at === null;
            continue;
          }
          const item: InboxItem = { key: `like:${r.post_id}`, kind, actors: actor ? [actor] : [], count: 1, postId: r.post_id, at: r.created_at, unread: r.read_at === null };
          likeGroups.set(r.post_id, item);
          out.push(item);
          continue;
        }
        out.push({ key: r.id, kind, actors: actor ? [actor] : [], count: 1, postId: r.post_id, at: r.created_at, unread: r.read_at === null });
      }
      /* Một dòng mà không còn ai có hồ sơ thì không có tên nào để nói — bỏ. */
      return out.filter((x) => x.actors.length > 0);
    },
  });
}

export function useMarkInboxRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useOnlineMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('community_mark_notifications_read');
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['community_inbox', user?.id] }),
    /* Im lặng CÓ CHỦ Ý: không ai bấm gì cả — màn tự đánh dấu khi mở. Hỏng
       (mất mạng, #45) thì các dòng vẫn chưa đọc trên server, và lần mở sau có
       mạng sẽ đánh dấu lại. Một toast ở đây là báo lỗi cho việc người ta
       không làm. */
    onError: () => {},
  });
}

/* ── tìm người & gợi ý theo dõi (#19) ───────────────────────────────────── */

export interface PersonHit extends CommunityAuthor {
  i_follow: boolean;
}

export interface PersonSuggestion extends CommunityAuthor {
  recent_posts: number;
}

/** Chuỗi tìm đã chuẩn hoá: bỏ khoảng trắng hai đầu và `@` ở đầu, như server. */
export const searchTerm = (q: string) => q.trim().replace(/^@+/, '');

/**
 * Tìm theo tiền tố `@handle` hoặc tiền tố một từ trong tên. Server lọc cặp đã
 * chặn nhau (hai chiều) và trả tối đa 20 dòng; dưới 2 ký tự thì không hỏi.
 * Xem `20260930160000_community_search.sql`.
 */
export function useSearchPeople(q: string) {
  const { user } = useAuth();
  const term = searchTerm(q).toLowerCase();
  return useQuery({
    queryKey: ['community_search', user?.id, term],
    enabled: !!user && term.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_search_profiles', { p_q: term });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as PersonHit[];
    },
  });
}

/**
 * Tìm bài Recipe theo tên món, không phân biệt dấu (#43). Hàm server chỉ trả
 * ID (tối đa 30, mới nhất trước) — xem `20261001150000_community_find_recipes.sql`
 * — và bài được đọc bằng `.in('id', …)` như Thư viện Đã lưu, tức đi qua RLS thêm
 * một lần. Khoá nằm dưới `community_user_posts` để `patchPost` đổi tim và dấu
 * lưu ngay trên kết quả tìm.
 */
export function useFindRecipes(q: string) {
  const { user } = useAuth();
  const term = q.trim().toLowerCase();
  return useQuery({
    queryKey: ['community_user_posts', user?.id, 'recipe_search', term],
    enabled: !!user && term.length >= 2,
    queryFn: async (): Promise<FeedPost[]> => {
      const me = user!.id;
      const { data: hits, error } = await supabase.rpc('community_find_recipes', { p_q: term });
      if (error) throw error;
      const ids = (Array.isArray(hits) ? hits : []).map((h) => h.post_id).filter((x): x is string => typeof x === 'string');
      if (ids.length === 0) return [];
      const { data: rows, error: postsErr } = await supabase.from('community_posts').select(POST_COLS).in('id', ids);
      if (postsErr) throw postsErr;
      /* `.in()` không giữ thứ tự: xếp lại theo thứ tự server trả (mới nhất trước). */
      const byId = new Map(((rows ?? []) as PostRow[]).map((r) => [r.id, r]));
      return hydrate(ids.map((id) => byId.get(id)).filter((r): r is PostRow => !!r), me);
    },
  });
}

/** Chính thức trước, rồi người có bài công khai trong 14 ngày mà mình chưa theo dõi. */
export function useFollowSuggestions() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_suggestions', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('community_follow_suggestions');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as PersonSuggestion[];
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { callEdge, EDGE_FUNCTIONS } from '@/lib/edge';

/**
 * Bảng điều khiển vận hành Cộng đồng (A, 03/10) — dữ liệu.
 *
 * ── quyền KHÔNG nằm ở đây ──
 *
 * Mọi hàm dưới đây gọi một RPC `mod_*` / `admin_*` tự hỏi vai trò của người gọi
 * ở database (20261007130000). `useAppRole` chỉ để màn biết nên VẼ gì; người
 * dùng thường gọi thẳng các RPC này thì nhận 403, dù client có nói gì. Xem
 * docs/ADMIN.md.
 *
 * ── không persist ──
 *
 * Mọi khoá bắt đầu bằng `admin` và được loại khỏi cache lưu xuống máy
 * (`query-client.ts`): hàng đợi báo cáo, email người dùng và nhật ký kiểm toán
 * không được nằm lại trên ổ đĩa của một trình duyệt sau khi đăng xuất.
 */

export type AppRole = 'user' | 'moderator' | 'admin';
export type TargetType = 'post' | 'comment';
export type ReportStatus = 'open' | 'actioned' | 'dismissed';
export type AppealStatus = 'open' | 'restored' | 'upheld';

export interface AdminPerson {
  user_id: string;
  handle: string;
  display_name?: string;
}

export interface AuditRow {
  id: number;
  action: string;
  target_type: string;
  target_id: string;
  reason: string;
  actor_role: 'system' | 'moderator' | 'admin';
  created_at: string;
  actor: AdminPerson | null;
  metadata?: Record<string, unknown>;
}

export interface Dashboard {
  pending_reports: number;
  pending_appeals: number;
  hidden_posts: number;
  hidden_comments: number;
  removed_posts: number;
  reports_today: number;
  recent: AuditRow[];
}

export interface QueueItem {
  target_type: TargetType;
  target_id: string;
  report_count: number;
  reasons: Record<string, number>;
  last_at: string;
  target: {
    kind?: string;
    caption?: string;
    body?: string;
    post_id?: string;
    hidden: boolean;
    removed: boolean;
    author_id: string;
    created_at: string;
  } | null;
  author: AdminPerson | null;
  appeal: { id: string; status: AppealStatus; created_at: string } | null;
}

export interface TargetDetail {
  type: TargetType;
  target: {
    id: string;
    kind?: string;
    caption?: string;
    body?: string;
    post_id?: string;
    visibility?: string;
    hidden: boolean;
    removed_at: string | null;
    like_count?: number;
    comment_count?: number;
    created_at: string;
  };
  author: (AdminPerson & { role: AppRole }) | null;
  reports: {
    id: string;
    reason: string;
    note: string | null;
    status: ReportStatus;
    created_at: string;
    reporter: { user_id: string; handle: string } | null;
  }[];
  appeals: {
    id: string;
    status: AppealStatus;
    message: string;
    created_at: string;
    decided_at: string | null;
  }[];
  history: AuditRow[];
}

export interface AppealItem {
  id: string;
  status: AppealStatus;
  message: string;
  created_at: string;
  decided_at: string | null;
  target_type: TargetType;
  target_id: string;
  excerpt: string | null;
  reports: number;
  author: AdminPerson | null;
}

export interface AdminUserRow {
  user_id: string;
  email: string | null;
  handle: string | null;
  display_name: string | null;
  role: AppRole;
  posts: number;
  hidden_posts: number;
  removed_posts: number;
  open_reports_against: number;
  reports_filed: number;
}

export interface AdminUserDetail {
  user_id: string;
  email: string | null;
  role: AppRole;
  profile: { handle: string; display_name: string; bio: string } | null;
  posts: {
    id: string;
    kind: string;
    caption: string;
    hidden: boolean;
    removed: boolean;
    created_at: string;
    reports: number;
  }[];
  reports_against: {
    id: string;
    reason: string;
    status: ReportStatus;
    created_at: string;
    target_type: TargetType;
    target_id: string;
  }[];
  reports_filed: number;
  history: AuditRow[];
}

export interface ArtRow {
  id: string;
  kind: 'workout' | 'progress' | 'recipe';
  style: string;
  tags: string[];
  path: string;
  alt_en: string;
  alt_vi: string;
  active: boolean;
  sort: number;
  created_at: string;
  used_by: number;
}

/** Vai trò của chính người đang đăng nhập — để vẽ, không để cho phép. */
export function useAppRole() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['admin_role', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AppRole> => {
      const { data, error } = await supabase.rpc('my_app_role');
      if (error) throw error;
      return data === 'admin' || data === 'moderator' ? data : 'user';
    },
  });
}

/** Một truy vấn chỉ chạy khi người gọi CÓ vai trò: người dùng thường mở thẳng
 *  /admin thì không một lời gọi dữ liệu quản trị nào rời trình duyệt. */
function useStaff(adminOnly = false) {
  const role = useAppRole();
  const ok = role.data === 'admin' || (!adminOnly && role.data === 'moderator');
  return { userId: useAuth().user?.id, ok };
}

export function useModDashboard() {
  const { userId, ok } = useStaff();
  return useQuery({
    queryKey: ['admin_dashboard', userId],
    enabled: ok,
    queryFn: async (): Promise<Dashboard> => {
      const { data, error } = await supabase.rpc('mod_dashboard');
      if (error) throw error;
      return data as unknown as Dashboard;
    },
  });
}

export function useModReports(status: ReportStatus) {
  const { userId, ok } = useStaff();
  return useQuery({
    queryKey: ['admin_reports', userId, status],
    enabled: ok,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase.rpc('mod_reports', { p_status: status, p_limit: 100 });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as QueueItem[];
    },
  });
}

export function useModAppeals(status: AppealStatus) {
  const { userId, ok } = useStaff();
  return useQuery({
    queryKey: ['admin_appeals', userId, status],
    enabled: ok,
    queryFn: async (): Promise<AppealItem[]> => {
      const { data, error } = await supabase.rpc('mod_appeals', { p_status: status, p_limit: 100 });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as AppealItem[];
    },
  });
}

export function useModTarget(type: TargetType | undefined, id: string | undefined) {
  const { userId, ok } = useStaff();
  return useQuery({
    queryKey: ['admin_target', userId, type, id],
    enabled: ok && !!type && !!id,
    queryFn: async (): Promise<TargetDetail> => {
      const { data, error } = await supabase.rpc('mod_target', { p_type: type!, p_id: id! });
      if (error) throw error;
      return data as unknown as TargetDetail;
    },
  });
}

export function useAdminAudit(action: string | null) {
  const { userId, ok } = useStaff(true);
  return useQuery({
    queryKey: ['admin_audit', userId, action],
    enabled: ok,
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase.rpc('admin_audit', {
        p_limit: 200,
        ...(action ? { p_action: action } : {}),
      });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as AuditRow[];
    },
  });
}

export function useAdminUsers(query: string) {
  const { userId, ok } = useStaff(true);
  return useQuery({
    queryKey: ['admin_users', userId, query],
    enabled: ok,
    queryFn: async (): Promise<AdminUserRow[]> => {
      const { data, error } = await supabase.rpc('admin_users', { p_query: query, p_limit: 100 });
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as AdminUserRow[];
    },
  });
}

export function useAdminUser(id: string | undefined) {
  const { userId, ok } = useStaff(true);
  return useQuery({
    queryKey: ['admin_user', userId, id],
    enabled: ok && !!id,
    queryFn: async (): Promise<AdminUserDetail> => {
      const { data, error } = await supabase.rpc('admin_user', { p_user: id! });
      if (error) throw error;
      return data as unknown as AdminUserDetail;
    },
  });
}

export function useAdminArt() {
  const { userId, ok } = useStaff(true);
  return useQuery({
    queryKey: ['admin_art', userId],
    enabled: ok,
    queryFn: async (): Promise<ArtRow[]> => {
      const { data, error } = await supabase.rpc('admin_art');
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as unknown as ArtRow[];
    },
  });
}

/** Sau mọi quyết định: mọi danh sách của bảng điều khiển đọc lại từ server.
 *  Không vá tay — một quyết định đổi hàng đợi, kháng nghị, bảng số và nhật ký
 *  cùng lúc, và server là nơi duy nhất biết đủ cả bốn. */
function useRefreshAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('admin_') });
}

export type ModAction = 'hide' | 'restore' | 'remove' | 'dismiss';

export function useModAction() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({ action, type, id, reason }: { action: ModAction; type: TargetType; id: string; reason: string }) => {
      const args = { p_type: type, p_id: id, p_reason: reason };
      const { error } =
        action === 'hide'
          ? await supabase.rpc('mod_hide', args)
          : action === 'restore'
            ? await supabase.rpc('mod_restore', args)
            : action === 'remove'
              ? await supabase.rpc('mod_remove', args)
              : await supabase.rpc('mod_dismiss', args);
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useDecideAppeal() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({ id, approve, reason }: { id: string; approve: boolean; reason: string }) => {
      const { error } = await supabase.rpc('mod_decide_appeal', { p_appeal: id, p_approve: approve, p_reason: reason });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useSetRole() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({ userId, role, reason }: { userId: string; role: AppRole; reason: string }) => {
      const { error } = await supabase.rpc('admin_set_role', { p_user: userId, p_role: role, p_reason: reason });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export function useSetArtActive() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async ({ id, active, reason }: { id: string; active: boolean; reason: string }) => {
      const { error } = await supabase.rpc('admin_set_art_active', { p_art: id, p_active: active, p_reason: reason });
      if (error) throw error;
    },
    onSettled: refresh,
  });
}

export interface ArtUpload {
  file: Blob;
  name: string;
  kind: ArtRow['kind'];
  style: string;
  tags: string;
  altEn: string;
  altVi: string;
}

/** Tải ảnh lên qua Edge Function `admin-art`: function kiểm vai trò TRƯỚC khi
 *  chạm Storage, rồi ghi hàng bằng chính token này. */
export function useUploadArt() {
  const refresh = useRefreshAll();
  return useMutation({
    mutationFn: async (u: ArtUpload) => {
      const form = new FormData();
      form.append('file', u.file, u.name);
      form.append('kind', u.kind);
      form.append('style', u.style);
      form.append('tags', u.tags);
      form.append('alt_en', u.altEn);
      form.append('alt_vi', u.altVi);
      const res = await callEdge<{ id: string; path: string }>(EDGE_FUNCTIONS.adminArt, form);
      if (!res.ok) {
        const code = (res.body as { error?: string } | undefined)?.error;
        throw new Error(code ?? res.raw);
      }
      return res.data;
    },
    onSettled: refresh,
  });
}

import type { FeedPost } from '@/hooks/use-community';

import { WorkoutPostCard } from '@/components/ascnd/workout-post-card';

/**
 * Bộ chia thẻ theo loại bài — CHỖ CẮM của giai đoạn 2.
 *
 * Hai người làm song song (issue #6): A làm `progress-post-card.tsx` (#8),
 * B làm `recipe-post-card.tsx` (#7). Mỗi người thêm đúng MỘT nhánh vào đây và
 * không sửa thẻ của người kia.
 *
 * Loại chưa có thẻ thì KHÔNG vẽ gì, thay vì vẽ nó bằng thẻ Workout: một bài
 * Recipe đọc qua `readWorkoutPayload` sẽ ra một buổi tập rỗng không tên — tức
 * một thẻ hỏng trên feed của người khác. Ẩn đi là đúng cho tới khi thẻ của nó
 * có mặt.
 */
export function PostCard({ post, full, preview }: { post: FeedPost; full?: boolean; preview?: boolean }) {
  switch (post.kind) {
    case 'workout':
      return <WorkoutPostCard post={post} full={full} preview={preview} />;
    default:
      return null;
  }
}

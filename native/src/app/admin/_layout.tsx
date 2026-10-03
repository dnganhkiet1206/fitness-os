import { Stack } from 'expo-router';

/** Bảng kiểm duyệt (web): một stack riêng, không đầu trang của navigator —
 *  mỗi màn tự dựng đầu trang qua `AdminShell` / `Screen` như phần còn lại của app. */
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}

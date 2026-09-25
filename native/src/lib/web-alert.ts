import { Alert, Platform } from 'react-native';

import { browserAlert } from '@/lib/web-dialog';

/**
 * Trên bản web, `Alert.alert` thành hộp thoại của trình duyệt (#83) — xem
 * `web-dialog.ts` vì sao và theo luật nào. iOS và Android không đổi gì: hàm
 * này về ngay khi không phải web.
 *
 * Gán thẳng vào `Alert.alert`, không bọc 57 chỗ gọi: mọi tệp đều
 * `import { Alert } from 'react-native'`, và trên web đó là CÙNG một class
 * của react-native-web, nên một lần gán ở gốc là đủ cho cả app — kể cả chỗ
 * gọi viết sau này.
 */
let installed = false;

export function installWebAlert(): void {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return;
  installed = true;
  Alert.alert = (title, message, buttons) => browserAlert(window, title, message, buttons);
}

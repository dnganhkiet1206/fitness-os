import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Live online/offline state from React Query's onlineManager (fed by NetInfo). */
export function useOnlineStatus() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  useEffect(() => onlineManager.subscribe(setOnline), []);
  return online;
}

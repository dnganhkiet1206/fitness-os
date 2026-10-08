// Native module RNCNetInfo giả cho golden: gen.mjs đặt `current` (thứ
// getCurrentState trả về) và gọi `emit` (một sự kiện đường mạng đổi), đúng
// hai cửa mà `state.ts` của NetInfo đọc.
type Handler = (state: unknown) => void;
const handlers = new Set<Handler>();
export const fakeNative = {
  current: { type: 'none', isConnected: false, details: null } as unknown,
  emit(state: unknown) {
    fakeNative.current = state;
    for (const h of [...handlers]) h(state);
  },
  reset() {
    handlers.clear();
  },
};
export default {
  configure: () => {},
  addListener: () => {},
  removeListeners: () => {},
  getCurrentState: async () => fakeNative.current,
  eventEmitter: {
    addListener: (_event: string, h: Handler) => {
      handlers.add(h);
      return { remove: () => handlers.delete(h) };
    },
  },
};

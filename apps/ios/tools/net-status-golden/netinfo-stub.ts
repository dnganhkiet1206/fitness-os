// NetInfo là native module, không nạp được trong node. Các hàm golden chạy
// (`isUsable`, `applyNetInfo`) nhận trạng thái qua tham số — không gọi tới đây.
const noop = () => () => {};
export default { addEventListener: noop, refresh: async () => ({}), configure: () => {} };
export type NetInfoState = { isConnected: boolean | null; isInternetReachable: boolean | null };

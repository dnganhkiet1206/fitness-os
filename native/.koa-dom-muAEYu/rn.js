export const View = 'div';
     export const Text = 'span';
     export const Platform = { OS: 'ios', select: (o) => o.ios ?? o.default };
     export const StyleSheet = { create: (s) => s, flatten: (s) => Object.assign({}, ...[s].flat(9)) };
     export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
     export const AccessibilityInfo = {
       isReduceMotionEnabled: () => Promise.resolve(false),
       addEventListener: () => ({ remove() {} }),
     };
     export const Pressable = 'div';
     export default {};
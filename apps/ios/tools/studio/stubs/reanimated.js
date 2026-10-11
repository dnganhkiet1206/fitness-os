const React = require('react');
const id = (x) => x;
const Animated = { View: ({ children }) => React.createElement(React.Fragment, null, children),
  createAnimatedComponent: (C) => function A({ animatedProps, ...p }) { return React.createElement(C, { ...p, ...(animatedProps || {}) }); } };
module.exports = {
  __esModule: true, default: Animated, Easing: new Proxy({}, { get: () => () => id }),
  useAnimatedProps: (f) => f(), useAnimatedStyle: (f) => f(), useDerivedValue: (f) => ({ value: f() }),
  useSharedValue: (v) => ({ value: v }), withTiming: id, withSpring: id, withRepeat: id, withSequence: (...a) => a[a.length - 1],
  withDelay: (d, v) => v, cancelAnimation: () => {}, useFrameCallback: () => ({ setActive() {} }), makeMutable: (v) => ({ value: v }),
  runOnJS: (f) => f, interpolate: (x) => x, Extrapolation: {},
};

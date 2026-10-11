const React = require('react');
const passthrough = ({ children }) => React.createElement(React.Fragment, null, children);
module.exports = {
  View: passthrough, Text: passthrough, Pressable: passthrough, Image: passthrough,
  StyleSheet: { create: (s) => s, absoluteFill: {}, hairlineWidth: 1 },
  Platform: { OS: 'ios', select: (o) => o.ios ?? o.default },
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  AccessibilityInfo: {}, useWindowDimensions: () => ({ width: 390, height: 844 }),
};

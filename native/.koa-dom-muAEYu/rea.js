import { createElement } from 'react';
     export const makeMutable = (v) => ({ value: v });
     export const useSharedValue = (v) => ({ value: v });
     export const useDerivedValue = (f) => ({ value: f() });
     export const useAnimatedProps = (f) => f();
     export const useAnimatedStyle = (f) => f();
     export const useAnimatedReaction = () => {};
     export const useFrameCallback = () => ({ setActive() {}, isActive: false });
     export const useReducedMotion = () => false;
     export const cancelAnimation = () => {};
     export const runOnJS = (f) => f;
     export const runOnUI = (f) => f;
     const pass = (v) => v;
     export const withTiming = pass;
     export const withSpring = pass;
     export const withDelay = (_, v) => v;
     export const withSequence = (...v) => v[0];
     export const withRepeat = pass;
     export const interpolate = (x) => x;
     export const interpolateColor = (_, __, out) => out[0];
     export const Extrapolation = { CLAMP: 'clamp' };
     export const Easing = new Proxy({}, { get: () => (t) => t });
     /* An animated SVG group takes its matrix as a prop; the DOM takes it as a
        transform. That mapping is this module's only opinion about the drawing. */
     const asDom = ({ animatedProps, ...rest }) => {
       const p = { ...rest, ...(animatedProps || {}) };
       if (Array.isArray(p.matrix)) { p.transform = 'matrix(' + p.matrix.join(' ') + ')'; delete p.matrix; }
       if (typeof p.opacity === 'object' && p.opacity) p.opacity = p.opacity.value;
       return p;
     };
     export const createAnimatedComponent = (C) => (props) => createElement(C, asDom(props));
     const View = (props) => createElement('div', asDom(props));
     export default { createAnimatedComponent, View, Text: View };
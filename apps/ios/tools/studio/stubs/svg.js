const React = require('react');
const tags = { Svg: 'svg', G: 'g', Path: 'path', Rect: 'rect', Circle: 'circle', Ellipse: 'ellipse', Line: 'line',
  Polygon: 'polygon', Polyline: 'polyline', Defs: 'defs', ClipPath: 'clipPath', LinearGradient: 'linearGradient',
  RadialGradient: 'radialGradient', Stop: 'stop', Text: 'text', TSpan: 'tspan', Mask: 'mask', Use: 'use', Pattern: 'pattern' };
for (const [k, tag] of Object.entries(tags)) {
  exports[k] = function SvgEl({ children, x, y, rotation, originX, originY, scale, style, ...p }) {
    if (tag === 'g') {
      const t = [];
      if (x || y) t.push(`translate(${x || 0} ${y || 0})`);
      if (rotation) t.push(`rotate(${rotation} ${originX || 0} ${originY || 0})`);
      if (scale) t.push(`scale(${scale})`);
      if (t.length) p.transform = (p.transform ? p.transform + ' ' : '') + t.join(' ');
    } else {
      if (x !== undefined) p.x = x;
      if (y !== undefined) p.y = y;
    }
    if (tag === 'svg') p.xmlns = 'http://www.w3.org/2000/svg';
    return React.createElement(tag, p, children);
  };
}
exports.default = exports.Svg;
exports.__esModule = true;

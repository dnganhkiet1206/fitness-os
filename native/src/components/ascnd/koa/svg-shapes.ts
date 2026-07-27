import {
  Circle,
  Ellipse,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Polyline,
  RadialGradient,
  Rect,
  Stop,
  Text,
  TSpan,
} from 'react-native-svg';

/**
 * The SVG vocabulary the design exports use, mapped to react-native-svg.
 *
 * Shared by the character (`koa-figure.tsx`) and the room backdrop
 * (`koa-room.tsx`) so a tag or an attribute only has to be taught once.
 */

export const SHAPES: Record<string, React.ComponentType<Record<string, unknown>>> = {
  path: Path as never,
  ellipse: Ellipse as never,
  circle: Circle as never,
  rect: Rect as never,
  line: Line as never,
  polygon: Polygon as never,
  polyline: Polyline as never,
  text: Text as never,
  tspan: TSpan as never,
  linearGradient: LinearGradient as never,
  radialGradient: RadialGradient as never,
  stop: Stop as never,
};

/** react-native-svg wants camelCase where SVG uses kebab-case */
export const ATTR: Record<string, string> = {
  'stroke-width': 'strokeWidth',
  'stroke-linecap': 'strokeLinecap',
  'stroke-linejoin': 'strokeLinejoin',
  'stroke-dasharray': 'strokeDasharray',
  'stroke-dashoffset': 'strokeDashoffset',
  'stroke-opacity': 'strokeOpacity',
  'fill-opacity': 'fillOpacity',
  'fill-rule': 'fillRule',
  'clip-path': 'clipPath',
  'clip-rule': 'clipRule',
  'stop-color': 'stopColor',
  'stop-opacity': 'stopOpacity',
  'font-family': 'fontFamily',
  'font-size': 'fontSize',
  'font-weight': 'fontWeight',
  'font-style': 'fontStyle',
  'text-anchor': 'textAnchor',
  'letter-spacing': 'letterSpacing',
  'gradient-units': 'gradientUnits',
  'gradientUnits': 'gradientUnits',
};

export function attrs(
  a: Record<string, string | number> | undefined,
  dropOpacity = false,
): Record<string, string | number> {
  if (!a) return {};
  const out: Record<string, string | number> = {};
  for (const k of Object.keys(a)) {
    if (dropOpacity && k === 'opacity') continue;
    out[ATTR[k] ?? k] = a[k];
  }
  return out;
}

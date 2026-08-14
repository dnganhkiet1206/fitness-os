import { renderToStaticMarkup } from 'react-dom/server.browser';
  import { KoaFigure } from '@/components/ascnd/koa/koa-figure';
  import type { KoaExpression, KoaPose, Worn } from '@/components/ascnd/koa/koa-flags';
  export { KOA_EXPRESSIONS } from '@/components/ascnd/koa/koa-flags';
  export { KOA_ASPECT } from '@/components/ascnd/koa/koa-frame';
  export { koaStateFor } from '@/lib/koa-emotion';
  export const art = (size: number, expression: KoaExpression, pose: KoaPose, worn: Worn = {}) =>
    renderToStaticMarkup(
      <KoaFigure size={size} animated={false} expression={expression} pose={pose} worn={worn} />,
    );
export { PEEK, PEEK_FIGURE, LEAN_DEG, peekFrame, PEEK_EMOTION } from '@/lib/peek-frame';
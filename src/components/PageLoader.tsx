/**
 * Shared page-level loading state — used as the Suspense fallback for
 * lazy routes and by pages while auth resolves, so every "waiting"
 * moment in the app looks identical.
 */
export default function PageLoader() {
  return (
    <div className="flex items-center justify-center w-full" style={{ minHeight: '60vh' }}>
      <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/30 border-t-primary animate-spin" />
    </div>
  );
}

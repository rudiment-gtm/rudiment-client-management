// Embeds the standalone client-facing EmailBison dashboard (a separate
// Next.js app — see rudiment-gtm/encore-client-dashboard) inside Encore.
// That app gates access with a shared password via HTTP Basic Auth for
// direct visitors, but browsers won't reliably surface a Basic Auth prompt
// inside an iframe — so it also accepts the same password once via a
// `?key=` query param on the iframe's own src URL, which it then carries
// forward on every internal fetch/navigation itself. Nothing else in
// Encore needs to know that detail.
const DASHBOARD_URL = import.meta.env.VITE_CLIENT_DASHBOARD_URL as string | undefined;
const DASHBOARD_KEY = import.meta.env.VITE_CLIENT_DASHBOARD_KEY as string | undefined;

export default function DashboardView() {
  if (!DASHBOARD_URL || !DASHBOARD_KEY) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">
          Client dashboard isn't configured — set VITE_CLIENT_DASHBOARD_URL and VITE_CLIENT_DASHBOARD_KEY.
        </p>
      </div>
    );
  }

  const src = `${DASHBOARD_URL}/?key=${encodeURIComponent(DASHBOARD_KEY)}`;

  return (
    <iframe
      src={src}
      title="Client Dashboard"
      className="w-full h-full border-0"
    />
  );
}

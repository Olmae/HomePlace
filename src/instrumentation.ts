/**
 * Next.js calls this once per server process, before handling requests — the
 * one place where a background job can be started without tying it to whichever
 * page happens to be opened first.
 */
export async function register() {
  // The edge runtime has no timers we can rely on and no database access; the
  // monitor belongs to the Node.js server only.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startMonitor } = await import("./lib/monitor");
  startMonitor();
}

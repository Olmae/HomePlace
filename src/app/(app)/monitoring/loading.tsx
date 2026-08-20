/**
 * Monitoring waits on Prometheus and, when it is configured, on Proxmox — every
 * host, every filesystem, a range query apiece. Rather than a blank page while
 * those return, the App Router paints this the moment the tab is opened and the
 * real cards stream in on top.
 */
export default function LoadingMonitoring() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="h-6 w-32 rounded bg-raised" />
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-7 w-16 rounded-control bg-raised" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-card border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="h-3 w-24 rounded bg-raised" />
              <div className="h-3 w-12 rounded bg-raised" />
            </div>
            <div className="space-y-3 p-4">
              <div className="h-3 w-full rounded bg-raised" />
              <div className="h-3 w-full rounded bg-raised" />
              <div className="h-12 w-full rounded bg-raised" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

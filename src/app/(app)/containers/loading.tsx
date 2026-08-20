/**
 * The containers page reads every host, every container's stats and, when it is
 * around, a Prometheus range per container — enough that the page used to sit
 * blank while it worked. This skeleton is what the App Router shows the instant
 * the link is followed, so there is a page immediately and the real one streams
 * in over it.
 */
export default function LoadingContainers() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-6 w-40 rounded bg-raised" />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-card border border-line p-3">
            <div className="h-3 w-16 rounded bg-raised" />
            <div className="mt-2 h-6 w-12 rounded bg-raised" />
          </div>
        ))}
      </div>

      <div className="mb-3 flex gap-2">
        <div className="h-8 w-52 rounded-control bg-raised" />
        <div className="h-8 w-40 rounded-control bg-raised" />
        <div className="h-8 w-40 rounded-control bg-raised" />
      </div>

      <div className="rounded-card border border-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-0">
            <div className="h-2 w-2 rounded-full bg-raised" />
            <div className="h-7 w-7 rounded bg-raised" />
            <div className="h-4 flex-1 rounded bg-raised" />
            <div className="hidden h-4 w-24 rounded bg-raised sm:block" />
            <div className="h-4 w-16 rounded bg-raised" />
          </div>
        ))}
      </div>
    </div>
  );
}

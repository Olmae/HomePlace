import { Card, CardHeader } from "@/components/ui";

type Shortcut = { label: string; url: string };

/**
 * A tile of hand-picked shortcuts.
 *
 * The dashboard monitors the services you care about; this is for the addresses
 * you just want one click to — the router's admin page, a NAS UI, a wiki, a
 * bookmark that is not a "service" with a status dot. LAN-first: an address with
 * no scheme is opened over http, which is what a 192.168.x box almost always
 * wants.
 */
export function LinksWidget({ title, links }: { title: string; links: Shortcut[] }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader icon="🔗" title={title} />
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {links.length === 0 ? (
          <p className="px-1 text-sm text-muted">—</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noreferrer noopener"
                className="group flex items-center gap-2.5 rounded-control border border-line px-2.5 py-2 transition-colors hover:border-accent hover:bg-raised"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-control bg-raised text-xs font-semibold uppercase text-muted group-hover:text-accent">
                  {initial(l.label)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.label}</span>
                  <span className="block truncate text-[11px] text-faint">{host(l.url)}</span>
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

/** First glyph of the label — a leading emoji comes through whole. */
function initial(label: string): string {
  return [...label.trim()][0] ?? "•";
}

/** The host, for the second line — falls back to the raw address. */
function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

import { Card, CardHeader, Meter, Badge } from "@/components/ui";
import { jellyfinState, qbitState, arrState, pbsState, haStates } from "@/lib/services";
import { HaControls } from "./HaControls";
import { bytes, duration, ago } from "@/lib/format";
import type { Dictionary } from "@/i18n";

/**
 * Widgets for the services this household runs.
 *
 * Each one answers the question you would otherwise open the service to ask —
 * what is playing, what is downloading, when the backup last ran — and each
 * says plainly when it is not configured instead of rendering an empty box.
 */

function NotSet({ title, message }: { title: string; message: string }) {
  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <p className="p-4 text-sm text-muted">{message}</p>
    </Card>
  );
}

// ──────────────────────────────── Jellyfin ───────────────────────────────

export async function JellyfinWidget({ title, d }: { title: string; d: Dictionary }) {
  const state = await jellyfinState();
  if (!state) return <NotSet title={title} message={d.services.notConfigured} />;

  return (
    <Card className="h-full">
      <CardHeader
        title={title}
        action={
          state.transcoding > 0 ? (
            <Badge tone="warn">
              {state.transcoding} {d.services.transcoding}
            </Badge>
          ) : (
            <span className="text-[11px] text-faint">
              {state.counts.movies} · {state.counts.series}
            </span>
          )
        }
      />
      <div className="space-y-2.5 p-4">
        {state.sessions.length === 0 && <p className="text-sm text-muted">{d.services.nothingPlaying}</p>}
        {state.sessions.map((session, i) => (
          <div key={`${session.user}-${i}`}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm">{session.item}</span>
              <span className="shrink-0 text-[11px] text-faint">{session.user}</span>
            </div>
            <Meter value={session.progress} tone={session.transcoding ? "warn" : "ok"} />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ────────────────────────────── qBittorrent ──────────────────────────────

export async function QbitWidget({ title, d }: { title: string; d: Dictionary }) {
  const state = await qbitState();
  if (!state) return <NotSet title={title} message={d.services.notConfigured} />;

  return (
    <Card className="h-full">
      <CardHeader
        title={title}
        action={
          <span className="font-mono text-[11px] tabular-nums text-faint">
            ↓ {bytes(state.downloadSpeed)}/s ↑ {bytes(state.uploadSpeed)}/s
          </span>
        }
      />
      <div className="space-y-2.5 p-4">
        {state.torrents.length === 0 && (
          <p className="text-sm text-muted">
            {d.services.idle} · {state.total}
          </p>
        )}
        {state.torrents.map((torrent) => (
          <div key={torrent.name}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs" title={torrent.name}>
                {torrent.name}
              </span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                {torrent.speed > 0 ? `${bytes(torrent.speed)}/s` : torrent.state}
                {torrent.eta > 0 && torrent.eta < 8640000 ? ` · ${duration(torrent.eta)}` : ""}
              </span>
            </div>
            <Meter value={torrent.progress} tone="ok" />
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────── *arr ────────────────────────────────

export async function ArrWidget({ title, d }: { title: string; d: Dictionary }) {
  const instances = await arrState();
  if (instances.length === 0) return <NotSet title={title} message={d.services.notConfigured} />;

  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="space-y-3 p-4">
        {instances.map((instance) => (
          <div key={instance.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium">{instance.label}</span>
              <span className="flex items-center gap-1.5">
                {instance.warnings > 0 && <Badge tone="warn">{instance.warnings}</Badge>}
                <span className="font-mono text-[11px] tabular-nums text-faint">
                  {instance.queueCount} {d.services.inQueue}
                </span>
              </span>
            </div>
            {instance.queue.map((entry) => (
              <div key={entry.title} className="mt-1">
                <p className="truncate text-[11px] text-muted" title={entry.title}>
                  {entry.title}
                </p>
                <Meter value={entry.progress} tone="ok" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─────────────────────────────────── PBS ─────────────────────────────────

export async function PbsWidget({ title, d }: { title: string; d: Dictionary }) {
  const state = await pbsState();
  if (!state) return <NotSet title={title} message={d.services.notConfigured} />;

  const newest = state.lastBackup[0];
  // Anything older than two days deserves attention: this is the widget that
  // exists to catch a backup job that quietly stopped running.
  const stale = newest ? Date.now() - newest.at > 2 * 86400_000 : true;

  return (
    <Card className="h-full">
      <CardHeader
        title={title}
        action={
          newest ? (
            <Badge tone={stale ? "danger" : "ok"}>{ago(newest.at, d)}</Badge>
          ) : (
            <Badge tone="danger">{d.services.noBackups}</Badge>
          )
        }
      />
      <div className="space-y-3 p-4">
        {state.datastores.map((store) => (
          <div key={store.name}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-xs">{store.name}</span>
              <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">
                {bytes(store.avail)} {d.monitoring.free}
              </span>
            </div>
            <Meter value={store.total > 0 ? (store.used / store.total) * 100 : 0} />
          </div>
        ))}

        <ul className="space-y-0.5 pt-1">
          {state.lastBackup.slice(0, 4).map((group) => (
            <li key={group.group} className="flex items-baseline justify-between gap-2">
              <span className="truncate font-mono text-[11px] text-muted">{group.group}</span>
              <span className="shrink-0 text-[11px] text-faint">{group.at ? ago(group.at, d) : "—"}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

// ────────────────────────────── Home Assistant ───────────────────────────

export async function HomeAssistantWidget({
  config,
  title,
  d,
}: {
  config: Record<string, unknown>;
  title: string;
  d: Dictionary;
}) {
  const ids = Array.isArray(config.entities)
    ? (config.entities as string[])
    : typeof config.entities === "string"
      ? config.entities.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      : [];

  const entities = await haStates(ids);
  if (!entities) return <NotSet title={title} message={d.services.notConfigured} />;

  return (
    <Card className="h-full">
      <CardHeader title={title} />
      <div className="p-2">
        {entities.length === 0 && <p className="p-2 text-sm text-muted">{d.services.pickEntities}</p>}
        {/* The switching itself is a client component: the rest of this card is
            server-rendered and does not need to become interactive for it. */}
        <HaControls d={d} entities={entities.slice(0, 12)} />
      </div>
    </Card>
  );
}

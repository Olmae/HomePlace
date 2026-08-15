import Link from "next/link";
import type { Item } from "@prisma/client";
import { Card, StatusDot, TileIcon, type StatusKind } from "@/components/ui";
import { Widget } from "@/components/widgets";
import { ItemActions } from "./ItemActions";
import type { TileStatus } from "@/lib/status";
import { percent, latency } from "@/lib/format";
import type { Dictionary } from "@/i18n";

type ItemWithChildren = Item & { children?: Item[] };

/**
 * One tile.
 *
 * A tile is first of all a link — the reason to open this page is to get
 * somewhere else quickly. Status, uptime and controls are decoration around
 * that link, and edit controls appear only in edit mode so the normal view
 * stays clickable everywhere.
 */
export function Tile({
  item,
  statuses,
  d,
  editing,
  canEdit,
}: {
  item: ItemWithChildren;
  statuses: Map<string, TileStatus>;
  d: Dictionary;
  editing: boolean;
  canEdit: boolean;
}) {
  if (item.kind === "widget") {
    return (
      <div className="relative h-full">
        {editing && canEdit && <ItemActions item={item} d={d} />}
        <Widget widget={item.widget ?? "notes"} config={parseConfig(item.config)} title={item.title} d={d} />
      </div>
    );
  }

  if (item.kind === "folder") {
    return (
      <Card className="relative h-full p-3">
        {editing && canEdit && <ItemActions item={item} d={d} />}
        <div className="mb-2 flex items-center gap-2">
          <TileIcon icon={item.icon ?? "📁"} title={item.title} color={item.color} />
          <span className="truncate text-sm font-semibold">{item.title}</span>
        </div>
        <ul className="space-y-0.5">
          {(item.children ?? []).map((child) => (
            <li key={child.id}>
              <a
                href={child.url ?? "#"}
                target={child.newTab ? "_blank" : undefined}
                rel={child.newTab ? "noreferrer" : undefined}
                className="flex items-center gap-2 rounded-control px-1.5 py-1 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
              >
                <StatusDot {...dotFor(child, statuses.get(child.id), d)} />
                <span className="truncate">{child.title}</span>
              </a>
            </li>
          ))}
          {(item.children ?? []).length === 0 && <li className="px-1.5 text-xs text-faint">{d.dashboard.empty}</li>}
        </ul>
      </Card>
    );
  }

  // service | link
  const status = statuses.get(item.id);
  const dot = dotFor(item, status, d);
  const href = item.url ?? item.internalUrl ?? "#";
  const isExternal = /^https?:\/\//i.test(href);

  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <TileIcon icon={item.icon} title={item.title} color={item.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{item.title}</span>
            <StatusDot {...dot} pulse />
          </div>
          {item.subtitle && <p className="truncate text-xs text-muted">{item.subtitle}</p>}
        </div>
      </div>

      {item.checkKind !== "none" && (
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-faint">
          <span>{dot.label}</span>
          <span className="font-mono tabular-nums">
            {status?.uptime24h !== null && status?.uptime24h !== undefined
              ? `${d.dashboard.uptime24h} ${percent(status.uptime24h, 1)}`
              : latency(status?.latency)}
          </span>
        </div>
      )}
    </>
  );

  return (
    <Card className="relative h-full transition-shadow hover:shadow-pop">
      {editing && canEdit && <ItemActions item={item} d={d} />}
      {isExternal ? (
        <a
          href={href}
          target={item.newTab ? "_blank" : undefined}
          rel={item.newTab ? "noreferrer" : undefined}
          className="block h-full p-3"
        >
          {body}
        </a>
      ) : (
        <Link href={href} className="block h-full p-3">
          {body}
        </Link>
      )}
    </Card>
  );
}

function dotFor(item: Item, status: TileStatus | undefined, d: Dictionary): { kind: StatusKind; label: string } {
  if (item.checkKind === "none") return { kind: "unknown", label: d.status.unknown };
  if (!status || status.ok === null) return { kind: "unknown", label: d.status.unknown };
  return status.ok ? { kind: "up", label: d.status.up } : { kind: "down", label: d.status.down };
}

/** Widget settings are stored as a JSON string; a broken one must not crash the page. */
function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

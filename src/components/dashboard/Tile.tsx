import Link from "next/link";
import type { Item } from "@prisma/client";
import { Card, StatusDot, TileIcon, type StatusKind } from "@/components/ui";
import { Widget } from "@/components/widgets";
import { ItemActions } from "./ItemActions";
import { FolderContents } from "./FolderContents";
import type { TileStatus } from "@/lib/status";
import { percent, latency } from "@/lib/format";
import { GLYPH, autoIcon, guessIcon } from "@/lib/icons";
import type { Dictionary } from "@/i18n";

type ItemWithChildren = Item & { children?: ItemWithChildren[] };

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
  iconPack = false,
  userId,
}: {
  item: ItemWithChildren;
  statuses: Map<string, TileStatus>;
  d: Dictionary;
  editing: boolean;
  canEdit: boolean;
  iconPack?: boolean;
  /** Passed to widgets that show something personal, such as the calendar. */
  userId?: string;
}) {
  // Resolved here rather than stored: a tile created before icon guessing
  // existed, or one whose address changed, picks up an icon without anyone
  // opening the edit dialog.
  const icon =
    item.icon ||
    autoIcon({ name: item.containerName ?? item.title, url: item.url ?? item.internalUrl ?? "", pack: iconPack });
  const emoji = guessIcon({ name: item.containerName ?? item.title, url: item.url ?? item.internalUrl ?? "" });
  if (item.kind === "widget") {
    return (
      <div className="relative h-full">
        {editing && canEdit && <ItemActions item={item} d={d} />}
        <Widget widget={item.widget ?? "notes"} config={parseConfig(item.config)} title={item.title} d={d} userId={userId} />
      </div>
    );
  }

  if (item.kind === "folder") {
    const children = item.children ?? [];
    return (
      <Card className="relative flex h-full flex-col p-3">
        {editing && canEdit && <ItemActions item={item} d={d} />}

        <div className="mb-2 flex items-center gap-2">
          <TileIcon icon={item.icon || GLYPH.folder} title={item.title} color={item.color} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.title}</span>
          {/* Opening the folder shows the tiles themselves, fully rendered —
              they are built here on the server and handed to the dialog. */}
          <FolderContents
            d={d}
            title={item.title}
            icon={item.icon || GLYPH.folder}
            count={children.length}
            canEdit={canEdit}
            items={children.map((c) => ({ id: c.id, title: c.title, w: c.w }))}
          >
            {children.map((child) => (
              <Tile
                key={child.id}
                item={child}
                statuses={statuses}
                d={d}
                editing={false}
                canEdit={canEdit}
                iconPack={iconPack}
                userId={userId}
              />
            ))}
          </FolderContents>
        </div>

        {/* The tile itself stays a compact index: icon, name, status. The full
            version is one click away and does not have to fit in a small card. */}
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {children.map((child) => {
            const childIcon =
              child.icon ||
              autoIcon({ name: child.containerName ?? child.title, url: child.url ?? "", pack: iconPack });
            const inner = (
              <>
                <TileIcon
                  icon={childIcon}
                  title={child.title}
                  size="sm"
                  fallback={guessIcon({ name: child.containerName ?? child.title, url: child.url ?? "" })}
                />
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
                {child.checkKind !== "none" && <StatusDot {...dotFor(child, statuses.get(child.id), d)} />}
              </>
            );

            // A widget in a folder has nowhere to link to; it opens with the
            // folder instead, where there is room to draw it.
            return (
              <li key={child.id}>
                {child.kind === "widget" || !child.url ? (
                  <span className="flex items-center gap-2 rounded-control px-1.5 py-1 text-sm text-muted">{inner}</span>
                ) : (
                  <a
                    href={child.url}
                    target={child.newTab ? "_blank" : undefined}
                    rel={child.newTab ? "noreferrer" : undefined}
                    className="flex items-center gap-2 rounded-control px-1.5 py-1 text-sm text-muted transition-colors hover:bg-raised hover:text-text"
                  >
                    {inner}
                  </a>
                )}
              </li>
            );
          })}
          {children.length === 0 && (
            <li className="px-1.5 text-xs text-faint">{canEdit ? d.dashboard.folderHint : d.dashboard.folderEmpty}</li>
          )}
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
        <TileIcon icon={icon} title={item.title} color={item.color} fallback={emoji} />
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
    <Card className="group relative h-full transition-shadow hover:shadow-pop">
      {editing && canEdit && <ItemActions item={item} d={d} />}

      {/* Attached to a container: an arrow into its detail view — logs, mounts,
          restarts. Hidden until hover so the tile stays a clean link. */}
      {!editing && item.containerName && item.hostKey && (
        <Link
          href={`/containers/${encodeURIComponent(item.hostKey)}/${encodeURIComponent(item.containerName)}`}
          title={d.containers.details}
          aria-label={`${item.title} — ${d.containers.details}`}
          className="absolute right-1 top-1 z-10 rounded-control px-1.5 text-lg leading-none text-faint opacity-0 transition-opacity hover:bg-raised hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
        >
          {GLYPH.details}
        </Link>
      )}
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

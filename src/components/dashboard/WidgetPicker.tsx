"use client";

import { useState } from "react";
import { TileIcon } from "@/components/TileIcon";
import { SERVICE_ICONS, serviceLogo } from "@/lib/icons";
import type { Dictionary } from "@/i18n";

/**
 * Choosing a widget by looking at it.
 *
 * A dropdown of fifteen names asks someone to already know what "uptime strip"
 * looks like. Here they are grouped by what they are for and each one carries a
 * small sketch of itself — not a live preview, which would mean fifteen
 * simultaneous queries against Prometheus every time this dialog opens, but
 * enough shape to recognise.
 */

export type WidgetKind =
  | "system"
  | "disks"
  | "load"
  | "chart"
  | "gauge"
  | "uptimestrip"
  | "containers"
  | "proxmox"
  | "jellyfin"
  | "qbittorrent"
  | "arr"
  | "pbs"
  | "homeassistant"
  | "homegroups"
  | "scenes"
  | "energy"
  | "mediaplayer"
  | "weather"
  | "calendar"
  | "reminders"
  | "clock"
  | "worldclocks"
  | "countdown"
  | "notes"
  | "feed"
  | "embed"
  | "recentevents"
  | "sla"
  | "ical"
  | "airquality"
  | "rates"
  | "slideshow"
  | "nowplaying";

type Category = { key: "monitoring" | "services" | "smarthome" | "home" | "atmosphere"; widgets: WidgetKind[] };

const CATEGORIES: Category[] = [
  { key: "monitoring", widgets: ["system", "disks", "load", "chart", "gauge", "uptimestrip", "sla", "recentevents", "containers", "proxmox"] },
  { key: "services", widgets: ["jellyfin", "qbittorrent", "arr", "pbs"] },
  { key: "smarthome", widgets: ["homegroups", "homeassistant", "scenes", "energy", "mediaplayer"] },
  { key: "home", widgets: ["weather", "airquality", "calendar", "ical", "reminders", "clock", "worldclocks", "countdown", "rates", "notes", "feed", "embed"] },
  { key: "atmosphere", widgets: ["slideshow", "nowplaying"] },
];

export function WidgetPicker({
  d,
  value,
  onChange,
  collapsed = false,
}: {
  d: Dictionary;
  value: string;
  onChange: (widget: WidgetKind) => void;
  /**
   * Start showing only what is already chosen.
   *
   * Editing a tile is almost never about turning a clock into a disk graph: the
   * kind is settled and the fields below it are the reason the dialog is open.
   * The grid of twenty is one button away, and out of the way until then.
   */
  collapsed?: boolean;
}) {
  const [category, setCategory] = useState<Category["key"]>(
    CATEGORIES.find((c) => c.widgets.includes(value as WidgetKind))?.key ?? "monitoring"
  );
  const [replacing, setReplacing] = useState(false);

  const shown = CATEGORIES.find((c) => c.key === category)!;
  const chosen = CATEGORIES.some((c) => c.widgets.includes(value as WidgetKind));

  if (collapsed && chosen && !replacing) {
    return (
      <div className="flex items-center gap-3 rounded-control border border-line p-2">
        <span className="w-24 shrink-0">
          <Preview kind={value as WidgetKind} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">{d.widgets[value as WidgetKind]}</span>
        <button
          type="button"
          onClick={() => setReplacing(true)}
          className="shrink-0 rounded-control border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-text"
        >
          {d.widgets.replace}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`rounded-control border px-3 py-1.5 text-xs font-medium transition-colors ${
              c.key === category ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-raised"
            }`}
          >
            {d.widgetGroups[c.key]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.widgets.map((widget) => (
          <button
            key={widget}
            type="button"
            onClick={() => {
              onChange(widget);
              setReplacing(false);
            }}
            className={`flex flex-col gap-2 rounded-control border p-2 text-left transition-colors ${
              widget === value ? "border-accent bg-accent/10" : "border-line hover:bg-raised"
            }`}
          >
            <Preview kind={widget} />
            <span className="text-xs font-medium">{d.widgets[widget]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A sketch of what the widget looks like: bars for a meter, a line for a chart,
 * blocks for the uptime strip. Deliberately crude — its job is recognition, and
 * a faithful copy would have to be kept in step with the real thing forever.
 */
function Preview({ kind }: { kind: WidgetKind }) {
  const frame = "flex h-14 w-full flex-col justify-center gap-1 rounded bg-raised p-2";

  // The service widgets preview with the real product logo and a sketch of
  // their content, so the picker reads "Jellyfin" at a glance rather than an
  // abstract grid of bars.
  const serviceKey: Partial<Record<WidgetKind, string>> = {
    jellyfin: "jellyfin",
    qbittorrent: "qbittorrent",
    arr: "sonarr",
    pbs: "pbs",
    homeassistant: "homeassistant",
  };

  if (serviceKey[kind]) {
    const key = serviceKey[kind]!;
    return (
      <span className="flex h-14 w-full flex-row items-center gap-2 rounded bg-raised p-2">
        <TileIcon icon={serviceLogo(key)} title={key} size="md" fallback={SERVICE_ICONS[key] ?? "•"} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          {kind === "jellyfin" && (
            <span className="flex gap-1">
              <span className="h-6 w-4 rounded-sm bg-accent/30" />
              <span className="h-6 w-4 rounded-sm bg-accent/20" />
              <span className="h-6 w-4 rounded-sm bg-line" />
            </span>
          )}
          {kind === "qbittorrent" && (
            <>
              <span className="h-1.5 w-full rounded-full bg-line">
                <span className="block h-1.5 w-2/3 rounded-full bg-ok" />
              </span>
              <span className="h-1.5 w-full rounded-full bg-line">
                <span className="block h-1.5 w-1/3 rounded-full bg-ok" />
              </span>
            </>
          )}
          {kind === "arr" && (
            <>
              <span className="h-1.5 w-full rounded bg-line" />
              <span className="h-1.5 w-2/3 rounded bg-line" />
            </>
          )}
          {kind === "pbs" && <span className="font-mono text-sm leading-none">OK</span>}
          {kind === "homeassistant" && (
            <span className="flex gap-1.5">
              <span className="h-5 flex-1 rounded bg-accent/40" />
              <span className="h-5 flex-1 rounded bg-line" />
              <span className="h-5 flex-1 rounded bg-accent/40" />
            </span>
          )}
        </span>
      </span>
    );
  }

  switch (kind) {
    case "energy":
      return (
        <span className={frame}>
          <span className="mb-0.5 font-mono text-sm leading-none">
            ⚡ 420 <span className="text-[10px] text-faint">W</span>
          </span>
          {[75, 45, 20].map((w, i) => (
            <span key={i} className="h-1 w-full rounded-full bg-line">
              <span className="block h-1 rounded-full bg-warn" style={{ width: `${w}%` }} />
            </span>
          ))}
        </span>
      );

    case "scenes":
      return (
        <span className={`${frame} gap-[3px]`}>
          {[0, 1].map((row) => (
            <span key={row} className="flex gap-[3px]">
              {[0, 1, 2].map((i) => (
                <span key={i} className="flex h-4 flex-1 items-center gap-1 rounded-[3px] bg-line px-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <span className="h-1 flex-1 rounded bg-surface/70" />
                </span>
              ))}
            </span>
          ))}
        </span>
      );

    case "homegroups":
      return (
        <span className={frame}>
          {[true, false].map((on, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="text-[11px] leading-none" aria-hidden>
                💡
              </span>
              <span className="h-1 flex-1 rounded-full bg-line">
                <span className={`block h-1 rounded-full ${on ? "bg-accent" : ""}`} style={{ width: on ? "70%" : "0" }} />
              </span>
              <span className={`h-2.5 w-4 rounded-full ${on ? "bg-accent" : "bg-line"}`} />
            </span>
          ))}
        </span>
      );

    case "system":
    case "disks":
    case "proxmox":
      return (
        <span className={frame}>
          {[70, 45, 30].map((w, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="h-1 flex-1 rounded-full bg-line">
                <span className="block h-1 rounded-full bg-accent" style={{ width: `${w}%` }} />
              </span>
            </span>
          ))}
        </span>
      );

    case "load":
    case "qbittorrent":
      return (
        <span className={frame}>
          {[85, 55, 25].map((w, i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="h-1.5 w-6 rounded bg-line" />
              <span className="h-1 rounded-full bg-ok" style={{ width: `${w / 2}%` }} />
            </span>
          ))}
        </span>
      );

    case "chart":
      return (
        <span className={frame}>
          <svg viewBox="0 0 60 24" className="h-full w-full" aria-hidden>
            <path d="M0,18 L10,12 L20,15 L30,6 L40,10 L50,4 L60,8" fill="none" stroke="rgb(var(--accent))" strokeWidth="1.5" />
            <path d="M0,21 L10,19 L20,20 L30,16 L40,18 L50,14 L60,16" fill="none" stroke="rgb(var(--ok))" strokeWidth="1.5" />
          </svg>
        </span>
      );

    case "gauge":
      return (
        <span className={frame}>
          <svg viewBox="0 0 60 30" className="h-full w-full" aria-hidden>
            <path d="M10,26 A20,20 0 1 1 50,26" fill="none" stroke="rgb(var(--line))" strokeWidth="4" strokeLinecap="round" />
            <path d="M10,26 A20,20 0 0 1 30,6" fill="none" stroke="rgb(var(--accent))" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </span>
      );

    case "uptimestrip":
      return (
        <span className={frame}>
          {[0, 1].map((row) => (
            <span key={row} className="flex gap-[2px]">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2 flex-1 rounded-[1px] ${
                    (row === 0 && i === 9) || (row === 1 && i === 3) ? "bg-danger" : "bg-ok"
                  }`}
                />
              ))}
            </span>
          ))}
        </span>
      );

    case "containers":
    case "pbs":
      return (
        <span className={`${frame} items-start justify-center`}>
          <span className="font-mono text-lg leading-none">12</span>
          <span className="h-1 w-10 rounded-full bg-line" />
        </span>
      );

    case "jellyfin":
    case "nowplaying":
      return (
        <span className={`${frame} flex-row items-center gap-2`}>
          <span className="h-9 w-9 shrink-0 rounded bg-accent/30" />
          <span className="flex flex-1 flex-col gap-1">
            <span className="h-1.5 w-full rounded bg-line" />
            <span className="h-1.5 w-2/3 rounded bg-line" />
          </span>
        </span>
      );

    case "arr":
      return (
        <span className={frame}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="h-1.5 flex-1 rounded bg-line" />
            </span>
          ))}
        </span>
      );

    case "homeassistant":
      return (
        <span className={`${frame} flex-row items-center gap-1.5`}>
          {[true, false, true].map((on, i) => (
            <span key={i} className={`h-6 flex-1 rounded ${on ? "bg-accent/40" : "bg-line"}`} />
          ))}
        </span>
      );

    case "mediaplayer":
      return (
        <span className={`${frame} flex-row items-center gap-2`}>
          <span className="h-9 w-9 shrink-0 rounded bg-gradient-to-br from-accent/50 to-ok/30" />
          <span className="flex flex-1 flex-col gap-1">
            <span className="h-1.5 w-full rounded bg-line" />
            <span className="flex items-center gap-1">
              <span className="text-[10px] leading-none" aria-hidden>
                ⏮
              </span>
              <span className="text-xs leading-none text-accent" aria-hidden>
                ▶
              </span>
              <span className="text-[10px] leading-none" aria-hidden>
                ⏭
              </span>
            </span>
          </span>
        </span>
      );

    case "weather":
      return (
        <span className={`${frame} flex-row items-center gap-2`}>
          <span className="text-xl leading-none" aria-hidden>
            🌤️
          </span>
          <span className="font-mono text-lg leading-none">14°</span>
        </span>
      );

    case "calendar":
      return (
        <span className={`${frame} gap-[3px]`}>
          {[0, 1].map((row) => (
            <span key={row} className="flex gap-[3px]">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-3 flex-1 rounded-[2px] ${row === 0 && i === 2 ? "bg-accent" : "bg-line"}`}
                />
              ))}
            </span>
          ))}
        </span>
      );

    case "reminders":
      return (
        <span className={frame}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px] border border-line" />
              <span className="h-1.5 flex-1 rounded bg-line" />
            </span>
          ))}
        </span>
      );

    case "clock":
      return (
        <span className={`${frame} items-center justify-center`}>
          <span className="font-mono text-lg leading-none">21:40</span>
        </span>
      );

    case "worldclocks":
      return (
        <span className={frame}>
          {["09:40", "14:40", "22:40"].map((t, i) => (
            <span key={i} className="flex items-center justify-between">
              <span className="h-1.5 w-8 rounded bg-line" />
              <span className="font-mono text-[10px] leading-none">{t}</span>
            </span>
          ))}
        </span>
      );

    case "countdown":
      return (
        <span className={`${frame} flex-row items-center justify-center gap-1 font-mono`}>
          {["12", "04", "37"].map((n, i) => (
            <span key={i} className="rounded bg-line px-1 text-sm leading-none">
              {n}
            </span>
          ))}
        </span>
      );

    case "notes":
      return (
        <span className={frame}>
          {[100, 90, 60].map((w, i) => (
            <span key={i} className="h-1.5 rounded bg-line" style={{ width: `${w}%` }} />
          ))}
        </span>
      );

    case "feed":
    case "ical":
      return (
        <span className={frame}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-accent" />
              <span className="h-1.5 flex-1 rounded bg-line" style={{ width: `${90 - i * 15}%` }} />
            </span>
          ))}
        </span>
      );

    case "airquality":
      return (
        <span className={`${frame} items-center justify-center`}>
          <span className="font-mono text-2xl leading-none text-ok">32</span>
          <span className="text-[9px] text-faint">AQI</span>
        </span>
      );

    case "rates":
      return (
        <span className={frame}>
          {["EUR", "RUB", "GBP"].map((c, i) => (
            <span key={i} className="flex items-center justify-between">
              <span className="font-mono text-[9px]">{c}</span>
              <span className="h-1.5 w-8 rounded bg-line" />
            </span>
          ))}
        </span>
      );

    case "embed":
      return (
        <span className={`${frame} items-stretch justify-stretch p-1`}>
          <span className="flex-1 rounded border border-dashed border-line bg-surface/60" />
        </span>
      );

    case "recentevents":
      return (
        <span className={frame}>
          {["bg-danger", "bg-ok", "bg-warn"].map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${c}`} />
              <span className="h-1.5 flex-1 rounded bg-line" />
            </span>
          ))}
        </span>
      );

    case "sla":
      return (
        <span className={frame}>
          {[99.9, 97.2, 88.5].map((p, i) => (
            <span key={i} className="flex items-center justify-between gap-1">
              <span className="h-1.5 w-8 rounded bg-line" />
              <span className={`font-mono text-[9px] ${p >= 99 ? "text-ok" : p >= 95 ? "text-warn" : "text-danger"}`}>{p}%</span>
            </span>
          ))}
        </span>
      );

    case "slideshow":
      return (
        <span className={`${frame} items-center justify-center bg-gradient-to-br from-accent/30 to-ok/20`}>
          <span className="text-lg leading-none" aria-hidden>
            🖼️
          </span>
        </span>
      );

    default:
      return <span className={frame} />;
  }
}

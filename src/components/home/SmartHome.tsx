"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, Badge } from "@/components/ui";
import { Input, Select } from "@/components/form";
import { toggleEntity } from "@/actions/services";
import type { Dictionary } from "@/i18n";

export type Entity = {
  id: string;
  name: string;
  state: string;
  unit?: string;
  domain: string;
  toggleable: boolean;
  area?: string;
  attributes?: Record<string, string>;
};

/**
 * The whole house on one page.
 *
 * Grouped by room where Home Assistant knows the rooms, and by kind of device
 * where it does not — those are the two ways people actually look for a switch.
 * Everything switchable is switched here; everything else is read.
 *
 * Filtering happens in the browser: the state of a house is a few hundred rows,
 * and a round trip per keystroke would be slower than the house itself.
 */
export function SmartHome({
  d,
  entities,
  areas,
  canControl,
}: {
  d: Dictionary;
  entities: Entity[];
  areas: string[];
  canControl: boolean;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"area" | "domain">(areas.length > 0 ? "area" : "domain");
  const [only, setOnly] = useState<"all" | "controls" | "sensors" | "on">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entities.filter((e) => {
      if (only === "controls" && !e.toggleable) return false;
      if (only === "sensors" && e.toggleable) return false;
      if (only === "on" && !isOn(e)) return false;
      if (!needle) return true;
      return `${e.name} ${e.id} ${e.area ?? ""}`.toLowerCase().includes(needle);
    });
  }, [entities, query, only]);

  const groups = useMemo(() => {
    const map = new Map<string, Entity[]>();
    for (const entity of shown) {
      const key = group === "area" ? entity.area ?? d.home.noArea : entity.domain;
      const list = map.get(key);
      if (list) list.push(entity);
      else map.set(key, [entity]);
    }
    // Rooms alphabetically, with the unplaced ones last so they do not lead.
    return [...map.entries()].sort(([a], [b]) => {
      if (a === d.home.noArea) return 1;
      if (b === d.home.noArea) return -1;
      return a.localeCompare(b);
    });
  }, [shown, group, d.home.noArea]);

  const active = entities.filter(isOn).length;

  function flip(entity: Entity) {
    if (!canControl || !entity.toggleable) return;
    setBusy(entity.id);
    startTransition(async () => {
      await toggleEntity(entity.id);
      setBusy(null);
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{d.home.title}</h1>
        <span className="text-xs text-muted">
          {entities.length} · {active} {d.home.on}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={d.common.search} className="w-52" />
        <Select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className="w-40">
          <option value="area">{d.home.byRoom}</option>
          <option value="domain">{d.home.byKind}</option>
        </Select>
        <Select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} className="w-40">
          <option value="all">{d.home.everything}</option>
          <option value="controls">{d.home.controls}</option>
          <option value="sensors">{d.home.sensors}</option>
          <option value="on">{d.home.onlyOn}</option>
        </Select>
      </div>

      <div className="space-y-5">
        {groups.length === 0 && <p className="text-sm text-muted">{d.widgets.noData}</p>}

        {groups.map(([name, list]) => (
          <section key={name}>
            <h2 className="mb-2 text-sm font-semibold tracking-tight">
              {name} <span className="text-muted">· {list.length}</span>
            </h2>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {list.map((entity) => {
                const on = isOn(entity);
                const clickable = canControl && entity.toggleable;

                return (
                  <Card
                    key={entity.id}
                    className={`flex flex-col gap-1 p-3 transition-colors ${
                      clickable ? "cursor-pointer hover:border-accent" : ""
                    } ${on && entity.toggleable ? "border-accent/40 bg-accent/5" : ""} ${
                      busy === entity.id && pending ? "opacity-60" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => flip(entity)}
                      disabled={!clickable}
                      className="flex w-full items-start gap-2 text-left disabled:cursor-default"
                    >
                      <span className="text-lg leading-none" aria-hidden>
                        {domainIcon(entity.domain)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{entity.name}</span>
                        <span className="block truncate text-[10px] text-faint">{entity.id}</span>
                      </span>
                      {entity.toggleable && (
                        // A pill rather than a checkbox: it reads as a switch at
                        // a glance, which is what a wall panel needs.
                        <span
                          className={`h-4 w-7 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-line"}`}
                          aria-hidden
                        >
                          <span
                            className={`mt-[2px] block h-3 w-3 rounded-full bg-surface transition-transform ${
                              on ? "translate-x-[14px]" : "translate-x-[2px]"
                            }`}
                          />
                        </span>
                      )}
                    </button>

                    <div className="flex flex-wrap items-center gap-1">
                      <Badge tone={on && entity.toggleable ? "accent" : "neutral"}>
                        {entity.state}
                        {entity.unit ? ` ${entity.unit}` : ""}
                      </Badge>
                      {Object.entries(entity.attributes ?? {}).map(([key, value]) => (
                        <span key={key} className="text-[10px] text-faint">
                          {shortAttribute(key)} {value}
                        </span>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/** "on", "open", "home" and "playing" all mean the same thing on a card. */
function isOn(entity: Entity): boolean {
  return ["on", "open", "home", "playing", "heat", "cool", "active"].includes(entity.state);
}

function domainIcon(domain: string): string {
  const icons: Record<string, string> = {
    light: "💡",
    switch: "🔌",
    sensor: "📊",
    binary_sensor: "⚫",
    climate: "🌡️",
    media_player: "🔊",
    camera: "📷",
    cover: "🪟",
    lock: "🔒",
    fan: "🌀",
    vacuum: "🧹",
    scene: "🎬",
    script: "📜",
    automation: "⚙️",
    person: "🧍",
    device_tracker: "📍",
    weather: "🌤️",
    sun: "☀️",
    update: "⬆️",
    button: "🔘",
    number: "🔢",
    input_boolean: "🔘",
  };
  return icons[domain] ?? "•";
}

function shortAttribute(key: string): string {
  const names: Record<string, string> = {
    brightness: "☼",
    current_temperature: "🌡",
    temperature: "🌡",
    humidity: "💧",
    battery_level: "🔋",
    media_title: "♪",
  };
  return names[key] ?? key;
}

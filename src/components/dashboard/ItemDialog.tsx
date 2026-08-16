"use client";

import { useState, useTransition } from "react";
import type { Item } from "@prisma/client";
import { Dialog } from "@/components/Dialog";
import { Field, Input, Select, Textarea, Button } from "@/components/form";
import { createItem, updateItem, type ItemInput } from "@/actions/dashboard";
import { autoIcon, GLYPH } from "@/lib/icons";
import { TileIcon } from "@/components/TileIcon";
import type { Dictionary } from "@/i18n";

export type ContainerOption = {
  name: string;
  hostKey: string;
  hostLabel: string;
  state: string;
  image?: string;
  suggestedUrl?: string;
  icon?: string;
  group?: string;
  /** Already has a tile somewhere — shown last and marked. */
  onDashboard?: boolean;
};

type Kind = "service" | "link" | "folder" | "widget";

const widgetKinds = ["system", "disks", "load", "chart", "containers", "proxmox", "clock", "notes", "slideshow", "nowplaying"] as const;

/**
 * The one form that creates and edits everything on a dashboard.
 *
 * Add and edit share it deliberately: they ask for the same fields, and two
 * copies would drift the moment one of them gains an option.
 */
export function ItemDialog({
  d,
  mode,
  item,
  dashboardId,
  initialKind,
  containers = [],
  folders = [],
  onClose,
}: {
  d: Dictionary;
  mode: "add" | "edit";
  item?: Item;
  dashboardId?: string;
  initialKind?: Kind;
  containers?: ContainerOption[];
  folders?: { id: string; title: string }[];
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>((item?.kind as Kind) ?? initialKind ?? "link");
  const [pending, startTransition] = useTransition();

  const config = parseConfig(item?.config);
  const [form, setForm] = useState({
    title: item?.title ?? "",
    subtitle: item?.subtitle ?? "",
    icon: item?.icon ?? "",
    url: item?.url ?? "",
    internalUrl: item?.internalUrl ?? "",
    newTab: item?.newTab ?? true,
    containerName: item?.containerName ?? "",
    hostKey: item?.hostKey ?? "",
    checkKind: item?.checkKind ?? "none",
    checkInterval: item?.checkInterval ?? 60,
    parentId: item?.parentId ?? "",
    w: item?.w ?? 3,
    widget: item?.widget ?? "system",
    // Widget settings, flattened into the same state so one change handler
    // covers the whole form.
    query: str(config.query),
    unit: str(config.unit) || "number",
    rangeMinutes: Number(config.rangeMinutes ?? 180),
    instance: str(config.instance),
    timeZone: str(config.timeZone),
    text: str(config.text),
    images: Array.isArray(config.images) ? (config.images as string[]).join("\n") : str(config.images),
    intervalSeconds: Number(config.intervalSeconds ?? 20),
    caption: str(config.caption),
    fit: str(config.fit) || "cover",
    containersFilter: Array.isArray(config.containers) ? (config.containers as string[]).join("\n") : str(config.containers),
    sortBy: str(config.sortBy) || "cpu",
    limit: Number(config.limit ?? 6),
  });

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** Picking a container fills in the rest — that is the whole point of the shortcut. */
  function pickContainer(name: string) {
    const found = containers.find((c) => c.name === name);
    if (!found) return;
    setForm((f) => ({
      ...f,
      containerName: found.name,
      hostKey: found.hostKey,
      title: f.title || found.name,
      icon: f.icon || found.icon || "",
      // The guessed address contains a placeholder for the host, because the
      // panel cannot know which name or IP you reach that machine by.
      url: f.url || (found.suggestedUrl ?? "").replace("HOST_ADDRESS", window.location.hostname),
      checkKind: f.checkKind === "none" ? "docker" : f.checkKind,
    }));
  }

  function submit() {
    const payload: ItemInput = {
      dashboardId: dashboardId ?? item!.dashboardId,
      parentId: form.parentId || null,
      kind,
      title: form.title,
      subtitle: form.subtitle || null,
      icon: form.icon || null,
      url: form.url || null,
      internalUrl: form.internalUrl || null,
      newTab: form.newTab,
      containerName: form.containerName || null,
      hostKey: form.hostKey || null,
      checkKind: kind === "widget" || kind === "folder" ? "none" : form.checkKind,
      checkInterval: Number(form.checkInterval),
      widget: kind === "widget" ? form.widget : null,
      config: kind === "widget" ? widgetConfig() : undefined,
      w: Number(form.w),
    };

    startTransition(async () => {
      if (mode === "add") await createItem(payload);
      else await updateItem(item!.id, payload);
      onClose();
    });
  }

  function widgetConfig(): Record<string, unknown> {
    switch (form.widget) {
      case "chart":
        return { query: form.query, unit: form.unit, rangeMinutes: Number(form.rangeMinutes) };
      case "system":
      case "disks":
        return { instance: form.instance, rangeMinutes: Number(form.rangeMinutes) };
      case "clock":
        return { timeZone: form.timeZone };
      case "slideshow":
        return {
          images: form.images.split("\n").map((line) => line.trim()).filter(Boolean),
          intervalSeconds: Number(form.intervalSeconds),
          caption: form.caption,
          fit: form.fit,
        };
      case "load":
        return {
          containers: form.containersFilter.split("\n").map((n) => n.trim()).filter(Boolean),
          sortBy: form.sortBy,
          limit: Number(form.limit),
        };
      case "notes":
        return { text: form.text };
      default:
        return {};
    }
  }

  const isTile = kind === "service" || kind === "link";

  return (
    <Dialog open onClose={onClose} title={mode === "add" ? d.dashboard.addTitle : d.common.edit} wide>
      <div className="flex flex-col gap-4">
        {mode === "add" && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <KindCard active={kind === "service"} onClick={() => setKind("service")} title={d.dashboard.addContainer} hint={d.dashboard.addContainerHint} />
            <KindCard active={kind === "link"} onClick={() => setKind("link")} title={d.dashboard.addLink} hint={d.dashboard.addLinkHint} />
            <KindCard active={kind === "folder"} onClick={() => setKind("folder")} title={d.dashboard.addFolder} hint={d.dashboard.addFolderHint} />
            <KindCard active={kind === "widget"} onClick={() => setKind("widget")} title={d.dashboard.addWidget} hint={d.dashboard.addWidgetHint} />
          </div>
        )}

        {kind === "service" && (
          <ContainerPicker
            d={d}
            containers={containers}
            selected={form.containerName}
            onPick={pickContainer}
            onOwn={() => setKind("link")}
          />
        )}

        <Field label={d.dashboard.tileTitle}>
          <Input value={form.title} onChange={(e) => set("title", e.target.value)} autoFocus />
        </Field>

        {kind === "widget" && (
          <>
            <Field label={d.widgets.pick}>
              <Select value={form.widget} onChange={(e) => set("widget", e.target.value)}>
                {widgetKinds.map((w) => (
                  <option key={w} value={w}>
                    {d.widgets[w]}
                  </option>
                ))}
              </Select>
            </Field>

            {form.widget === "chart" && (
              <>
                <Field label={d.widgets.query} hint={d.widgets.queryHint}>
                  <Input value={form.query} onChange={(e) => set("query", e.target.value)} className="font-mono" placeholder="node_load1" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={d.widgets.unit}>
                    <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
                      <option value="number">{d.widgets.unitNumber}</option>
                      <option value="percent">{d.widgets.unitPercent}</option>
                      <option value="bytes">{d.widgets.unitBytes}</option>
                    </Select>
                  </Field>
                  <Field label={d.widgets.range}>
                    <Select value={String(form.rangeMinutes)} onChange={(e) => set("rangeMinutes", Number(e.target.value))}>
                      <option value="60">1 h</option>
                      <option value="180">3 h</option>
                      <option value="720">12 h</option>
                      <option value="1440">24 h</option>
                      <option value="10080">7 d</option>
                    </Select>
                  </Field>
                </div>
              </>
            )}

            {(form.widget === "system" || form.widget === "disks") && (
              <Field label="instance" hint="node_exporter target, e.g. 192.168.0.10:9100 — empty means all">
                <Input value={form.instance} onChange={(e) => set("instance", e.target.value)} className="font-mono" />
              </Field>
            )}

            {form.widget === "clock" && (
              <Field label="Time zone" hint="Europe/Moscow — empty means the browser's own">
                <Input value={form.timeZone} onChange={(e) => set("timeZone", e.target.value)} className="font-mono" />
              </Field>
            )}

            {form.widget === "load" && (
              <>
                <Field label={d.widgets.onlyContainers} hint={d.widgets.onlyContainersHint}>
                  <Textarea
                    rows={3}
                    value={form.containersFilter}
                    onChange={(e) => set("containersFilter", e.target.value)}
                    className="font-mono text-xs"
                    placeholder="jellyfin"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={d.widgets.sortBy}>
                    <Select value={form.sortBy} onChange={(e) => set("sortBy", e.target.value)}>
                      <option value="cpu">{d.monitoring.cpu}</option>
                      <option value="memory">{d.monitoring.memory}</option>
                    </Select>
                  </Field>
                  <Field label={d.widgets.limit}>
                    <Input type="number" min={1} max={20} value={form.limit} onChange={(e) => set("limit", Number(e.target.value))} />
                  </Field>
                </div>
              </>
            )}

            {form.widget === "slideshow" && (
              <>
                <Field label={d.widgets.images} hint={d.widgets.imagesHint}>
                  <Textarea
                    rows={4}
                    value={form.images}
                    onChange={(e) => set("images", e.target.value)}
                    className="font-mono text-xs"
                    placeholder="https://…/photo.jpg"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={`${d.widgets.interval}, ${d.dashboard.seconds}`}>
                    <Input
                      type="number"
                      min={3}
                      value={form.intervalSeconds}
                      onChange={(e) => set("intervalSeconds", Number(e.target.value))}
                    />
                  </Field>
                  <Field label={d.widgets.fit}>
                    <Select value={form.fit} onChange={(e) => set("fit", e.target.value)}>
                      <option value="cover">{d.widgets.fitCover}</option>
                      <option value="contain">{d.widgets.fitContain}</option>
                    </Select>
                  </Field>
                </div>
                <Field label={d.widgets.caption}>
                  <Input value={form.caption} onChange={(e) => set("caption", e.target.value)} />
                </Field>
              </>
            )}

            {form.widget === "notes" && (
              <Field label={d.widgets.noteText}>
                <Textarea rows={4} value={form.text} onChange={(e) => set("text", e.target.value)} />
              </Field>
            )}
          </>
        )}

        {isTile && (
          <>
            <Field label={d.dashboard.tileUrl}>
              <Input
                value={form.url}
                onChange={(e) => set("url", e.target.value)}
                // Fill the icon in once there is an address to guess from, but
                // never overwrite one the user chose.
                onBlur={() => {
                  if (form.icon) return;
                  const guess = autoIcon({ name: form.title, url: form.url });
                  if (guess) set("icon", guess);
                }}
                placeholder="http://192.168.0.10:8096"
                className="font-mono"
              />
            </Field>
            <Field label={d.dashboard.tileInternalUrl} hint={d.dashboard.tileInternalUrlHint}>
              <Input value={form.internalUrl} onChange={(e) => set("internalUrl", e.target.value)} className="font-mono" />
            </Field>
            <Field label={d.dashboard.tileSubtitle}>
              <Input value={form.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
            </Field>
          </>
        )}

        {kind !== "widget" && (
          <Field label={d.dashboard.tileIcon} hint={d.dashboard.tileIconHint}>
            <Input value={form.icon} onChange={(e) => set("icon", e.target.value)} placeholder="🎬" />
          </Field>
        )}

        {isTile && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={d.dashboard.tileCheck}>
              <Select value={form.checkKind} onChange={(e) => set("checkKind", e.target.value)}>
                <option value="none">{d.dashboard.checkNone}</option>
                <option value="http">{d.dashboard.checkHttp}</option>
                <option value="docker">{d.dashboard.checkDocker}</option>
              </Select>
            </Field>
            <Field label={`${d.dashboard.checkInterval}, ${d.dashboard.seconds}`}>
              <Input
                type="number"
                min={15}
                value={form.checkInterval}
                onChange={(e) => set("checkInterval", Number(e.target.value))}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={d.dashboard.tileWidth}>
            <Select value={String(form.w)} onChange={(e) => set("w", Number(e.target.value))}>
              {[2, 3, 4, 6, 8, 12].map((w) => (
                <option key={w} value={w}>
                  {w}/12
                </option>
              ))}
            </Select>
          </Field>
          {kind !== "folder" && folders.length > 0 && (
            <Field label={d.dashboard.addFolder}>
              <Select value={form.parentId} onChange={(e) => set("parentId", e.target.value)}>
                <option value="">—</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        {isTile && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={form.newTab} onChange={(e) => set("newTab", e.target.checked)} />
            {d.dashboard.tileOpenNewTab}
          </label>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-3">
          <Button variant="quiet" onClick={onClose}>
            {d.common.cancel}
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending || !form.title.trim()}>
            {d.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Containers as a grid of tiles rather than a dropdown.
 *
 * You pick a container by recognising it, and a list of thirty names in a
 * select is the one shape that makes that hard. The first cell adds something
 * of your own — anything not running here, or not a container at all — and the
 * ones already on a dashboard sit at the end, marked, so they are still
 * reachable without being in the way.
 */
function ContainerPicker({
  d,
  containers,
  selected,
  onPick,
  onOwn,
}: {
  d: Dictionary;
  containers: ContainerOption[];
  selected: string;
  onPick: (name: string) => void;
  onOwn: () => void;
}) {
  const sorted = [...containers].sort((a, b) => {
    if (!!a.onDashboard !== !!b.onDashboard) return a.onDashboard ? 1 : -1;
    // Running first among the rest: a stopped container is rarely the one
    // being looked for.
    if ((a.state === "running") !== (b.state === "running")) return a.state === "running" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-muted">{d.dashboard.addContainer}</span>
      <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        <button
          type="button"
          onClick={onOwn}
          className="flex flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line px-2 py-3 text-center transition-colors hover:border-accent hover:bg-raised"
        >
          <span className="text-lg leading-none" aria-hidden>
            +
          </span>
          <span className="text-xs font-medium">{d.dashboard.ownService}</span>
        </button>

        {sorted.map((c) => {
          const active = c.name === selected;
          return (
            <button
              key={`${c.hostKey}/${c.name}`}
              type="button"
              onClick={() => onPick(c.name)}
              title={`${c.name} · ${c.hostLabel} · ${c.state}`}
              className={`flex items-center gap-2 rounded-control border px-2 py-2 text-left transition-colors ${
                active ? "border-accent bg-accent/10" : "border-line hover:bg-raised"
              } ${c.onDashboard ? "opacity-55" : ""}`}
            >
              <TileIcon
                icon={c.icon || autoIcon({ name: c.name, image: c.image })}
                title={c.name}
                size="sm"
                fallback={GLYPH.container}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{c.name}</span>
                <span className="block truncate text-[10px] text-faint">
                  {c.onDashboard ? d.containers.onDashboard : c.state}
                </span>
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.state === "running" ? "bg-ok" : "bg-faint"}`}
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      {containers.length === 0 && <p className="mt-1 text-xs text-faint">{d.containers.noDocker}</p>}
    </div>
  );
}

function KindCard({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-control border p-2.5 text-left transition-colors ${
        active ? "border-accent bg-accent/10" : "border-line hover:bg-raised"
      }`}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>
    </button>
  );
}

function parseConfig(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

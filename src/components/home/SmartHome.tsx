"use client";

import { useMemo, useState, useTransition } from "react";
import { Card, Badge } from "@/components/ui";
import { Input, Select, Button, Field } from "@/components/form";
import { Dialog } from "@/components/Dialog";
import { toggleEntity, setGroupState, saveHomeConfig } from "@/actions/services";
import { prettyName, formatValue, VALUE_FORMATS, type ValueFormat } from "@/lib/haFormat";
import {
  groupEntities,
  type HomeConfig,
  type HomeGroup,
  type HomeBucket,
} from "@/lib/homeConfig";
import type { Dictionary } from "@/i18n";

export type Entity = {
  id: string;
  name: string;
  state: string;
  unit?: string;
  domain: string;
  toggleable: boolean;
  area?: string;
  deviceClass?: string;
  attributes?: Record<string, string>;
};

/**
 * The whole house on one page.
 *
 * Home Assistant knows the entities, their rooms and their kinds. This adds the
 * operator's own layer on top, all of it saved and universal — nothing here is
 * specific to one house:
 *
 *  - **Groups** made by hand, cutting across rooms, shown ahead of the
 *    automatic room/kind split.
 *  - **Readable names**: an entity that never got a friendly name shows
 *    "Archer AX53 Uptime", not `sensor.archer_ax53_uptime`.
 *  - **Value formats**: that sensor's `2873.133…` minutes becomes "1d 23h",
 *    automatically where Home Assistant says it is a duration, and by choice
 *    everywhere else.
 *
 * Filtering happens in the browser: the state of a house is a few hundred rows,
 * and a round trip per keystroke would be slower than the house itself.
 */
export function SmartHome({
  d,
  entities,
  areas,
  canControl,
  config: initialConfig,
}: {
  d: Dictionary;
  entities: Entity[];
  areas: string[];
  canControl: boolean;
  config: HomeConfig;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"area" | "domain">(areas.length > 0 ? "area" : "domain");
  const [only, setOnly] = useState<"all" | "controls" | "sensors" | "on">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [config, setConfig] = useState<HomeConfig>(initialConfig);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [editingGroup, setEditingGroup] = useState<HomeBucket<Entity> | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);

  function persist(next: HomeConfig) {
    setConfig(next);
    startTransition(() => void saveHomeConfig(next));
  }

  // The name and value as they should read, resolved once and reused.
  const nameOf = (e: Entity) => config.names[e.id] || prettyName(e.id, e.name);
  const valueOf = (e: Entity) => formatValue(e.state, e.unit, config.formats[e.id] ?? "auto", e.deviceClass);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entities.filter((e) => {
      if (only === "controls" && !e.toggleable) return false;
      if (only === "sensors" && e.toggleable) return false;
      if (only === "on" && !isOn(e)) return false;
      if (!needle) return true;
      return `${nameOf(e)} ${e.id} ${e.area ?? ""}`.toLowerCase().includes(needle);
    });
    // nameOf depends on config.names; recompute when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, query, only, config.names]);

  const buckets = useMemo(
    () =>
      groupEntities(shown, config, group, {
        unplaced: group === "area" ? d.home.noArea : d.home.unplaced,
        kindLabel: (dm) => dm,
      }),
    [shown, config, group, d.home.noArea, d.home.unplaced]
  );

  const active = entities.filter(isOn).length;

  function flip(entity: Entity) {
    if (!canControl || !entity.toggleable) return;
    setBusy(entity.id);
    startTransition(async () => {
      await toggleEntity(entity.id);
      setBusy(null);
    });
  }

  /** Turn every switchable device in a bucket on or off at once. */
  function flipBucket(bucket: HomeBucket<Entity>, on: boolean) {
    const ids = bucket.items.filter((e) => e.toggleable).map((e) => e.id);
    if (ids.length === 0) return;
    setBusy(bucket.key);
    startTransition(async () => {
      await setGroupState(ids, on, bucket.name);
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
        {canControl && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setCreatingGroup(true)}>
            ＋ {d.home.newGroup}
          </Button>
        )}
      </div>

      <div className="space-y-5">
        {buckets.length === 0 && <p className="text-sm text-muted">{d.widgets.noData}</p>}

        {buckets.map((bucket) => {
          // An empty hand-made group stays visible so it can be filled; empty
          // automatic buckets cannot occur.
          if (bucket.items.length === 0 && bucket.groupId === undefined) return null;

          const switchable = bucket.items.filter((e) => e.toggleable);
          const anyOn = switchable.some(isOn);

          return (
            <section key={bucket.key}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="flex min-w-0 items-center gap-1.5 text-sm font-semibold tracking-tight">
                  {bucket.icon && <span aria-hidden>{bucket.icon}</span>}
                  <span className="truncate">{bucket.name}</span>
                  <span className="text-muted">· {bucket.items.length}</span>
                </h2>

                {/* Control the whole group at once — the switchable ones in it.
                    Individual devices stay independently switchable below. */}
                {canControl && switchable.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => flipBucket(bucket, true)}
                      disabled={pending && busy === bucket.key}
                      className={`rounded-control border px-2 py-0.5 text-[11px] transition-colors ${
                        anyOn ? "border-accent/40 text-accent" : "border-line text-muted hover:bg-raised hover:text-text"
                      }`}
                    >
                      {d.home.allOn}
                    </button>
                    <button
                      type="button"
                      onClick={() => flipBucket(bucket, false)}
                      disabled={pending && busy === bucket.key}
                      className="rounded-control border border-line px-2 py-0.5 text-[11px] text-muted transition-colors hover:bg-raised hover:text-text"
                    >
                      {d.home.allOff}
                    </button>
                  </div>
                )}

                {canControl && bucket.groupId && (
                  <button
                    type="button"
                    onClick={() => setEditingGroup(bucket)}
                    className="rounded-control px-1.5 text-xs text-faint transition-colors hover:bg-raised hover:text-text"
                    title={d.home.editGroup}
                  >
                    ✎
                  </button>
                )}
              </div>

              {bucket.items.length === 0 ? (
                <p className="text-xs text-muted">{d.home.groupMembersHint}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {bucket.items.map((entity) => {
                    const on = isOn(entity);
                    const clickable = canControl && entity.toggleable;

                    return (
                      <Card
                        key={entity.id}
                        className={`group relative flex flex-col gap-1 p-3 transition-colors ${
                          clickable ? "cursor-pointer hover:border-accent" : ""
                        } ${on && entity.toggleable ? "border-accent/40 bg-accent/5" : ""} ${
                          busy === entity.id && pending ? "opacity-60" : ""
                        }`}
                      >
                        {canControl && (
                          <button
                            type="button"
                            onClick={() => setEditingEntity(entity)}
                            title={d.home.customize}
                            className="absolute right-1 top-1 z-10 rounded-control px-1 text-xs text-faint opacity-0 transition-opacity hover:bg-raised hover:text-text group-hover:opacity-100"
                          >
                            ⋯
                          </button>
                        )}

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
                            <span className="block truncate text-xs font-medium">{nameOf(entity)}</span>
                            <span className="block truncate text-[10px] text-faint">{entity.id}</span>
                          </span>
                          {entity.toggleable && (
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
                          <Badge tone={on && entity.toggleable ? "accent" : "neutral"}>{valueOf(entity)}</Badge>
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
              )}
            </section>
          );
        })}
      </div>

      {/* Per-device: a readable name and how the value is shown. */}
      {editingEntity && (
        <EntityDialog
          d={d}
          entity={editingEntity}
          config={config}
          onClose={() => setEditingEntity(null)}
          onSave={(next) => {
            persist(next);
            setEditingEntity(null);
          }}
        />
      )}

      {/* Create / edit a hand-made group. */}
      {creatingGroup && (
        <HomeGroupDialog
          d={d}
          entities={entities}
          config={config}
          bucket={null}
          nameOf={nameOf}
          onClose={() => setCreatingGroup(false)}
          onSave={(next) => {
            persist(next);
            setCreatingGroup(false);
          }}
        />
      )}
      {editingGroup && (
        <HomeGroupDialog
          d={d}
          entities={entities}
          config={config}
          bucket={editingGroup}
          nameOf={nameOf}
          onClose={() => setEditingGroup(null)}
          onSave={(next) => {
            persist(next);
            setEditingGroup(null);
          }}
        />
      )}
    </>
  );
}

/** A dialog to rename one entity and choose how its value is shown. */
function EntityDialog({
  d,
  entity,
  config,
  onClose,
  onSave,
}: {
  d: Dictionary;
  entity: Entity;
  config: HomeConfig;
  onClose: () => void;
  onSave: (next: HomeConfig) => void;
}) {
  const [name, setName] = useState(config.names[entity.id] ?? "");
  const [format, setFormat] = useState<ValueFormat>(config.formats[entity.id] ?? "auto");

  const formatLabel: Record<ValueFormat, string> = {
    auto: d.home.fmtAuto,
    number: d.home.fmtNumber,
    duration: d.home.fmtDuration,
    bytes: d.home.fmtBytes,
    percent: d.home.fmtPercent,
    datetime: d.home.fmtDatetime,
    relative: d.home.fmtRelative,
    raw: d.home.fmtRaw,
  };

  function save() {
    const names = { ...config.names };
    if (name.trim()) names[entity.id] = name.trim();
    else delete names[entity.id];

    const formats = { ...config.formats };
    if (format !== "auto") formats[entity.id] = format;
    else delete formats[entity.id];

    onSave({ ...config, names, formats });
  }

  return (
    <Dialog open onClose={onClose} title={prettyName(entity.id, entity.name)} wide>
      <div className="space-y-4">
        <Field label={d.home.displayName} hint={d.home.displayNameHint}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={prettyName(entity.id, entity.name)} />
        </Field>

        <Field label={d.home.valueFormat}>
          <Select value={format} onChange={(e) => setFormat(e.target.value as ValueFormat)}>
            {VALUE_FORMATS.map((f) => (
              <option key={f} value={f}>
                {formatLabel[f]}
              </option>
            ))}
          </Select>
        </Field>

        {/* Live preview, so the choice is confirmed before it is saved. */}
        <div className="flex items-center justify-between rounded-control border border-line bg-raised px-3 py-2 text-sm">
          <span className="font-mono text-[11px] text-faint">
            {entity.state}
            {entity.unit ? ` ${entity.unit}` : ""}
          </span>
          <span className="font-mono tabular-nums">→ {formatValue(entity.state, entity.unit, format, entity.deviceClass)}</span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="quiet" onClick={onClose}>
            {d.common.cancel}
          </Button>
          <Button variant="primary" onClick={save}>
            {d.common.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Create or edit a hand-made group of devices. */
function HomeGroupDialog({
  d,
  entities,
  config,
  bucket,
  nameOf,
  onClose,
  onSave,
}: {
  d: Dictionary;
  entities: Entity[];
  config: HomeConfig;
  bucket: HomeBucket<Entity> | null;
  nameOf: (e: Entity) => string;
  onClose: () => void;
  onSave: (next: HomeConfig) => void;
}) {
  const existing = bucket?.groupId ? config.groups.find((g) => g.id === bucket.groupId) : undefined;
  const [name, setName] = useState(bucket?.name ?? "");
  const [icon, setIcon] = useState(bucket?.icon ?? "");
  const [members, setMembers] = useState<string[]>(existing?.members ?? []);

  const takenElsewhere = useMemo(() => {
    const set = new Set<string>();
    for (const g of config.groups) {
      if (g.id === existing?.id) continue;
      for (const m of g.members) set.add(m);
    }
    return set;
  }, [config.groups, existing?.id]);

  const [pick, setPick] = useState("");

  // The picker is grouped the way the house is thought about — lights with
  // lights, sensors with sensors — and searchable, so a group is assembled by
  // category instead of hunted for down one long alphabetical list.
  const categories = useMemo(() => {
    const needle = pick.trim().toLowerCase();
    const shown = entities.filter((e) => !needle || `${nameOf(e)} ${e.id} ${e.area ?? ""}`.toLowerCase().includes(needle));
    const map = new Map<string, Entity[]>();
    for (const e of shown) {
      const list = map.get(e.domain);
      if (list) list.push(e);
      else map.set(e.domain, [e]);
    }
    return [...map.entries()]
      .map(([domain, list]) => ({ domain, list: list.sort((a, b) => nameOf(a).localeCompare(nameOf(b))) }))
      .sort((a, b) => b.list.length - a.list.length || a.domain.localeCompare(b.domain));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entities, pick, config.names]);

  function toggleMember(id: string) {
    setMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  /** Add or remove a whole category at once — every one not already spoken for. */
  function toggleCategory(list: Entity[]) {
    const free = list.filter((e) => !takenElsewhere.has(e.id)).map((e) => e.id);
    const allIn = free.every((id) => members.includes(id));
    setMembers((prev) => (allIn ? prev.filter((id) => !free.includes(id)) : [...new Set([...prev, ...free])]));
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existing) {
      const groups = config.groups.map((g) =>
        g.id === existing.id ? { ...g, name: trimmed, icon: icon.trim() || undefined, members } : g
      );
      onSave({ ...config, groups });
    } else {
      const grp: HomeGroup = { id: `h${Date.now().toString(36)}`, name: trimmed, icon: icon.trim() || undefined, members };
      onSave({ ...config, groups: [...config.groups, grp] });
    }
  }

  function remove() {
    if (existing) onSave({ ...config, groups: config.groups.filter((g) => g.id !== existing.id) });
  }

  return (
    <Dialog open onClose={onClose} title={bucket ? d.home.editGroup : d.home.newGroup} wide>
      <div className="space-y-4">
        <Field label={d.home.groupName}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={d.home.groupIcon}>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🛋️" />
        </Field>
        <Field label={d.home.groupMembers} hint={d.home.groupMembersHint}>
          <Input
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            placeholder={d.common.search}
            className="mb-2 w-full"
          />
          <div className="max-h-64 space-y-3 overflow-y-auto rounded-control border border-line p-2">
            {categories.length === 0 && <p className="px-1 py-2 text-xs text-muted">{d.widgets.noData}</p>}
            {categories.map(({ domain, list }) => {
              const free = list.filter((e) => !takenElsewhere.has(e.id));
              const allIn = free.length > 0 && free.every((e) => members.includes(e.id));
              return (
                <div key={domain}>
                  <div className="mb-1 flex items-center gap-1.5 px-1">
                    <span aria-hidden>{domainIcon(domain)}</span>
                    <span className="text-xs font-semibold capitalize">{domain.replace(/_/g, " ")}</span>
                    <span className="text-[11px] text-muted">· {list.length}</span>
                    {free.length > 0 && (
                      <button
                        type="button"
                        onClick={() => toggleCategory(list)}
                        title={allIn ? d.home.allOff : d.home.allOn}
                        className="ml-auto rounded-control border border-line px-1.5 py-0.5 text-[11px] text-muted transition-colors hover:bg-raised hover:text-text"
                      >
                        {allIn ? "−" : "+"}
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {list.map((e) => {
                      const taken = takenElsewhere.has(e.id);
                      return (
                        <label
                          key={e.id}
                          className={`flex items-center gap-2 rounded-control px-2 py-1 text-sm ${
                            taken ? "opacity-40" : "cursor-pointer hover:bg-raised"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={members.includes(e.id)}
                            disabled={taken}
                            onChange={() => toggleMember(e.id)}
                          />
                          <span className="truncate">{nameOf(e)}</span>
                          {e.area && <span className="ml-auto font-mono text-[10px] text-faint">{e.area}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Field>

        <div className="flex items-center justify-between gap-2 pt-1">
          {existing ? (
            <Button variant="danger" onClick={remove}>
              {d.home.deleteGroup}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="quiet" onClick={onClose}>
              {d.common.cancel}
            </Button>
            <Button variant="primary" onClick={save}>
              {d.common.save}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
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

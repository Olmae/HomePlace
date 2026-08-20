"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card, Badge, Meter } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import { Input, Select, Button, Field } from "@/components/form";
import { Dialog } from "@/components/Dialog";
import { TileIcon } from "@/components/TileIcon";
import { LiveLogs } from "@/components/containers/LiveLogs";
import {
  LogsIcon,
  PlayIcon,
  StopIcon,
  RestartIcon,
  OpenIcon,
  PlusIcon,
  GroupIcon,
  MonitorIcon,
} from "@/components/containers/ControlIcons";
import { runContainerAction } from "@/actions/containers";
import { createItem, saveContainerGroups } from "@/actions/dashboard";
import { autoIcon, guessIcon, GLYPH } from "@/lib/icons";
import {
  groupContainers,
  type ContainerGroupConfig,
  type CustomGroup,
  type GroupBucket,
} from "@/lib/containerGroups";
import { bytes, percent } from "@/lib/format";
import type { Dictionary } from "@/i18n";

export type Row = {
  /** Recent CPU and memory, for the sparkline in the row. */
  cpuHistory?: [number, number][];
  memoryHistory?: [number, number][];
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health?: string;
  project?: string;
  hostKey: string;
  hostLabel: string;
  ports: { internal: number; external?: number; protocol: string }[];
  suggestedUrl?: string;
  icon?: string;
  onDashboard: boolean;
  cpu?: number;
  memory?: number;
  memoryLimit?: number;
};

/**
 * The container list as an operations view.
 *
 * The dashboard answers "is my stuff up" with tiles you arranged. This answers
 * a different question — "what is running on this machine right now, what is it
 * costing, and which one is misbehaving" — for containers you never bothered to
 * put on a board.
 *
 * Two things this view carries beyond the flat list:
 *
 *  - **Groups.** Containers fold into the stacks they belong to. Compose
 *    projects become groups automatically; anything can also be grouped by
 *    hand, and either kind is renamed, re-iconed, hidden or deleted here.
 *  - **Logs on the spot.** A button on each row opens the tail without leaving
 *    the page — the last lines are there at once, and keep coming.
 *
 * Searching and sorting happen in the browser: the whole list is already here,
 * and a round-trip per keystroke would make it feel worse, not better.
 */
export function ContainerTable({
  d,
  rows,
  canEdit,
  controlEnabled,
  dashboardId,
  iconPack,
  groups,
}: {
  d: Dictionary;
  rows: Row[];
  canEdit: boolean;
  controlEnabled: boolean;
  dashboardId: string | null;
  iconPack: boolean;
  groups: ContainerGroupConfig;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "running" | "stopped" | "problems">("all");
  const [sort, setSort] = useState<"name" | "cpu" | "memory" | "project">("name");
  const [grouped, setGrouped] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // The group configuration is edited here and saved back on every change; the
  // page reads the same setting on its next render, so a reload agrees with it.
  const [config, setConfig] = useState<ContainerGroupConfig>(groups);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [logsRow, setLogsRow] = useState<Row | null>(null);
  const [editing, setEditing] = useState<GroupBucket<Row> | null>(null);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState<Row | null>(null);

  function persist(next: ContainerGroupConfig) {
    setConfig(next);
    startTransition(() => void saveContainerGroups(next));
  }

  /**
   * Move one container into a custom group, or out of every custom group (back
   * to its automatic Compose group). A container belongs to one custom group at
   * a time, so it is first removed from all of them.
   */
  function moveToGroup(name: string, groupId: string | null) {
    const custom = config.custom.map((g) => ({ ...g, members: g.members.filter((m) => m !== name) }));
    if (groupId) {
      const target = custom.find((g) => g.id === groupId);
      if (target) target.members = [...target.members, name];
    }
    persist({ ...config, custom });
  }

  function createGroupWith(name: string, memberName: string) {
    const group: CustomGroup = { id: `g${Date.now().toString(36)}`, name, members: [memberName] };
    // Remove the member from any group it was already in.
    const custom = config.custom.map((g) => ({ ...g, members: g.members.filter((m) => m !== memberName) }));
    persist({ ...config, custom: [...custom, group] });
  }

  const groupOf = (name: string) => config.custom.find((g) => g.members.includes(name)) ?? null;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const problem = (row: Row) =>
      row.state === "restarting" || row.state === "dead" || row.health === "unhealthy" || row.state === "exited";

    return rows
      .filter((row) => {
        if (filter === "running" && row.state !== "running") return false;
        if (filter === "stopped" && row.state === "running") return false;
        if (filter === "problems" && !problem(row)) return false;
        if (!needle) return true;
        return `${row.name} ${row.image} ${row.project ?? ""} ${row.hostLabel}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        if (sort === "cpu") return (b.cpu ?? -1) - (a.cpu ?? -1);
        if (sort === "memory") return (b.memory ?? -1) - (a.memory ?? -1);
        if (sort === "project") return (a.project ?? "~").localeCompare(b.project ?? "~") || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
  }, [rows, query, filter, sort]);

  const searching = query.trim().length > 0 || filter !== "all";

  // Grouping is off while searching: a search wants every match in one place,
  // not scattered under headers half of which are then empty.
  const buckets = useMemo(() => {
    if (!grouped || searching) return null;
    return groupContainers(visible, config, d.containers.ungrouped);
  }, [grouped, searching, visible, config, d.containers.ungrouped]);

  function act(row: Row, action: "start" | "stop" | "restart") {
    setBusy(row.id);
    setError(null);
    startTransition(async () => {
      const result = await runContainerAction(row.hostKey, row.id, row.name, action);
      if (!result.ok) setError(`${row.name}: ${result.error ?? d.containers.actionFailed}`);
      setBusy(null);
    });
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function setAllCollapsed(all: boolean) {
    if (!buckets) return;
    setCollapsed(all ? new Set(buckets.map((b) => b.key)) : new Set());
  }

  function renderRow(row: Row) {
    const running = row.state === "running";
    const icon = row.icon || autoIcon({ name: row.name, image: row.image, pack: iconPack });
    const memoryPercent = row.memory && row.memoryLimit ? (row.memory / row.memoryLimit) * 100 : null;

    return (
      <li key={`${row.hostKey}/${row.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            row.health === "unhealthy" || row.state === "restarting"
              ? "bg-warn"
              : running
                ? "bg-ok"
                : "bg-faint"
          }`}
          title={row.status}
          aria-hidden
        />
        {/* Straight to this container's monitoring — right beside the status
            dot, the same weight as the row's other line icons. */}
        <Link
          href={`/containers/${encodeURIComponent(row.hostKey)}/${encodeURIComponent(row.id)}`}
          title={d.nav.monitoring}
          className="inline-flex shrink-0 items-center rounded-control p-0.5 text-faint transition-colors hover:bg-raised hover:text-text"
        >
          <MonitorIcon />
        </Link>
        <TileIcon icon={icon} title={row.name} size="sm" fallback={guessIcon({ name: row.name, image: row.image }) || GLYPH.container} />

        <div className="min-w-[10rem] flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/containers/${encodeURIComponent(row.hostKey)}/${encodeURIComponent(row.id)}`}
              className="truncate text-sm font-medium hover:text-accent"
            >
              {row.name}
            </Link>
            {row.onDashboard && <span className="text-[10px] text-faint" title={d.containers.onDashboard}>◈</span>}
          </div>
          <p className="truncate font-mono text-[11px] text-faint" title={row.image}>
            {row.status}
          </p>
        </div>

        {row.project && (
          <span className="hidden shrink-0 sm:inline">
            <Badge>{row.project}</Badge>
          </span>
        )}

        <div className="w-24 shrink-0">
          {running && row.cpu !== undefined ? (
            <>
              <p className="text-right font-mono text-[11px] tabular-nums">{percent(row.cpu, 1)}</p>
              {row.cpuHistory && row.cpuHistory.length > 2 ? (
                <span className="block h-5 [&_svg]:h-5">
                  <Sparkline points={row.cpuHistory} min={0} height={20} />
                </span>
              ) : (
                <Meter value={Math.min(100, row.cpu)} />
              )}
            </>
          ) : (
            <span className="block text-right text-[11px] text-faint">—</span>
          )}
        </div>

        <div className="w-28 shrink-0">
          {running && row.memory !== undefined ? (
            <>
              <p className="text-right font-mono text-[11px] tabular-nums">{bytes(row.memory)}</p>
              {row.memoryHistory && row.memoryHistory.length > 2 ? (
                <span className="block h-5 [&_svg]:h-5">
                  <Sparkline points={row.memoryHistory} tone="ok" height={20} />
                </span>
              ) : (
                memoryPercent !== null && <Meter value={memoryPercent} />
              )}
            </>
          ) : (
            <span className="block text-right text-[11px] text-faint">—</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button size="sm" variant="quiet" title={d.containers.viewLogs} onClick={() => setLogsRow(row)}>
            <LogsIcon />
          </Button>

          {row.suggestedUrl && (
            <a
              href={row.suggestedUrl.replace("HOST_ADDRESS", typeof window === "undefined" ? "" : window.location.hostname)}
              target="_blank"
              rel="noreferrer"
              title={d.containers.open}
              className="inline-flex items-center rounded-control px-2 py-1 text-muted transition-colors hover:bg-raised hover:text-text"
            >
              <OpenIcon />
            </a>
          )}

          {canEdit && controlEnabled && (
            <Button
              size="sm"
              variant="quiet"
              disabled={pending && busy === row.id}
              onClick={() => act(row, running ? "restart" : "start")}
              title={running ? d.containers.restart : d.containers.start}
            >
              {running ? <RestartIcon /> : <PlayIcon />}
            </Button>
          )}
          {canEdit && controlEnabled && running && (
            <Button size="sm" variant="quiet" disabled={pending && busy === row.id} onClick={() => act(row, "stop")} title={d.containers.stop}>
              <StopIcon />
            </Button>
          )}

          {canEdit && (
            <Button size="sm" variant="quiet" title={d.containers.moveToGroup} onClick={() => setAssigning(row)}>
              <GroupIcon />
            </Button>
          )}

          {canEdit && !row.onDashboard && dashboardId && (
            <Button
              size="sm"
              variant="quiet"
              disabled={pending}
              title={d.containers.addToDashboard}
              onClick={() =>
                startTransition(() =>
                  void createItem({
                    dashboardId,
                    kind: "service",
                    title: row.name,
                    icon: icon || null,
                    url: row.suggestedUrl?.replace("HOST_ADDRESS", window.location.hostname) ?? null,
                    containerName: row.name,
                    hostKey: row.hostKey,
                    checkKind: "docker",
                  })
                )
              }
            >
              <PlusIcon />
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`${d.common.search} · ${rows.length}`}
          className="w-52"
        />
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="w-40">
          <option value="all">{d.containers.filterAll}</option>
          <option value="running">{d.status.running}</option>
          <option value="stopped">{d.status.stopped}</option>
          <option value="problems">{d.containers.filterProblems}</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-40">
          <option value="name">{d.containers.sortName}</option>
          <option value="project">{d.containers.sortProject}</option>
          <option value="cpu">{d.monitoring.cpu}</option>
          <option value="memory">{d.monitoring.memory}</option>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={grouped ? "ghost" : "quiet"}
            onClick={() => setGrouped((v) => !v)}
            title={grouped ? d.containers.flat : d.containers.grouped}
          >
            {grouped ? d.containers.grouped : d.containers.flat}
          </Button>
          {grouped && !searching && buckets && buckets.length > 1 && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setAllCollapsed(collapsed.size < buckets.length)}
            >
              {collapsed.size < buckets.length ? d.containers.collapseAll : d.containers.expandAll}
            </Button>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              ＋ {d.containers.newGroup}
            </Button>
          )}
        </div>
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      {/* Flat list — used when searching, filtering, or when grouping is off. */}
      {!buckets && (
        <Card>
          <ul className="divide-y divide-line">
            {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">{d.events.noMatches}</li>}
            {visible.map(renderRow)}
          </ul>
        </Card>
      )}

      {/* Grouped view. */}
      {buckets && (
        <div className="space-y-3">
          {buckets.map((bucket) => {
            const isCollapsed = collapsed.has(bucket.key) || (bucket.hidden && !collapsed.has(`show:${bucket.key}`));
            const runningCount = bucket.items.filter((r) => r.state === "running").length;
            // An empty custom group is worth keeping visible so it can be
            // filled; an empty auto group cannot occur.
            if (bucket.items.length === 0 && bucket.customId === undefined) return null;

            return (
              <Card key={bucket.key} className={bucket.hidden ? "opacity-70" : ""}>
                <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleCollapse(bucket.key)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className={`text-faint transition-transform ${isCollapsed ? "" : "rotate-90"}`}>▸</span>
                    {bucket.icon && <TileIcon icon={bucket.icon} title={bucket.name} size="sm" />}
                    <span className="truncate text-sm font-semibold">{bucket.name}</span>
                    {bucket.auto && <Badge>{d.containers.autoGroup}</Badge>}
                    <span className="font-mono text-[11px] text-faint">
                      {runningCount}/{bucket.items.length}
                    </span>
                  </button>

                  {canEdit && bucket.key !== "ungrouped" && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="quiet" title={d.common.edit} onClick={() => setEditing(bucket)}>
                        ✎
                      </Button>
                    </div>
                  )}
                </div>

                {!isCollapsed && (
                  <ul className="divide-y divide-line">
                    {bucket.items.length === 0 ? (
                      <li className="px-4 py-4 text-center text-xs text-muted">{d.containers.groupMembersHint}</li>
                    ) : (
                      bucket.items.map(renderRow)
                    )}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Logs, on the spot. */}
      <Dialog open={logsRow !== null} onClose={() => setLogsRow(null)} title={logsRow?.name ?? d.containers.logs} wide>
        {logsRow && (
          <LiveLogs
            d={d}
            hostKey={logsRow.hostKey}
            id={logsRow.id}
            initial=""
            tail={200}
            className="max-h-[55vh]"
          />
        )}
      </Dialog>

      {/* Create / edit a group. */}
      {creating && (
        <GroupDialog
          d={d}
          rows={rows}
          config={config}
          bucket={null}
          onClose={() => setCreating(false)}
          onSave={(next) => {
            persist(next);
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <GroupDialog
          d={d}
          rows={rows}
          config={config}
          bucket={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            persist(next);
            setEditing(null);
          }}
        />
      )}

      {/* Quick assign one container to a group, from its row. */}
      {assigning && (
        <Dialog open onClose={() => setAssigning(null)} title={assigning.name}>
          <p className="mb-3 text-xs text-muted">{d.containers.moveToGroup}</p>
          <div className="space-y-1">
            {(() => {
              const current = groupOf(assigning.name);
              const rowName = assigning.name;
              return (
                <>
                  {config.custom.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        moveToGroup(rowName, current?.id === g.id ? null : g.id);
                        setAssigning(null);
                      }}
                      className={`flex w-full items-center gap-2 rounded-control border px-3 py-2 text-left text-sm transition-colors ${
                        current?.id === g.id
                          ? "border-accent/40 bg-accent/5"
                          : "border-line hover:bg-raised"
                      }`}
                    >
                      {g.icon && <TileIcon icon={g.icon} title={g.name} size="sm" />}
                      <span className="truncate">{g.name}</span>
                      {current?.id === g.id && <span className="ml-auto text-accent">✓</span>}
                    </button>
                  ))}

                  {current && (
                    <button
                      type="button"
                      onClick={() => {
                        moveToGroup(rowName, null);
                        setAssigning(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-control border border-line px-3 py-2 text-left text-sm transition-colors hover:bg-raised"
                    >
                      {d.containers.ungrouped}
                    </button>
                  )}

                  <NewGroupInline
                    d={d}
                    onCreate={(groupName) => {
                      createGroupWith(groupName, rowName);
                      setAssigning(null);
                    }}
                  />
                </>
              );
            })()}
          </div>
        </Dialog>
      )}
    </>
  );
}

/** A one-field inline form to make a new group and drop the container into it. */
function NewGroupInline({ d, onCreate }: { d: Dictionary; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <div className="flex items-center gap-2 pt-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={d.containers.newGroup} className="flex-1" />
      <Button variant="primary" disabled={!name.trim()} onClick={() => name.trim() && onCreate(name.trim())}>
        {d.common.add}
      </Button>
    </div>
  );
}

/**
 * One dialog for both making and editing a group.
 *
 * A custom group owns its member list; an automatic group owns nothing but an
 * override — a new name, icon and a hidden flag layered over the Compose
 * project — so the member picker only appears for the kind that has members to
 * pick. Everything is returned as a whole new config object the caller saves.
 */
function GroupDialog({
  d,
  rows,
  config,
  bucket,
  onClose,
  onSave,
}: {
  d: Dictionary;
  rows: Row[];
  config: ContainerGroupConfig;
  /** null → creating a new custom group. */
  bucket: GroupBucket<Row> | null;
  onClose: () => void;
  onSave: (next: ContainerGroupConfig) => void;
}) {
  const isAuto = bucket?.auto ?? false;
  const existingCustom = bucket?.customId
    ? config.custom.find((g) => g.id === bucket.customId)
    : undefined;

  const [name, setName] = useState(bucket?.name ?? "");
  const [icon, setIcon] = useState(bucket?.icon ?? "");
  const [members, setMembers] = useState<string[]>(existingCustom?.members ?? []);

  const allNames = useMemo(() => [...rows].sort((a, b) => a.name.localeCompare(b.name)), [rows]);
  // Names already spoken for by another custom group, so a container cannot be
  // claimed by two at once.
  const takenElsewhere = useMemo(() => {
    const set = new Set<string>();
    for (const g of config.custom) {
      if (g.id === existingCustom?.id) continue;
      for (const m of g.members) set.add(m);
    }
    return set;
  }, [config.custom, existingCustom?.id]);

  function toggleMember(n: string) {
    setMembers((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }

  function save() {
    if (isAuto && bucket?.projectKey) {
      const overrides = { ...config.overrides };
      overrides[bucket.projectKey] = {
        ...overrides[bucket.projectKey],
        name: name.trim() || undefined,
        icon: icon.trim() || undefined,
      };
      onSave({ ...config, overrides });
      return;
    }
    // Custom group — create or update.
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existingCustom) {
      const custom = config.custom.map((g) =>
        g.id === existingCustom.id ? { ...g, name: trimmed, icon: icon.trim() || undefined, members } : g
      );
      onSave({ ...config, custom });
    } else {
      const group: CustomGroup = {
        id: `g${Date.now().toString(36)}`,
        name: trimmed,
        icon: icon.trim() || undefined,
        members,
      };
      onSave({ ...config, custom: [...config.custom, group] });
    }
  }

  function toggleHidden() {
    if (!isAuto || !bucket?.projectKey) return;
    const overrides = { ...config.overrides };
    const cur = overrides[bucket.projectKey] ?? {};
    overrides[bucket.projectKey] = { ...cur, hidden: !cur.hidden };
    onSave({ ...config, overrides });
  }

  function remove() {
    if (existingCustom) {
      onSave({ ...config, custom: config.custom.filter((g) => g.id !== existingCustom.id) });
    }
  }

  return (
    <Dialog open onClose={onClose} title={bucket ? d.containers.editGroup : d.containers.newGroup} wide>
      <div className="space-y-4">
        <Field label={d.containers.groupName}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={bucket?.projectKey ?? ""} />
        </Field>
        <Field label={d.containers.groupIcon} hint={isAuto ? d.containers.autoGroupHint : undefined}>
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🧩" />
        </Field>

        {!isAuto && (
          <Field label={d.containers.groupMembers} hint={d.containers.groupMembersHint}>
            <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-control border border-line p-1">
              {allNames.map((r) => {
                const taken = takenElsewhere.has(r.name);
                return (
                  <label
                    key={`${r.hostKey}/${r.id}`}
                    className={`flex items-center gap-2 rounded-control px-2 py-1 text-sm ${
                      taken ? "opacity-40" : "hover:bg-raised"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={members.includes(r.name)}
                      disabled={taken}
                      onChange={() => toggleMember(r.name)}
                    />
                    <span className="truncate">{r.name}</span>
                    {r.project && <span className="ml-auto font-mono text-[11px] text-faint">{r.project}</span>}
                  </label>
                );
              })}
            </div>
          </Field>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2">
            {isAuto && (
              <Button variant="quiet" onClick={toggleHidden}>
                {bucket?.hidden ? d.containers.unhideGroup : d.containers.hideGroup}
              </Button>
            )}
            {existingCustom && (
              <Button variant="danger" onClick={remove}>
                {d.containers.deleteGroup}
              </Button>
            )}
          </div>
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

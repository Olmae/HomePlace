"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Card, Badge, Meter } from "@/components/ui";
import { Input, Select, Button } from "@/components/form";
import { TileIcon } from "@/components/TileIcon";
import { runContainerAction } from "@/actions/containers";
import { createItem, hideContainer } from "@/actions/dashboard";
import { autoIcon, guessIcon, GLYPH } from "@/lib/icons";
import { bytes, percent } from "@/lib/format";
import type { Dictionary } from "@/i18n";

export type Row = {
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
  hidden: boolean;
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
}: {
  d: Dictionary;
  rows: Row[];
  canEdit: boolean;
  controlEnabled: boolean;
  dashboardId: string | null;
  iconPack: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "running" | "stopped" | "problems">("all");
  const [sort, setSort] = useState<"name" | "cpu" | "memory" | "project">("name");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function act(row: Row, action: "start" | "stop" | "restart") {
    setBusy(row.id);
    setError(null);
    startTransition(async () => {
      const result = await runContainerAction(row.hostKey, row.id, row.name, action);
      if (!result.ok) setError(`${row.name}: ${result.error ?? d.containers.actionFailed}`);
      setBusy(null);
    });
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
      </div>

      {error && <p className="mb-2 text-xs text-danger">{error}</p>}

      <Card>
        <ul className="divide-y divide-line">
          {visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">{d.events.noMatches}</li>}

          {visible.map((row) => {
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

                {/* Numbers only for what is running: a stopped container has no
                    statistics, and a column of dashes is noise. */}
                <div className="w-24 shrink-0">
                  {running && row.cpu !== undefined ? (
                    <>
                      <p className="text-right font-mono text-[11px] tabular-nums">{percent(row.cpu, 1)}</p>
                      <Meter value={Math.min(100, row.cpu)} />
                    </>
                  ) : (
                    <span className="block text-right text-[11px] text-faint">—</span>
                  )}
                </div>

                <div className="w-28 shrink-0">
                  {running && row.memory !== undefined ? (
                    <>
                      <p className="text-right font-mono text-[11px] tabular-nums">{bytes(row.memory)}</p>
                      {memoryPercent !== null && <Meter value={memoryPercent} />}
                    </>
                  ) : (
                    <span className="block text-right text-[11px] text-faint">—</span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {row.suggestedUrl && (
                    <a
                      href={row.suggestedUrl.replace("HOST_ADDRESS", typeof window === "undefined" ? "" : window.location.hostname)}
                      target="_blank"
                      rel="noreferrer"
                      title={d.containers.open}
                      className="rounded-control px-2 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-text"
                    >
                      ↗
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
                      {running ? GLYPH.restart : GLYPH.start}
                    </Button>
                  )}
                  {canEdit && controlEnabled && running && (
                    <Button size="sm" variant="quiet" disabled={pending && busy === row.id} onClick={() => act(row, "stop")} title={d.containers.stop}>
                      {GLYPH.stop}
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
                      ＋
                    </Button>
                  )}

                  {canEdit && (
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={pending}
                      title={row.hidden ? d.containers.unhide : d.containers.hide}
                      onClick={() => startTransition(() => void hideContainer(row.name, !row.hidden))}
                    >
                      {row.hidden ? "👁" : "⃠"}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}

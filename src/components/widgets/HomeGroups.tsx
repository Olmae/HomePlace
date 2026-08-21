"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { toggleEntity, setGroupState } from "@/actions/services";
import { groupEntities, type HomeConfig } from "@/lib/homeConfig";
import { prettyName } from "@/lib/haFormat";
import { LightControls, GroupLightControls } from "./LightControls";
import type { Dictionary } from "@/i18n";

export type HomeGroupsEntity = {
  id: string;
  name: string;
  state: string;
  domain: string;
  toggleable: boolean;
  area?: string;
  brightness?: number;
  rgb?: string;
  supportsColor?: boolean;
  supportsColorTemp?: boolean;
};

/**
 * The smart-home groups, on the board.
 *
 * The whole point of a group is to touch several things at once — "the desk",
 * "everything downstairs" — so the group header carries an all-on and an
 * all-off, and each device its own switch under it. Lights get more than a
 * switch: a dimmer and a warm–cool slider, because turning the living room down
 * to a third is the thing people actually reach for at night.
 */
export function HomeGroups({
  d,
  title,
  entities,
  config,
  canControl,
  showGroups,
}: {
  d: Dictionary;
  title: string;
  entities: HomeGroupsEntity[];
  config: HomeConfig;
  canControl: boolean;
  /** Custom group ids to show. Empty or undefined shows every group. */
  showGroups?: string[];
}) {
  const [over, setOver] = useState<Record<string, string>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameOf = (e: HomeGroupsEntity) => config.names[e.id] || prettyName(e.id, e.name);
  const stateOf = (e: HomeGroupsEntity) => over[e.id] ?? e.state;
  const isOn = (e: HomeGroupsEntity) => ["on", "open", "home", "playing"].includes(stateOf(e));

  const pick = showGroups && showGroups.length > 0 ? new Set(showGroups) : null;
  const buckets = groupEntities(entities, config, "area", {
    unplaced: d.home.unplaced,
    kindLabel: (dm) => dm,
  })
    .filter((b) => b.items.some((e) => e.toggleable) || b.groupId !== undefined)
    // When the widget was told which sections to show, show only those. A choice
    // can be a hand-made group (matched by its id) or an automatic room (matched
    // by the bucket key "area:<name>"), so a widget can be pinned to one room.
    .filter((b) => !pick || (b.groupId !== undefined && pick.has(b.groupId)) || pick.has(b.key));

  function flip(e: HomeGroupsEntity) {
    if (!canControl || !e.toggleable) return;
    const after = isOn(e) ? "off" : "on";
    setOver((p) => ({ ...p, [e.id]: after }));
    startTransition(() => void toggleEntity(e.id));
  }

  function flipGroup(ids: string[], on: boolean) {
    if (!canControl || ids.length === 0) return;
    setOver((p) => ({ ...p, ...Object.fromEntries(ids.map((id) => [id, on ? "on" : "off"])) }));
    startTransition(() => void setGroupState(ids, on));
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="💡" />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        {buckets.length === 0 && <p className="text-sm text-muted">{d.widgets.noData}</p>}

        {buckets.map((bucket) => {
          const switchable = bucket.items.filter((e) => e.toggleable).map((e) => e.id);
          const groupLights = bucket.items.filter((e) => e.domain === "light").map((e) => e.id);
          const panelOpen = openGroup === bucket.key;
          return (
            <section key={bucket.key}>
              <div className="mb-1.5 flex items-center gap-2">
                <h3 className="flex min-w-0 items-center gap-1.5 text-xs font-semibold tracking-tight">
                  {bucket.icon && <span aria-hidden>{bucket.icon}</span>}
                  <span className="truncate">{bucket.name}</span>
                  <span className="text-muted">· {bucket.items.length}</span>
                </h3>
                {canControl && switchable.length > 0 && (
                  <div className="ml-auto flex items-center gap-1">
                    {groupLights.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpenGroup(panelOpen ? null : bucket.key)}
                        aria-label={d.home.color}
                        aria-expanded={panelOpen}
                        className={`rounded-control border px-1.5 py-0.5 text-[11px] transition-colors ${
                          panelOpen ? "border-accent text-accent" : "border-line text-muted hover:bg-raised hover:text-text"
                        }`}
                      >
                        ◑
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => flipGroup(switchable, true)}
                      className="rounded-control border border-line px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-raised hover:text-text"
                    >
                      {d.home.allOn}
                    </button>
                    <button
                      type="button"
                      onClick={() => flipGroup(switchable, false)}
                      className="rounded-control border border-line px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:bg-raised hover:text-text"
                    >
                      {d.home.allOff}
                    </button>
                  </div>
                )}
              </div>

              {/* Group-level light control — brightness and colour for every
                  light in the group at once. */}
              {panelOpen && groupLights.length > 0 && <GroupLightControls d={d} lights={groupLights} />}

              <div className="space-y-1.5">
                {bucket.items.map((e) => {
                  const on = isOn(e);
                  const isLight = e.domain === "light";
                  return (
                    <div key={e.id} className="rounded-control bg-raised/60 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm">{nameOf(e)}</span>
                        {e.toggleable ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={nameOf(e)}
                            disabled={!canControl || pending}
                            onClick={() => flip(e)}
                            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                              on ? "bg-accent" : "bg-line"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${
                                on ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        ) : (
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{stateOf(e)}</span>
                        )}
                      </div>

                      {/* Detailed light control appears when the light is on. */}
                      {isLight && on && canControl && (
                        <LightControls
                          d={d}
                          light={{
                            id: e.id,
                            brightness: e.brightness,
                            rgb: e.rgb,
                            supportsColor: e.supportsColor,
                            supportsColorTemp: e.supportsColorTemp,
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}


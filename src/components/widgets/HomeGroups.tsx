"use client";

import { useRef, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { toggleEntity, setGroupState, setLight } from "@/actions/services";
import { groupEntities, type HomeConfig } from "@/lib/homeConfig";
import { prettyName } from "@/lib/haFormat";
import type { Dictionary } from "@/i18n";

export type HomeGroupsEntity = {
  id: string;
  name: string;
  state: string;
  domain: string;
  toggleable: boolean;
  area?: string;
  brightness?: number;
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
}: {
  d: Dictionary;
  title: string;
  entities: HomeGroupsEntity[];
  config: HomeConfig;
  canControl: boolean;
}) {
  const [over, setOver] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const nameOf = (e: HomeGroupsEntity) => config.names[e.id] || prettyName(e.id, e.name);
  const stateOf = (e: HomeGroupsEntity) => over[e.id] ?? e.state;
  const isOn = (e: HomeGroupsEntity) => ["on", "open", "home", "playing"].includes(stateOf(e));

  const buckets = groupEntities(entities, config, "area", {
    unplaced: d.home.unplaced,
    kindLabel: (dm) => dm,
  }).filter((b) => b.items.some((e) => e.toggleable) || b.groupId !== undefined);

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
                      {isLight && on && canControl && <LightControl d={d} entity={e} />}
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

/**
 * A dimmer and a warm–cool slider for one light.
 *
 * Both answer the finger immediately and tell Home Assistant at most every
 * 200ms while dragging, so the room changes as the slider moves instead of when
 * it is let go.
 */
function LightControl({ d, entity }: { d: Dictionary; entity: HomeGroupsEntity }) {
  const [bright, setBright] = useState(entity.brightness ?? 100);
  const [warm, setWarm] = useState(50); // 0 warm … 100 cool, seeded neutral
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function send(next: { brightnessPct?: number; colorTempK?: number }) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void setLight(entity.id, next), 200);
  }

  return (
    <div className="mt-1.5 space-y-1.5">
      <label className="flex items-center gap-2">
        <span className="w-4 text-center text-[11px] text-faint" aria-hidden>
          ☼
        </span>
        <input
          type="range"
          min={1}
          max={100}
          value={bright}
          aria-label={d.home.brightness}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBright(v);
            send({ brightnessPct: v });
          }}
          className="hp-range flex-1"
          style={{ ["--fill" as string]: `${bright}%` }}
        />
        <span className="w-8 text-right font-mono text-[10px] tabular-nums text-faint">{bright}%</span>
      </label>

      <label className="flex items-center gap-2">
        <span className="w-4 text-center text-[11px] text-faint" aria-hidden>
          ◐
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={warm}
          aria-label={d.home.warmth}
          onChange={(e) => {
            const v = Number(e.target.value);
            setWarm(v);
            // 0 → 2200K (warm), 100 → 6500K (cool).
            send({ colorTempK: Math.round(2200 + (v / 100) * (6500 - 2200)) });
          }}
          className="hp-range hp-range-warm flex-1"
          style={{ ["--fill" as string]: `${warm}%` }}
        />
      </label>
    </div>
  );
}

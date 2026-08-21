"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/form";
import { wakeMachine } from "@/actions/wol";
import type { Dictionary } from "@/i18n";

export type WolMachine = { name: string; mac: string; broadcast?: string };

/**
 * Wake a machine from the board.
 *
 * A row per machine and a button that sends the magic packet, flashing to say
 * it went out. It cannot know whether the machine actually woke — that is what
 * an availability check on a tile is for — only that the packet left, which is
 * all Wake-on-LAN ever promises.
 */
export function Wol({ d, title, machines, canControl }: { d: Dictionary; title: string; machines: WolMachine[]; canControl: boolean }) {
  const [state, setState] = useState<Record<string, "ok" | "err">>({});
  const [pending, startTransition] = useTransition();

  function wake(m: WolMachine) {
    if (!canControl) return;
    startTransition(async () => {
      const r = await wakeMachine(m.mac, m.broadcast);
      setState((p) => ({ ...p, [m.mac]: r.ok ? "ok" : "err" }));
      setTimeout(() => setState((p) => {
        const n = { ...p };
        delete n[m.mac];
        return n;
      }), 2500);
    });
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="⏻" />
      <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {machines.map((m) => (
          <div key={m.mac} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}</p>
              <p className="truncate font-mono text-[11px] text-faint">{m.mac}</p>
            </div>
            {state[m.mac] === "ok" ? (
              <span className="text-xs text-ok">✓ {d.widgets.wolSent}</span>
            ) : (
              <Button size="sm" variant="quiet" disabled={!canControl || pending} onClick={() => wake(m)}>
                {state[m.mac] === "err" ? d.common.failed : d.widgets.wolWake}
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { runContainerAction } from "@/actions/containers";
import type { Dictionary } from "@/i18n";

/**
 * Start, stop and restart on the tile itself.
 *
 * The container page has had these all along; the point of putting them here is
 * the case they are actually needed in — something on the dashboard has gone
 * red, and the fix is a restart. Walking to another page to press it is the only
 * part of that which was ever slow.
 *
 * The buttons stop the click from reaching the tile's link: a tile is a link
 * everywhere else, and "restart" opening the service in a new tab would be a
 * nasty surprise.
 */
export function TileControls({
  d,
  hostKey,
  id,
  name,
  state,
}: {
  d: Dictionary;
  hostKey: string;
  id: string;
  name: string;
  state: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const running = state === "running";

  function act(action: "start" | "stop" | "restart", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    startTransition(async () => {
      const result = await runContainerAction(hostKey, id, name, action);
      if (!result.ok) setError(result.error ?? d.containers.actionFailed);
    });
  }

  const button =
    "rounded-control border border-line px-1.5 py-0.5 text-[10px] text-muted transition-colors " +
    "hover:bg-raised hover:text-text disabled:opacity-40";

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {running ? (
        <>
          <button type="button" disabled={pending} onClick={(e) => act("restart", e)} className={button}>
            {d.containers.restart}
          </button>
          <button type="button" disabled={pending} onClick={(e) => act("stop", e)} className={button}>
            {d.containers.stop}
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={(e) => act("start", e)} className={button}>
          {d.containers.start}
        </button>
      )}
      {error && <span className="truncate text-[10px] text-danger">{error}</span>}
    </div>
  );
}

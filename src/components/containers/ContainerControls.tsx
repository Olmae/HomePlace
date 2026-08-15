"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/form";
import { runContainerAction } from "@/actions/containers";
import { GLYPH } from "@/lib/icons";
import type { Dictionary } from "@/i18n";

/**
 * Start / stop / restart, in one place.
 *
 * Shared by the container list and the detail page so the two cannot drift into
 * offering different actions — or, worse, different guards on them.
 */
export function ContainerControls({
  d,
  hostKey,
  id,
  name,
  running,
  canEdit,
  controlEnabled,
  size = "md",
}: {
  d: Dictionary;
  hostKey: string;
  id: string;
  name: string;
  running: boolean;
  canEdit: boolean;
  controlEnabled: boolean;
  size?: "sm" | "md";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!canEdit || !controlEnabled) return null;

  function act(action: "start" | "stop" | "restart") {
    setError(null);
    startTransition(async () => {
      const result = await runContainerAction(hostKey, id, name, action);
      if (!result.ok) setError(result.error ?? d.containers.actionFailed);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {running ? (
        <>
          <Button size={size} disabled={pending} onClick={() => act("restart")}>
            {GLYPH.restart} {d.containers.restart}
          </Button>
          <Button size={size} variant="danger" disabled={pending} onClick={() => act("stop")}>
            {GLYPH.stop} {d.containers.stop}
          </Button>
        </>
      ) : (
        <Button size={size} disabled={pending} onClick={() => act("start")}>
          {GLYPH.start} {d.containers.start}
        </Button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

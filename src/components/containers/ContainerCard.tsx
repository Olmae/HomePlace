"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Card, StatusDot, Badge, TileIcon } from "@/components/ui";
import { Button } from "@/components/form";
import { createItem, hideContainer } from "@/actions/dashboard";
import { ContainerControls } from "./ContainerControls";
import { autoIcon, guessIcon, GLYPH } from "@/lib/icons";
import type { Dictionary } from "@/i18n";

export type ContainerView = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  hostKey: string;
  hostLabel: string;
  ports: { internal: number; external?: number; protocol: string }[];
  suggestedUrl?: string;
  icon?: string;
  onDashboard: boolean;
};

/**
 * One container, with the three things you actually want from a panel: is it
 * running, take me to it, and put it on the dashboard.
 */
export function ContainerCard({
  d,
  container,
  canEdit,
  controlEnabled,
  hidden,
  dashboards,
  iconPack = false,
}: {
  d: Dictionary;
  container: ContainerView;
  canEdit: boolean;
  controlEnabled: boolean;
  hidden: boolean;
  dashboards: { id: string; name: string }[];
  iconPack?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const running = container.state === "running";
  const published = container.ports.filter((p) => p.external);
  // Falls back to a guess from the image name, so a container nobody labelled
  // still arrives with something recognisable instead of a grey square.
  const icon = container.icon ?? autoIcon({ name: container.name, image: container.image, pack: iconPack });
  const emoji = guessIcon({ name: container.name, image: container.image });

  function addToDashboard() {
    const target = dashboards[0];
    if (!target) return;
    startTransition(async () => {
      await createItem({
        dashboardId: target.id,
        kind: "service",
        title: container.name,
        icon: icon || null,
        // The guess carries a placeholder because the server cannot know the
        // address this browser reached it by — the browser can.
        url: container.suggestedUrl?.replace("HOST_ADDRESS", window.location.hostname) ?? null,
        containerName: container.name,
        hostKey: container.hostKey,
        // Container state is the check that needs no configuration and cannot
        // be fooled by a login page.
        checkKind: "docker",
      });
    });
  }

  return (
    <Card className="flex h-full flex-col p-3">
      <div className="flex items-start gap-2.5">
        <TileIcon icon={icon} title={container.name} fallback={emoji || GLYPH.container} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{container.name}</span>
            <StatusDot
              kind={running ? "up" : container.state === "restarting" ? "warn" : "down"}
              label={running ? d.status.running : d.status.stopped}
            />
          </div>
          <p className="truncate font-mono text-[11px] text-faint" title={container.image}>
            {container.image}
          </p>
        </div>
        {/* The arrow into the detail view — logs, mounts, restart count, and
            per-container metrics when Prometheus is around. */}
        <Link
          href={`/containers/${encodeURIComponent(container.hostKey)}/${encodeURIComponent(container.id)}`}
          title={d.containers.details}
          aria-label={d.containers.details}
          className="shrink-0 rounded-control px-1.5 py-0.5 text-lg leading-none text-faint transition-colors hover:bg-raised hover:text-text"
        >
          {GLYPH.details}
        </Link>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge>{container.hostLabel}</Badge>
        <Badge tone={running ? "ok" : "neutral"}>{container.status}</Badge>
        {published.map((p) => (
          <Badge key={`${p.internal}-${p.external}`}>
            {p.external}→{p.internal}
          </Badge>
        ))}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
        {container.suggestedUrl && (
          <a
            href={container.suggestedUrl.replace("HOST_ADDRESS", typeof window === "undefined" ? "" : window.location.hostname)}
            target="_blank"
            rel="noreferrer"
            className="rounded-control border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-text"
          >
            ↗
          </a>
        )}

        <ContainerControls
          d={d}
          hostKey={container.hostKey}
          id={container.id}
          name={container.name}
          running={running}
          canEdit={canEdit}
          controlEnabled={controlEnabled}
          size="sm"
        />

        {canEdit && !container.onDashboard && (
          <Button size="sm" variant="primary" disabled={pending} onClick={addToDashboard}>
            {d.containers.addToDashboard}
          </Button>
        )}

        {canEdit && (
          <Button
            size="sm"
            variant="quiet"
            disabled={pending}
            onClick={() => startTransition(() => void hideContainer(container.name, !hidden))}
          >
            {hidden ? d.containers.unhide : d.containers.hide}
          </Button>
        )}
      </div>
    </Card>
  );
}

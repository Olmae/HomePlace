"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import { Button } from "@/components/form";
import type { Dictionary } from "@/i18n";

/**
 * Logs as they arrive.
 *
 * Two things matter for this to be usable rather than merely live: it follows
 * the bottom only while you are already at the bottom — scrolling up to read
 * something must not be undone by the next line — and it can be paused, because
 * a chatty container makes a moving target of the line you are trying to read.
 *
 * The buffer is capped. A container that logs a megabyte a minute would
 * otherwise turn the tab into a memory leak with a scrollbar.
 */
const MAX_LINES = 2000;

export function LiveLogs({
  d,
  hostKey,
  id,
  initial,
}: {
  d: Dictionary;
  hostKey: string;
  id: string;
  initial: string;
}) {
  const [lines, setLines] = useState<string[]>(() => initial.split("\n").filter(Boolean));
  const [live, setLive] = useState(true);
  const [connected, setConnected] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (!live) return;

    const source = new EventSource(
      `/api/containers/${encodeURIComponent(hostKey)}/${encodeURIComponent(id)}/logs?tail=200`
    );
    setConnected(true);

    source.onmessage = (event) => {
      setLines((prev) => {
        const next = prev.concat(event.data);
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
      });
    };
    source.onerror = () => setConnected(false);

    return () => {
      source.close();
      setConnected(false);
    };
  }, [live, hostKey, id]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <Card>
      <CardHeader
        title={d.containers.logs}
        action={
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${connected && live ? "bg-ok" : "bg-faint"}`} aria-hidden />
            <span className="text-[11px] text-faint">{lines.length}</span>
            <Button size="sm" variant="quiet" onClick={() => setLive((v) => !v)}>
              {live ? d.containers.pause : d.containers.resume}
            </Button>
          </div>
        }
      />
      <pre
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          // Within a couple of lines of the bottom counts as "at the bottom".
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="max-h-[28rem] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted"
      >
        {lines.join("\n") || "—"}
      </pre>
    </Card>
  );
}

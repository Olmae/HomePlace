"use client";

import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from "react";
import { Card, CardHeader } from "@/components/ui";
import { Button, Input } from "@/components/form";
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
  tail = 0,
  className = "max-h-[28rem]",
}: {
  d: Dictionary;
  hostKey: string;
  id: string;
  initial: string;
  /**
   * How many recent lines the follow stream should replay before it starts
   * following. When the server already handed us the tail as `initial`, this is
   * 0 so the same lines do not arrive twice; opened cold (the list drawer), it
   * asks for the last couple hundred so there is something to read at once.
   */
  tail?: number;
  className?: string;
}) {
  const [lines, setLines] = useState<string[]>(() => initial.split("\n").filter(Boolean));
  const [live, setLive] = useState(true);
  const [connected, setConnected] = useState(false);
  const [query, setQuery] = useState("");
  const [onlyMatches, setOnlyMatches] = useState(false);
  const box = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  const needle = query.trim().toLowerCase();
  // When filtering, only the matching lines are shown; otherwise every line is
  // shown and the matches within it are highlighted.
  const shown = useMemo(
    () => (needle && onlyMatches ? lines.filter((l) => l.toLowerCase().includes(needle)) : lines),
    [lines, needle, onlyMatches]
  );
  const matchCount = useMemo(
    () => (needle ? lines.filter((l) => l.toLowerCase().includes(needle)).length : 0),
    [lines, needle]
  );

  useEffect(() => {
    if (!live) return;

    const source = new EventSource(
      `/api/containers/${encodeURIComponent(hostKey)}/${encodeURIComponent(id)}/logs?tail=${tail}`
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
  }, [live, hostKey, id, tail]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown]);

  return (
    <Card>
      <CardHeader
        title={d.containers.logs}
        action={
          <div className="flex items-center gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={d.common.search}
              className="h-7 w-36 text-xs"
            />
            {needle && (
              <button
                type="button"
                onClick={() => setOnlyMatches((v) => !v)}
                title={d.containers.onlyMatches}
                className={`rounded-control border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors ${
                  onlyMatches ? "border-accent text-accent" : "border-line text-muted hover:bg-raised"
                }`}
              >
                {matchCount}
              </button>
            )}
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
        className={`${className} overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted`}
      >
        {shown.length === 0 ? (
          "—"
        ) : needle ? (
          shown.map((line, i) => (
            <div key={i}>{highlight(line, needle)}</div>
          ))
        ) : (
          shown.join("\n")
        )}
      </pre>
    </Card>
  );
}

/** Wrap every case-insensitive occurrence of `needle` in a highlight mark. */
function highlight(line: string, needle: string) {
  const lower = line.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(line.slice(from, at));
    parts.push(
      <mark key={at} className="rounded-[2px] bg-accent/30 text-text">
        {line.slice(at, at + needle.length)}
      </mark>
    );
    from = at + needle.length;
  }
  parts.push(line.slice(from));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

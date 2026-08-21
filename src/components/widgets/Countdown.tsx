"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui";
import type { Dictionary } from "@/i18n";

/**
 * Time until something.
 *
 * A date, a name, and the time left counting down — a release, a trip, a
 * deadline. Client-side because the number changes every second, and it flips
 * to counting up once the moment has passed.
 */
export function Countdown({ d, title, target, label }: { d: Dictionary; title: string; target: string; label?: string }) {
  const [now, setNow] = useState<number | null>(null);
  const at = Date.parse(target);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const valid = Number.isFinite(at);
  const diff = now !== null && valid ? at - now : 0;
  const passed = diff < 0;
  const parts = split(Math.abs(diff));

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="⏳" />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
        {!valid ? (
          <p className="text-sm text-muted">{d.widgets.countdownHint}</p>
        ) : (
          <>
            {label && <p className="text-sm font-medium">{label}</p>}
            <div className="flex items-end gap-2 font-mono tabular-nums">
              {parts.d > 0 && <Unit n={parts.d} label="d" />}
              <Unit n={parts.h} label="h" />
              <Unit n={parts.m} label="m" />
              {parts.d === 0 && <Unit n={parts.s} label="s" />}
            </div>
            <p className="text-[11px] text-faint">
              {passed ? d.widgets.countdownPassed : d.widgets.countdownLeft} ·{" "}
              {new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

function Unit({ n, label }: { n: number; label: string }) {
  return (
    <span className="flex flex-col items-center leading-none">
      <span className="text-3xl">{String(n).padStart(2, "0")}</span>
      <span className="mt-1 text-[10px] text-faint">{label}</span>
    </span>
  );
}

function split(ms: number) {
  const s = Math.floor(ms / 1000);
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

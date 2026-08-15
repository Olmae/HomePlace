"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader } from "@/components/ui";

/**
 * The one widget that must run on the client: a server-rendered clock is wrong
 * the moment it arrives, and it would show the server's timezone rather than
 * the viewer's.
 */
export function Clock({ title, timeZone }: { title: string; timeZone?: string }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Set immediately, then tick. Starting at null keeps the server and the
    // first client render identical, so React has nothing to complain about.
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const options: Intl.DateTimeFormatOptions = timeZone ? { timeZone } : {};

  return (
    <Card className="h-full">
      <CardHeader title={title} action={timeZone ? <span className="text-xs text-faint">{timeZone}</span> : null} />
      <div className="p-4">
        <p className="font-mono text-3xl tabular-nums">
          {now
            ? now.toLocaleTimeString(undefined, { ...options, hour: "2-digit", minute: "2-digit", second: "2-digit" })
            : "--:--:--"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {now ? now.toLocaleDateString(undefined, { ...options, weekday: "long", day: "numeric", month: "long" }) : " "}
        </p>
      </div>
    </Card>
  );
}

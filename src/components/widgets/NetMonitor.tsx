import { Card, CardHeader } from "@/components/ui";
import { Sparkline } from "@/components/Sparkline";
import type { NetSample } from "@/lib/netmon";
import type { Dictionary } from "@/i18n";

/**
 * Internet latency and speed, from the panel's own probe.
 *
 * The headline is the latest round — the delay to reach the outside, and the
 * last download test — with a sparkline of recent latency underneath so a
 * flaky line shows as a jagged one. Down rounds read as a red note.
 */
export function NetMonitor({ d, title, samples }: { d: Dictionary; title: string; samples: NetSample[] }) {
  const latest = samples[samples.length - 1];
  const lastMbps = [...samples].reverse().find((s) => s.mbps != null)?.mbps ?? null;
  const points = samples
    .slice(-40)
    .map((s, i) => [i, s.latency ?? 0] as [number, number])
    .filter((_, i, arr) => arr.length > 1);
  const down = latest && latest.latency === null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title={title} icon="🌐" />
      <div className="min-h-0 flex-1 p-4">
        {!latest ? (
          <p className="text-sm text-muted">{d.widgets.netWaiting}</p>
        ) : (
          <>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <div className={`text-2xl font-semibold tabular-nums ${down ? "text-danger" : ""}`}>
                  {down ? d.widgets.netDown : `${latest.latency} ${d.widgets.netMs}`}
                </div>
                <div className="text-[11px] text-faint">{d.widgets.netLatency}</div>
              </div>
              {lastMbps != null && (
                <div className="text-right">
                  <div className="text-lg font-medium tabular-nums text-ok">{lastMbps}</div>
                  <div className="text-[11px] text-faint">{d.widgets.netMbps}</div>
                </div>
              )}
            </div>
            {points.length > 1 && (
              <span className="block h-10 [&_svg]:h-10">
                <Sparkline points={points} min={0} height={40} tone={down ? "danger" : "accent"} />
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

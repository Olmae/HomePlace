import "server-only";
import { prisma, getSetting, setSetting } from "./db";
import { notify } from "./notify";

/**
 * Internet watch.
 *
 * A home panel is the first place you look when "the internet is down", so it
 * keeps its own answer: a latency probe every couple of minutes and a light
 * download test every half hour, kept as a rolling history for a little graph.
 * When the probe stops answering for two rounds running it says so — once — and
 * again when it comes back. All outbound, so it works behind NAT like the rest.
 */

const SAMPLES_KEY = "netmon.samples";
const STATE_KEY = "netmon.state";

export type NetSample = { at: number; latency: number | null; mbps: number | null };

let lastLatencyAt = 0;
let lastDownloadAt = 0;

async function measureLatency(): Promise<number | null> {
  const targets = ["https://www.gstatic.com/generate_204", "https://1.1.1.1/cdn-cgi/trace"];
  for (const url of targets) {
    try {
      const t0 = performance.now();
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (res.ok || res.status === 204) return Math.round(performance.now() - t0);
    } catch {
      /* try the next target */
    }
  }
  return null;
}

async function measureDownload(): Promise<number | null> {
  try {
    const bytes = 1_000_000;
    const t0 = performance.now();
    const res = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const seconds = (performance.now() - t0) / 1000;
    if (seconds <= 0) return null;
    return Math.round(((buf.byteLength * 8) / 1e6 / seconds) * 10) / 10; // Mbit/s
  } catch {
    return null;
  }
}

export async function internetSamples(): Promise<NetSample[]> {
  return (await getSetting<NetSample[] | null>(SAMPLES_KEY, null)) ?? [];
}

/** Probe once, on the monitor tick. Self-throttled, so it is cheap to call. */
export async function probeInternet(): Promise<void> {
  // Only when the widget is actually on a board — no widget, no probing, no
  // wasted bandwidth. Adding the widget turns it on; removing it turns it off.
  if ((await prisma.item.count({ where: { widget: "netmon" } })) === 0) return;

  const now = Date.now();
  if (now - lastLatencyAt < 120_000) return;
  lastLatencyAt = now;

  const latency = await measureLatency();
  let mbps: number | null = null;
  if (now - lastDownloadAt > 1_800_000) {
    lastDownloadAt = now;
    mbps = await measureDownload();
  }

  const samples = await internetSamples();
  samples.push({ at: now, latency, mbps });
  await setSetting(SAMPLES_KEY, samples.slice(-240));

  // Down = the latency probe found nothing. Confirm with the previous sample so a
  // single hiccup is not an outage, and announce each edge exactly once.
  const prev = samples[samples.length - 2];
  const down = latency === null && prev?.latency === null;
  const state = (await getSetting<{ down: boolean } | null>(STATE_KEY, null)) ?? { down: false };
  if (down && !state.down) {
    await setSetting(STATE_KEY, { down: true });
    await notify({ type: "system", severity: "error", title: "🌐 Интернет недоступен", body: "Пропала связь с внешними серверами." });
  } else if (!down && state.down && latency !== null) {
    await setSetting(STATE_KEY, { down: false });
    await notify({ type: "system", severity: "info", title: "🌐 Интернет восстановлен", body: `${latency} ms` });
  }
}

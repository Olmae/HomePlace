import "server-only";
import { dockerHosts, settings, type DockerHost } from "./config";

/**
 * Docker, over HTTP.
 *
 * HomePlace never touches /var/run/docker.sock directly. Anything that can write
 * to that socket can start a privileged container and own the host, which is a
 * bad thing to hand a web application. The recommended deployment puts a socket
 * proxy in front, allowlisting only the endpoints used here (see
 * docker-compose.yml).
 */

export type Container = {
  id: string;
  name: string;
  image: string;
  /** running | exited | paused | created | restarting | dead */
  state: string;
  status: string;
  createdAt: number;
  ports: { internal: number; external?: number; protocol: string }[];
  labels: Record<string, string>;
  networks: string[];
  hostKey: string;
  hostLabel: string;
  /** Guessed or label-provided address to open in the browser. */
  suggestedUrl?: string;
  /** Label-provided display data, if the container declares it. */
  declared?: { title?: string; icon?: string; group?: string; hide?: boolean };
};

type RawContainer = {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Ports?: { PrivatePort: number; PublicPort?: number; Type: string }[];
  Labels?: Record<string, string>;
  NetworkSettings?: { Networks?: Record<string, unknown> };
};

async function dockerFetch(host: DockerHost, path: string, init?: RequestInit) {
  const res = await fetch(`${host.url}${path}`, {
    ...init,
    cache: "no-store",
    // A hung endpoint must not hang the dashboard; every panel degrades on its own.
    signal: AbortSignal.timeout(6000),
  });
  return res;
}

/**
 * Containers a tile can be attached to.
 *
 * Labels let a container describe how it wants to appear, the same convention
 * other dashboards use, so an existing compose file needs no rewriting:
 *   homeplace.title, homeplace.icon, homeplace.group, homeplace.url,
 *   homeplace.hide = "true"
 */
export async function listContainers(hostKey?: string): Promise<Container[]> {
  const hosts = dockerHosts().filter((h) => !hostKey || h.key === hostKey);
  const results = await Promise.allSettled(
    hosts.map(async (host) => {
      const res = await dockerFetch(host, "/containers/json?all=1");
      if (!res.ok) throw new Error(`docker ${host.key}: HTTP ${res.status}`);
      const raw = (await res.json()) as RawContainer[];
      return raw.map((c) => toContainer(c, host));
    })
  );

  const out: Container[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.error("container listing failed:", r.reason);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function toContainer(c: RawContainer, host: DockerHost): Container {
  const labels = c.Labels ?? {};
  const ports = (c.Ports ?? []).map((p) => ({
    internal: p.PrivatePort,
    external: p.PublicPort,
    protocol: p.Type,
  }));

  return {
    id: c.Id,
    name: (c.Names?.[0] ?? c.Id).replace(/^\//, ""),
    image: c.Image,
    state: c.State,
    status: c.Status,
    createdAt: c.Created * 1000,
    ports,
    labels,
    networks: Object.keys(c.NetworkSettings?.Networks ?? {}),
    hostKey: host.key,
    hostLabel: host.label,
    suggestedUrl: labels["homeplace.url"] ?? guessUrl(ports),
    declared: {
      title: labels["homeplace.title"],
      icon: labels["homeplace.icon"],
      group: labels["homeplace.group"],
      hide: labels["homeplace.hide"] === "true",
    },
  };
}

/**
 * A published port is usually the way in, so offer it as a default when adding
 * a tile. Only a guess — the user confirms or replaces it in the add dialog.
 */
function guessUrl(ports: Container["ports"]): string | undefined {
  const published = ports.filter((p) => p.external && p.protocol === "tcp");
  if (published.length === 0) return undefined;
  // Prefer a recognisable web port over a random one.
  const preferred = published.find((p) => [80, 443, 8080, 8000, 3000].includes(p.internal)) ?? published[0];
  const scheme = preferred.internal === 443 ? "https" : "http";
  return `${scheme}://HOST_ADDRESS:${preferred.external}`;
}

export type ContainerAction = "start" | "stop" | "restart";

/**
 * Container control. Refuses when ALLOW_CONTAINER_CONTROL is off, so an
 * installation can be made strictly read-only from .env regardless of what the
 * UI offers.
 */
export async function controlContainer(
  hostKey: string,
  id: string,
  action: ContainerAction
): Promise<{ ok: boolean; error?: string }> {
  if (!settings.allowContainerControl()) {
    return { ok: false, error: "container control is disabled (ALLOW_CONTAINER_CONTROL)" };
  }
  const host = dockerHosts().find((h) => h.key === hostKey);
  if (!host) return { ok: false, error: `unknown docker host: ${hostKey}` };

  try {
    const res = await dockerFetch(host, `/containers/${encodeURIComponent(id)}/${action}`, { method: "POST" });
    // 204 = done, 304 = already in that state — both are success from the user's side.
    if (res.status === 204 || res.status === 304) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ContainerDetail = Container & {
  command: string;
  restartCount: number;
  startedAt: string;
  finishedAt: string;
  restartPolicy: string;
  mounts: { source: string; destination: string; mode: string; type: string }[];
  env: string[];
  health?: { status: string; failingStreak: number };
};

/**
 * Everything Docker knows about one container.
 *
 * Environment variables are deliberately reduced to names: an .env full of API
 * keys is routinely passed to containers, and a dashboard that prints them on
 * a page is a credential leak waiting for someone to share a screenshot.
 */
export async function inspectContainer(hostKey: string, id: string): Promise<ContainerDetail | null> {
  const host = dockerHosts().find((h) => h.key === hostKey);
  if (!host) return null;

  try {
    const res = await dockerFetch(host, `/containers/${encodeURIComponent(id)}/json`);
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, any>;

    const ports: Container["ports"] = [];
    for (const [key, bindings] of Object.entries(raw.NetworkSettings?.Ports ?? {})) {
      const [portPart, protocol] = key.split("/");
      const external = Array.isArray(bindings) && bindings[0]?.HostPort ? Number(bindings[0].HostPort) : undefined;
      ports.push({ internal: Number(portPart), external, protocol: protocol ?? "tcp" });
    }

    const labels: Record<string, string> = raw.Config?.Labels ?? {};
    const name = String(raw.Name ?? id).replace(/^\//, "");

    return {
      id: raw.Id,
      name,
      image: raw.Config?.Image ?? "",
      state: raw.State?.Status ?? "unknown",
      status: raw.State?.Status ?? "",
      createdAt: Date.parse(raw.Created ?? "") || 0,
      ports,
      labels,
      networks: Object.keys(raw.NetworkSettings?.Networks ?? {}),
      hostKey: host.key,
      hostLabel: host.label,
      suggestedUrl: labels["homeplace.url"] ?? guessUrl(ports),
      declared: {
        title: labels["homeplace.title"],
        icon: labels["homeplace.icon"],
        group: labels["homeplace.group"],
        hide: labels["homeplace.hide"] === "true",
      },
      command: [raw.Path, ...(raw.Args ?? [])].filter(Boolean).join(" "),
      restartCount: Number(raw.RestartCount ?? 0),
      startedAt: raw.State?.StartedAt ?? "",
      finishedAt: raw.State?.FinishedAt ?? "",
      restartPolicy: raw.HostConfig?.RestartPolicy?.Name ?? "",
      mounts: (raw.Mounts ?? []).map((m: Record<string, unknown>) => ({
        source: String(m.Source ?? ""),
        destination: String(m.Destination ?? ""),
        mode: String(m.Mode ?? ""),
        type: String(m.Type ?? ""),
      })),
      // Names only — see the note above.
      env: (raw.Config?.Env ?? []).map((line: string) => line.split("=")[0]),
      health: raw.State?.Health
        ? { status: String(raw.State.Health.Status), failingStreak: Number(raw.State.Health.FailingStreak ?? 0) }
        : undefined,
    };
  } catch (e) {
    console.error("container inspect failed:", e);
    return null;
  }
}

/** Recent log lines for the container detail view. */
export async function containerLogs(hostKey: string, id: string, tail = 200): Promise<string> {
  const host = dockerHosts().find((h) => h.key === hostKey);
  if (!host) return "";
  const res = await dockerFetch(host, `/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&tail=${tail}`);
  if (!res.ok) return "";
  const buf = Buffer.from(await res.arrayBuffer());
  return stripLogHeaders(buf);
}

/**
 * Follow a container's logs.
 *
 * Returns a stream of already-decoded text: Docker multiplexes stdout and
 * stderr with an eight-byte header per frame, and every consumer of this would
 * otherwise have to know that. The caller's AbortSignal is what ends it — when
 * the browser closes the page, the follow stops.
 */
export async function streamLogs(
  hostKey: string,
  id: string,
  tail: number,
  signal: AbortSignal
): Promise<ReadableStream<string> | null> {
  const host = dockerHosts().find((h) => h.key === hostKey);
  if (!host) return null;

  const res = await fetch(
    `${host.url}/containers/${encodeURIComponent(id)}/logs?stdout=1&stderr=1&follow=1&timestamps=0&tail=${tail}`,
    { cache: "no-store", signal }
  );
  if (!res.ok || !res.body) return null;

  // Typed explicitly: Buffer.concat widens to ArrayBufferLike, which no longer
  // matches the narrower Buffer<ArrayBuffer> that Buffer.alloc infers.
  let carry: Buffer = Buffer.alloc(0);
  return res.body.pipeThrough(
    new TransformStream<Uint8Array, string>({
      transform(chunk, controller) {
        // Frames can be split across chunks, so whatever cannot be decoded yet
        // is carried into the next one.
        carry = Buffer.concat([carry, Buffer.from(chunk)]) as Buffer;
        const { text, rest } = takeFrames(carry);
        carry = rest;
        if (text) controller.enqueue(text);
      },
    })
  );
}

/** Consume as many complete frames as `buf` holds; return the remainder. */
function takeFrames(buf: Buffer): { text: string; rest: Buffer } {

  let offset = 0;
  const parts: string[] = [];

  while (offset + 8 <= buf.length) {
    const type = buf[offset];
    // A container with a TTY writes plain bytes with no framing at all.
    if (type !== 1 && type !== 2) return { text: buf.toString("utf8"), rest: Buffer.alloc(0) };

    const length = buf.readUInt32BE(offset + 4);
    if (offset + 8 + length > buf.length) break;
    parts.push(buf.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    offset += 8 + length;
  }

  return { text: parts.join(""), rest: buf.subarray(offset) };
}

/**
 * Docker multiplexes stdout and stderr into one stream with an 8-byte header per
 * frame. Without stripping it, every line starts with control bytes.
 */
function stripLogHeaders(buf: Buffer): string {
  const parts: string[] = [];
  let i = 0;
  while (i + 8 <= buf.length) {
    const type = buf[i];
    // Frames start with 0x01/0x02; anything else means the stream is not
    // multiplexed (TTY containers) — take the rest verbatim.
    if (type !== 1 && type !== 2) return buf.toString("utf8");
    const len = buf.readUInt32BE(i + 4);
    parts.push(buf.subarray(i + 8, i + 8 + len).toString("utf8"));
    i += 8 + len;
  }
  return parts.join("");
}

/** Is each configured endpoint reachable? Used by the health/settings page. */
export async function dockerHealth(): Promise<{ key: string; label: string; ok: boolean; error?: string }[]> {
  return Promise.all(
    dockerHosts().map(async (host) => {
      try {
        const res = await dockerFetch(host, "/_ping");
        return { key: host.key, label: host.label, ok: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
      } catch (e) {
        return { key: host.key, label: host.label, ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    })
  );
}

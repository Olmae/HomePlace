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

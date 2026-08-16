import "server-only";
import { Agent } from "undici";
import { getSetting, setSetting } from "./db";
import { decrypt, encrypt } from "./secretBox";

/**
 * The services this household actually runs.
 *
 * A dashboard that only says "jellyfin: answering" is a bookmark with a light
 * on it. These read each service's own API and show what it is doing — what is
 * playing, what is downloading, when the last backup ran.
 *
 * Every one of them is optional, configured in the settings page, and stored
 * with its key encrypted. A failure returns null rather than throwing: a
 * service being down is exactly when the rest of the dashboard must still work.
 */

const KEY = {
  jellyfin: "integration.jellyfin",
  qbittorrent: "integration.qbittorrent",
  arr: "integration.arr",
  pbs: "integration.pbs",
  homeassistant: "integration.homeassistant",
};

/** Home labs use self-signed certificates; PBS in particular ships with one. */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

type Fetch = { url: string; headers?: HeadersInit; insecure?: boolean; timeout?: number; init?: RequestInit };

async function get<T>({ url, headers, insecure, timeout = 8000, init }: Fetch): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
      // @ts-expect-error — undici's dispatcher option is not in the DOM types.
      dispatcher: insecure ? insecureAgent : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const trim = (url: string) => url.trim().replace(/\/+$/, "");

// ──────────────────────────────── Jellyfin ───────────────────────────────

export type JellyfinSettings = { url: string; apiKey: string };
export type JellyfinState = {
  sessions: { user: string; item: string; kind: string; transcoding: boolean; progress: number }[];
  transcoding: number;
  counts: { movies: number; episodes: number; series: number };
};

export async function jellyfinConfig(): Promise<JellyfinSettings | null> {
  const stored = await getSetting<JellyfinSettings | null>(KEY.jellyfin, null);
  if (!stored?.url || !stored.apiKey) return null;
  return { url: stored.url, apiKey: await decrypt(stored.apiKey) };
}

export async function saveJellyfin(input: JellyfinSettings | null): Promise<void> {
  if (!input?.url) return void (await setSetting(KEY.jellyfin, null));
  const existing = await getSetting<JellyfinSettings | null>(KEY.jellyfin, null);
  await setSetting(KEY.jellyfin, {
    url: trim(input.url),
    apiKey: input.apiKey ? await encrypt(input.apiKey) : existing?.apiKey ?? "",
  });
}

export async function jellyfinState(): Promise<JellyfinState | null> {
  const cfg = await jellyfinConfig();
  if (!cfg) return null;

  const headers = { "x-emby-token": cfg.apiKey };
  const [sessions, counts] = await Promise.all([
    get<Record<string, any>[]>({ url: `${cfg.url}/Sessions`, headers }),
    get<Record<string, number>>({ url: `${cfg.url}/Items/Counts`, headers }),
  ]);
  if (!sessions) return null;

  // Only sessions actually playing something: an idle app that is merely
  // connected is not "what is on".
  const playing = sessions.filter((s) => s.NowPlayingItem);

  return {
    sessions: playing.map((s) => ({
      user: String(s.UserName ?? ""),
      item: String(s.NowPlayingItem?.Name ?? ""),
      kind: String(s.NowPlayingItem?.Type ?? ""),
      transcoding: s.PlayState?.PlayMethod === "Transcode" || !!s.TranscodingInfo,
      progress:
        s.NowPlayingItem?.RunTimeTicks && s.PlayState?.PositionTicks
          ? (s.PlayState.PositionTicks / s.NowPlayingItem.RunTimeTicks) * 100
          : 0,
    })),
    transcoding: playing.filter((s) => s.PlayState?.PlayMethod === "Transcode" || s.TranscodingInfo).length,
    counts: {
      movies: counts?.MovieCount ?? 0,
      episodes: counts?.EpisodeCount ?? 0,
      series: counts?.SeriesCount ?? 0,
    },
  };
}

// ────────────────────────────── qBittorrent ──────────────────────────────

export type QbitSettings = { url: string; username: string; password: string };
export type QbitState = {
  downloadSpeed: number;
  uploadSpeed: number;
  torrents: { name: string; progress: number; state: string; speed: number; eta: number }[];
  active: number;
  total: number;
};

export async function qbitConfig(): Promise<QbitSettings | null> {
  const stored = await getSetting<QbitSettings | null>(KEY.qbittorrent, null);
  if (!stored?.url) return null;
  return { url: stored.url, username: stored.username ?? "", password: stored.password ? await decrypt(stored.password) : "" };
}

export async function saveQbit(input: QbitSettings | null): Promise<void> {
  if (!input?.url) return void (await setSetting(KEY.qbittorrent, null));
  const existing = await getSetting<QbitSettings | null>(KEY.qbittorrent, null);
  await setSetting(KEY.qbittorrent, {
    url: trim(input.url),
    username: input.username?.trim() ?? "",
    password: input.password ? await encrypt(input.password) : existing?.password ?? "",
  });
}

/**
 * qBittorrent hands out a session cookie rather than taking an API key, so the
 * login is part of every read. The cookie is cached for a few minutes — logging
 * in on every dashboard refresh would show up in its log as a brute-force
 * attempt.
 */
let qbitCookie: { value: string; until: number } | null = null;

async function qbitLogin(cfg: QbitSettings): Promise<string | null> {
  if (qbitCookie && qbitCookie.until > Date.now()) return qbitCookie.value;

  try {
    const res = await fetch(`${cfg.url}/api/v2/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", referer: cfg.url },
      body: new URLSearchParams({ username: cfg.username, password: cfg.password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (!res.ok || !cookie) return null;
    qbitCookie = { value: cookie, until: Date.now() + 5 * 60_000 };
    return cookie;
  } catch {
    return null;
  }
}

export async function qbitState(): Promise<QbitState | null> {
  const cfg = await qbitConfig();
  if (!cfg) return null;

  const cookie = await qbitLogin(cfg);
  if (!cookie) return null;
  const headers = { cookie, referer: cfg.url };

  const [transfer, torrents] = await Promise.all([
    get<Record<string, number>>({ url: `${cfg.url}/api/v2/transfer/info`, headers }),
    get<Record<string, any>[]>({ url: `${cfg.url}/api/v2/torrents/info?sort=dlspeed&reverse=true&limit=20`, headers }),
  ]);
  if (!transfer || !torrents) {
    // The cached cookie may have expired early; drop it so the next read logs
    // in again instead of failing forever.
    qbitCookie = null;
    return null;
  }

  const active = torrents.filter((t) => ["downloading", "uploading", "forcedDL", "forcedUP"].includes(String(t.state)));

  return {
    downloadSpeed: transfer.dl_info_speed ?? 0,
    uploadSpeed: transfer.up_info_speed ?? 0,
    active: active.length,
    total: torrents.length,
    torrents: torrents
      .filter((t) => Number(t.progress) < 1 || Number(t.dlspeed) > 0)
      .slice(0, 6)
      .map((t) => ({
        name: String(t.name ?? ""),
        progress: Number(t.progress ?? 0) * 100,
        state: String(t.state ?? ""),
        speed: Number(t.dlspeed ?? 0),
        eta: Number(t.eta ?? 0),
      })),
  };
}

// ─────────────────────────────────── *arr ────────────────────────────────

export type ArrInstance = { kind: string; label: string; url: string; apiKey: string };
export type ArrState = {
  label: string;
  kind: string;
  queue: { title: string; status: string; progress: number }[];
  queueCount: number;
  warnings: number;
};

export async function arrConfig(): Promise<ArrInstance[]> {
  const stored = await getSetting<ArrInstance[]>(KEY.arr, []);
  return Promise.all(
    stored
      .filter((a) => a?.url && a.kind)
      .map(async (a) => ({ ...a, apiKey: a.apiKey ? await decrypt(a.apiKey) : "" }))
  );
}

export async function saveArr(instances: ArrInstance[]): Promise<void> {
  const existing = await getSetting<ArrInstance[]>(KEY.arr, []);
  await setSetting(
    KEY.arr,
    await Promise.all(
      instances
        .filter((a) => a.url?.trim())
        .map(async (a, i) => ({
          kind: a.kind,
          label: a.label?.trim() || a.kind,
          url: trim(a.url),
          apiKey: a.apiKey ? await encrypt(a.apiKey) : existing[i]?.apiKey ?? "",
        }))
    )
  );
}

export async function arrState(): Promise<ArrState[]> {
  const instances = await arrConfig();
  const results = await Promise.all(
    instances.map(async (instance) => {
      const headers = { "x-api-key": instance.apiKey };
      const [queue, health] = await Promise.all([
        get<Record<string, any>>({ url: `${instance.url}/api/v3/queue?pageSize=20`, headers }),
        get<Record<string, any>[]>({ url: `${instance.url}/api/v3/health`, headers }),
      ]);
      if (!queue) return null;

      return {
        label: instance.label,
        kind: instance.kind,
        queueCount: Number(queue.totalRecords ?? queue.records?.length ?? 0),
        warnings: (health ?? []).filter((h) => h.type !== "ok").length,
        queue: (queue.records ?? []).slice(0, 5).map((r: Record<string, any>) => ({
          title: String(r.title ?? ""),
          status: String(r.status ?? ""),
          // Progress is reported as "how much is left", so it has to be turned
          // around to mean what the bar shows.
          progress: r.size > 0 ? ((r.size - (r.sizeleft ?? 0)) / r.size) * 100 : 0,
        })),
      };
    })
  );
  return results.filter((r): r is ArrState => r !== null);
}

// ─────────────────────────────────── PBS ─────────────────────────────────

export type PbsSettings = { url: string; tokenId: string; tokenSecret: string; verifyTls: boolean };
export type PbsState = {
  datastores: { name: string; total: number; used: number; avail: number }[];
  lastBackup: { group: string; at: number }[];
};

export async function pbsConfig(): Promise<PbsSettings | null> {
  const stored = await getSetting<PbsSettings | null>(KEY.pbs, null);
  if (!stored?.url || !stored.tokenId) return null;
  return { ...stored, tokenSecret: await decrypt(stored.tokenSecret) };
}

export async function savePbs(input: PbsSettings | null): Promise<void> {
  if (!input?.url) return void (await setSetting(KEY.pbs, null));
  const existing = await getSetting<PbsSettings | null>(KEY.pbs, null);
  await setSetting(KEY.pbs, {
    url: trim(input.url),
    tokenId: input.tokenId.trim(),
    tokenSecret: input.tokenSecret ? await encrypt(input.tokenSecret) : existing?.tokenSecret ?? "",
    verifyTls: !!input.verifyTls,
  });
}

/**
 * Proxmox Backup Server: how full the datastores are, and when each group was
 * last backed up.
 *
 * "When did this last run" is the only backup question that matters day to day,
 * and it is the one a green container light cannot answer.
 */
export async function pbsState(): Promise<PbsState | null> {
  const cfg = await pbsConfig();
  if (!cfg) return null;

  const headers = { authorization: `PBSAPIToken=${cfg.tokenId}:${cfg.tokenSecret}` };
  const insecure = !cfg.verifyTls;

  const usage = await get<{ data: Record<string, any>[] }>({
    url: `${cfg.url}/api2/json/status/datastore-usage`,
    headers,
    insecure,
  });
  if (!usage) return null;

  const datastores = (usage.data ?? []).map((store) => ({
    name: String(store.store ?? ""),
    total: Number(store.total ?? 0),
    used: Number(store.used ?? 0),
    avail: Number(store.avail ?? 0),
  }));

  // The newest snapshot per group, across every datastore.
  const groups: { group: string; at: number }[] = [];
  for (const store of datastores) {
    const snapshots = await get<{ data: Record<string, any>[] }>({
      url: `${cfg.url}/api2/json/admin/datastore/${encodeURIComponent(store.name)}/groups`,
      headers,
      insecure,
    });
    for (const group of snapshots?.data ?? []) {
      groups.push({
        group: `${group["backup-type"]}/${group["backup-id"]}`,
        at: Number(group["last-backup"] ?? 0) * 1000,
      });
    }
  }

  return { datastores, lastBackup: groups.sort((a, b) => b.at - a.at).slice(0, 8) };
}

// ────────────────────────────── Home Assistant ───────────────────────────

export type HaSettings = { url: string; token: string };
export type HaEntity = {
  id: string;
  name: string;
  state: string;
  unit?: string;
  domain: string;
  toggleable: boolean;
};

export async function haConfig(): Promise<HaSettings | null> {
  const stored = await getSetting<HaSettings | null>(KEY.homeassistant, null);
  if (!stored?.url || !stored.token) return null;
  return { url: stored.url, token: await decrypt(stored.token) };
}

export async function saveHa(input: HaSettings | null): Promise<void> {
  if (!input?.url) return void (await setSetting(KEY.homeassistant, null));
  const existing = await getSetting<HaSettings | null>(KEY.homeassistant, null);
  await setSetting(KEY.homeassistant, {
    url: trim(input.url),
    token: input.token ? await encrypt(input.token) : existing?.token ?? "",
  });
}

/** Domains a tile may switch. Everything else is read-only, deliberately. */
const TOGGLEABLE = new Set(["light", "switch", "input_boolean", "fan", "automation", "script", "scene"]);

export async function haStates(ids?: string[]): Promise<HaEntity[] | null> {
  const cfg = await haConfig();
  if (!cfg) return null;

  const all = await get<Record<string, any>[]>({
    url: `${cfg.url}/api/states`,
    headers: { authorization: `Bearer ${cfg.token}` },
  });
  if (!all) return null;

  const wanted = ids && ids.length > 0 ? new Set(ids) : null;

  return all
    .filter((e) => !wanted || wanted.has(String(e.entity_id)))
    .map((e) => {
      const id = String(e.entity_id);
      const domain = id.split(".")[0];
      return {
        id,
        name: String(e.attributes?.friendly_name ?? id),
        state: String(e.state),
        unit: e.attributes?.unit_of_measurement ? String(e.attributes.unit_of_measurement) : undefined,
        domain,
        toggleable: TOGGLEABLE.has(domain),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Flip a switch.
 *
 * Only the domains above, and only turn_on / turn_off / toggle — a dashboard
 * should not be a general remote control for the whole service.
 */
export async function haToggle(entityId: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = await haConfig();
  if (!cfg) return { ok: false, error: "home assistant is not configured" };

  const domain = entityId.split(".")[0];
  if (!TOGGLEABLE.has(domain)) return { ok: false, error: `${domain} cannot be switched from here` };

  // Scenes and scripts have no "off" — they are run, not toggled.
  const service = domain === "scene" || domain === "script" ? "turn_on" : "toggle";

  try {
    const res = await fetch(`${cfg.url}/api/services/${domain}/${service}`, {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify({ entity_id: entityId }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** What the settings page shows: configured or not, secrets masked. */
export async function servicesForDisplay() {
  const [jellyfin, qbit, arr, pbs, ha] = await Promise.all([
    getSetting<JellyfinSettings | null>(KEY.jellyfin, null),
    getSetting<QbitSettings | null>(KEY.qbittorrent, null),
    getSetting<ArrInstance[]>(KEY.arr, []),
    getSetting<PbsSettings | null>(KEY.pbs, null),
    getSetting<HaSettings | null>(KEY.homeassistant, null),
  ]);

  return {
    jellyfin: { url: jellyfin?.url ?? "", hasKey: !!jellyfin?.apiKey },
    qbittorrent: { url: qbit?.url ?? "", username: qbit?.username ?? "", hasPassword: !!qbit?.password },
    arr: arr.map((a) => ({ kind: a.kind, label: a.label, url: a.url, hasKey: !!a.apiKey })),
    pbs: { url: pbs?.url ?? "", tokenId: pbs?.tokenId ?? "", hasSecret: !!pbs?.tokenSecret, verifyTls: !!pbs?.verifyTls },
    homeassistant: { url: ha?.url ?? "", hasToken: !!ha?.token },
  };
}

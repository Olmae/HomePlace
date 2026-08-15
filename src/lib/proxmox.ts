import "server-only";
import { Agent } from "undici";
import { proxmox } from "./config";

/**
 * Proxmox VE, read-only.
 *
 * It answers things no exporter does as directly: which VMs and containers
 * exist and whether they are running, what the physical disks report through
 * SMART, how full each storage is. HomePlace only reads — starting and stopping
 * virtual machines belongs in the Proxmox UI, not in a dashboard tile.
 */

export type PveNode = {
  node: string;
  status: string;
  uptime: number;
  cpu: number;
  maxcpu: number;
  mem: number;
  maxmem: number;
};

export type PveGuest = {
  id: string;
  vmid: number;
  name: string;
  /** qemu | lxc */
  type: string;
  node: string;
  status: string;
  uptime: number;
  cpu: number;
  mem: number;
  maxmem: number;
  maxdisk: number;
};

export type PveDisk = {
  devpath: string;
  model: string;
  size: number;
  /** PASSED | FAILED | UNKNOWN */
  health: string;
  wearout?: number;
  used?: string;
  type: string;
};

export type PveStorage = {
  storage: string;
  node: string;
  type: string;
  total: number;
  used: number;
  avail: number;
  enabled: boolean;
};

/**
 * Home Proxmox installs almost always use the self-signed certificate the
 * installer generated. Verifying it would mean every home lab has to set up a
 * CA before seeing a dashboard, so verification is opt-in through
 * PROXMOX_VERIFY_TLS — a deliberate trade-off for a LAN-only connection.
 */
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

async function pve<T>(path: string): Promise<T | null> {
  const cfg = proxmox();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/api2/json${path}`, {
      headers: { authorization: `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      // @ts-expect-error — undici's dispatcher option is not in the DOM types.
      dispatcher: cfg.verifyTls ? undefined : insecureAgent,
    });
    if (!res.ok) {
      console.error(`proxmox ${path}: HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    return body.data as T;
  } catch (e) {
    console.error(`proxmox ${path} failed:`, e);
    return null;
  }
}

export async function nodes(): Promise<PveNode[]> {
  return (await pve<PveNode[]>("/nodes")) ?? [];
}

/** Every VM and container in the cluster, with live status. */
export async function guests(): Promise<PveGuest[]> {
  const rows = await pve<Record<string, unknown>[]>("/cluster/resources?type=vm");
  if (!rows) return [];
  return rows.map((r) => ({
    id: String(r.id ?? ""),
    vmid: Number(r.vmid ?? 0),
    name: String(r.name ?? ""),
    type: String(r.type ?? ""),
    node: String(r.node ?? ""),
    status: String(r.status ?? "unknown"),
    uptime: Number(r.uptime ?? 0),
    cpu: Number(r.cpu ?? 0),
    mem: Number(r.mem ?? 0),
    maxmem: Number(r.maxmem ?? 0),
    maxdisk: Number(r.maxdisk ?? 0),
  }));
}

/** Physical disks of one node, including the SMART verdict. */
export async function disks(node: string): Promise<PveDisk[]> {
  const rows = await pve<Record<string, unknown>[]>(`/nodes/${encodeURIComponent(node)}/disks/list`);
  if (!rows) return [];
  return rows.map((r) => ({
    devpath: String(r.devpath ?? ""),
    model: String(r.model ?? ""),
    size: Number(r.size ?? 0),
    health: String(r.health ?? "UNKNOWN"),
    wearout: r.wearout === undefined || r.wearout === "N/A" ? undefined : Number(r.wearout),
    used: r.used ? String(r.used) : undefined,
    type: String(r.type ?? ""),
  }));
}

export async function storages(): Promise<PveStorage[]> {
  const rows = await pve<Record<string, unknown>[]>("/cluster/resources?type=storage");
  if (!rows) return [];
  return rows.map((r) => ({
    storage: String(r.storage ?? ""),
    node: String(r.node ?? ""),
    type: String(r.plugintype ?? r.type ?? ""),
    total: Number(r.maxdisk ?? 0),
    used: Number(r.disk ?? 0),
    avail: Number(r.maxdisk ?? 0) - Number(r.disk ?? 0),
    enabled: r.status === "available",
  }));
}

export async function proxmoxHealth(): Promise<{ ok: boolean; error?: string }> {
  const cfg = proxmox();
  if (!cfg) return { ok: false, error: "not configured" };
  const data = await pve<unknown>("/version");
  return data ? { ok: true } : { ok: false, error: "request failed — see server logs" };
}

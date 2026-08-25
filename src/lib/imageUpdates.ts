import "server-only";
import { listContainers } from "./docker";
import { getSetting, setSetting } from "./db";
import { notify } from "./notify";
import { resolvedDockerHosts } from "./integrations";

/**
 * Is a newer image available for a running container?
 *
 * The container inspect gives the config digest of the image it is running
 * (`ImageID`). A registry's manifest for the same tag carries that same config
 * digest inside it. If they differ, the tag has moved on since this container
 * was created — an update is waiting behind a `pull` and a recreate.
 *
 * This is the one thing in the panel that reaches the public internet on
 * purpose, and it is manual and best-effort: anything it cannot determine — a
 * private registry, no route out, a digest-pinned image, an odd manifest — is
 * reported as "unknown" rather than guessed. It never throws.
 *
 * Multi-arch is handled by comparing against every common platform's config
 * digest, so a match on the host's own architecture (x86 or a Pi's arm64) reads
 * as current rather than a false "update".
 */

export type UpdateStatus = "update" | "current" | "unknown";

const ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

const PLATFORMS = [
  { architecture: "amd64", os: "linux" },
  { architecture: "arm64", os: "linux" },
  { architecture: "arm", os: "linux" },
];

export async function imageUpdate(image: string, imageId?: string): Promise<UpdateStatus> {
  if (!imageId || !imageId.startsWith("sha256:")) return "unknown";
  const ref = parseImage(image);
  if (!ref) return "unknown";

  try {
    const top = await manifest(ref.registry, ref.repo, ref.tag);
    if (!top) return "unknown";

    // A single-arch manifest: compare its own config digest.
    if (top.config?.digest) return top.config.digest === imageId ? "current" : "update";

    // A manifest list / OCI index: gather the platforms we care about and read
    // each one's config digest.
    if (Array.isArray(top.manifests)) {
      const wanted = top.manifests.filter((m: RawEntry) =>
        PLATFORMS.some((p) => p.architecture === m.platform?.architecture && p.os === m.platform?.os)
      );
      const list = wanted.length > 0 ? wanted : top.manifests.slice(0, 1);
      const digests = await Promise.all(
        list.map(async (m: RawEntry) => (m.digest ? (await manifest(ref.registry, ref.repo, m.digest))?.config?.digest : undefined))
      );
      const configs = digests.filter(Boolean) as string[];
      if (configs.length === 0) return "unknown";
      return configs.includes(imageId) ? "current" : "update";
    }

    return "unknown";
  } catch {
    return "unknown";
  }
}

type RawEntry = { digest?: string; platform?: { architecture?: string; os?: string } };
type Manifest = { config?: { digest?: string }; manifests?: RawEntry[] };

async function manifest(registry: string, repo: string, ref: string): Promise<Manifest | null> {
  const url = `https://${registry}/v2/${repo}/manifests/${ref}`;
  let res = await fetch(url, { headers: { accept: ACCEPT }, signal: AbortSignal.timeout(8000) });

  if (res.status === 401) {
    const token = await bearer(res.headers.get("www-authenticate"));
    if (!token) return null;
    res = await fetch(url, {
      headers: { accept: ACCEPT, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
  }
  if (!res.ok) return null;
  return (await res.json()) as Manifest;
}

/** Follow the registry's Www-Authenticate challenge to a pull token. */
async function bearer(wwwAuth: string | null): Promise<string | null> {
  if (!wwwAuth) return null;
  const m = /Bearer\s+(.+)/i.exec(wwwAuth);
  if (!m) return null;
  const params: Record<string, string> = {};
  for (const p of m[1].matchAll(/(\w+)="([^"]*)"/g)) params[p[1]] = p[2];
  if (!params.realm) return null;

  const u = new URL(params.realm);
  if (params.service) u.searchParams.set("service", params.service);
  if (params.scope) u.searchParams.set("scope", params.scope);

  const res = await fetch(u.toString(), { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const j = (await res.json()) as { token?: string; access_token?: string };
  return j.token ?? j.access_token ?? null;
}

/** "ghcr.io/user/app:tag" → { registry, repo, tag }, with Docker Hub defaults. */
function parseImage(image: string): { registry: string; repo: string; tag: string } | null {
  if (!image) return null;

  // A digest-pinned image with no tag cannot be compared against a moving tag.
  const at = image.indexOf("@");
  let rest = at === -1 ? image : image.slice(0, at);

  let tag = "latest";
  const slash = rest.lastIndexOf("/");
  const colon = rest.lastIndexOf(":");
  if (colon > slash) {
    tag = rest.slice(colon + 1);
    rest = rest.slice(0, colon);
  } else if (at !== -1) {
    return null; // digest only, no tag
  }

  let registry = "registry-1.docker.io";
  let repo = rest;
  const firstSlash = rest.indexOf("/");
  if (firstSlash !== -1) {
    const first = rest.slice(0, firstSlash);
    if (first.includes(".") || first.includes(":") || first === "localhost") {
      registry = first === "docker.io" ? "registry-1.docker.io" : first;
      repo = rest.slice(firstSlash + 1);
    }
  }
  // Official Docker Hub images live under library/.
  if (registry === "registry-1.docker.io" && !repo.includes("/")) repo = `library/${repo}`;

  return { registry, repo, tag };
}

// ─────────────────────── Persisted, automatic scan ───────────────────────

const SCAN_KEY = "images.updates";
export type UpdateScan = { at: number; results: { name: string; status: UpdateStatus }[] };

export async function storedUpdates(): Promise<UpdateScan | null> {
  return getSetting<UpdateScan | null>(SCAN_KEY, null);
}

/**
 * Check every running container against its registry, remember the result, and
 * announce anything newly updatable. One lookup per distinct image+digest, so
 * twenty containers off one image cost one call; capped so a busy host does not
 * fan out into a hundred registry requests.
 */
export async function scanContainerUpdates(): Promise<UpdateScan> {
  const running = (await listContainers()).filter((c) => c.state === "running");

  const byImage = new Map<string, { image: string; imageId?: string }>();
  for (const c of running) byImage.set(`${c.image}|${c.imageId ?? ""}`, { image: c.image, imageId: c.imageId });

  const statuses = new Map<string, UpdateStatus>();
  await Promise.all(
    [...byImage.entries()].slice(0, 60).map(async ([key, { image, imageId }]) => {
      statuses.set(key, await imageUpdate(image, imageId));
    })
  );
  const results = running.map((c) => ({ name: c.name, status: statuses.get(`${c.image}|${c.imageId ?? ""}`) ?? ("unknown" as UpdateStatus) }));

  // Tell the household once about each image that has newly become updatable.
  const prev = await storedUpdates();
  const wasUpdating = new Set((prev?.results ?? []).filter((r) => r.status === "update").map((r) => r.name));
  const fresh = results.filter((r) => r.status === "update" && !wasUpdating.has(r.name)).map((r) => r.name);

  const scan: UpdateScan = { at: Date.now(), results };
  await setSetting(SCAN_KEY, scan);
  if (fresh.length > 0) {
    await notify({ type: "system", severity: "info", title: "⬆️ Доступны обновления образов", body: fresh.slice(0, 12).join(", ") });
  }
  return scan;
}

let lastScan = 0;

/** Run a scan at most once a day, from the monitor tick. */
export async function checkContainerUpdatesDue(): Promise<void> {
  if (Date.now() - lastScan < 24 * 3_600_000) return;
  if ((await resolvedDockerHosts()).length === 0) return;
  lastScan = Date.now();
  await scanContainerUpdates();
}

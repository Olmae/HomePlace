/**
 * Guessing an icon so nobody has to paste a URL.
 *
 * Three sources, in order of how much they actually know:
 *   1. the container's own homeplace.icon label — an explicit answer;
 *   2. a name match against services people actually self-host;
 *   3. the site's favicon, which every web service already publishes.
 *
 * The result is only ever a default. It fills the field in the add dialog,
 * where it can be replaced by anything, rather than being applied invisibly.
 *
 * Runs on the client as well as the server, so no server-only import here.
 */

/**
 * Known services, matched as substrings against the container image, the
 * container name and the host part of the URL.
 *
 * Ordered longest-first at match time, so "qbittorrent" is not shadowed by
 * "torrent" and "jellyseerr" is not swallowed by "jellyfin".
 */
const KNOWN: Record<string, string> = {
  jellyfin: "🎬",
  jellyseerr: "🎟️",
  plex: "🎞️",
  emby: "🎥",
  sonarr: "📺",
  radarr: "🍿",
  lidarr: "🎵",
  readarr: "📚",
  bazarr: "💬",
  prowlarr: "🔎",
  overseerr: "🎟️",
  qbittorrent: "🌀",
  transmission: "🔄",
  deluge: "💧",
  sabnzbd: "📦",
  nzbget: "📦",
  nextcloud: "☁️",
  owncloud: "☁️",
  syncthing: "🔁",
  immich: "🖼️",
  photoprism: "🖼️",
  paperless: "📄",
  calibre: "📖",
  audiobookshelf: "🎧",
  navidrome: "🎶",
  grafana: "📈",
  prometheus: "🔥",
  influxdb: "📊",
  loki: "🪵",
  uptime: "⏱️",
  portainer: "🐳",
  docker: "🐳",
  traefik: "🚦",
  nginx: "🌐",
  caddy: "🧱",
  proxy: "🔀",
  pihole: "🛡️",
  adguard: "🛡️",
  wireguard: "🔐",
  vaultwarden: "🔑",
  bitwarden: "🔑",
  authelia: "🪪",
  authentik: "🪪",
  keycloak: "🪪",
  homeassistant: "🏠",
  "home-assistant": "🏠",
  hass: "🏠",
  nodered: "🔴",
  "node-red": "🔴",
  zigbee: "📡",
  mqtt: "📨",
  mosquitto: "📨",
  esphome: "🔌",
  frigate: "📹",
  zoneminder: "📹",
  minecraft: "⛏️",
  pterodactyl: "🎮",
  steam: "🎮",
  gitea: "🌿",
  gitlab: "🦊",
  github: "🐙",
  jenkins: "🔨",
  drone: "🚁",
  postgres: "🐘",
  mysql: "🐬",
  mariadb: "🐬",
  mongo: "🍃",
  redis: "🧠",
  sqlite: "🗃️",
  elastic: "🔍",
  rabbitmq: "🐇",
  minio: "🪣",
  vault: "🔒",
  backup: "💾",
  duplicati: "💾",
  restic: "💾",
  pbs: "💾",
  proxmox: "🖥️",
  truenas: "🗄️",
  unraid: "🗄️",
  samba: "📁",
  nfs: "📁",
  ftp: "📁",
  mail: "✉️",
  roundcube: "✉️",
  telegram: "✈️",
  matrix: "💠",
  synapse: "💠",
  discord: "💬",
  wiki: "📗",
  bookstack: "📗",
  outline: "📗",
  ghost: "👻",
  wordpress: "📝",
  vikunja: "✅",
  focalboard: "✅",
  planka: "✅",
  firefly: "💰",
  actual: "💰",
  speedtest: "🚀",
  dashboard: "🧭",
  homepage: "🧭",
  homeplace: "🏡",
  friendplace: "👥",
  music: "🎵",
  camera: "📷",
  printer: "🖨️",
  octoprint: "🖨️",
  vpn: "🔐",
  xray: "🛰️",
  router: "📶",
  api: "🔌",
};

/**
 * Best guess for a tile icon.
 *
 * Longest key first: several keys can match one string, and the most specific
 * one is almost always the right answer.
 */
export function guessIcon(input: { name?: string; image?: string; url?: string }): string {
  const haystack = [input.name, input.image, hostOf(input.url)].filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return "";

  const hit = Object.keys(KNOWN)
    .sort((a, b) => b.length - a.length)
    .find((key) => haystack.includes(key));
  return hit ? KNOWN[hit] : "";
}

/**
 * The site's own favicon.
 *
 * Loaded straight from the service by the browser, not proxied through the
 * panel: the browser is already on the same network, and proxying would turn
 * HomePlace into a fetcher of arbitrary URLs on behalf of whoever can add a
 * tile. When it 404s, the tile falls back to the first letter (see TileIcon).
 */
export function faviconUrl(url: string | null | undefined): string {
  const host = originOf(url);
  return host ? `${host}/favicon.ico` : "";
}

/** An icon for a tile that has no explicit one: known service, else favicon. */
export function autoIcon(input: { name?: string; image?: string; url?: string }): string {
  return guessIcon(input) || faviconUrl(input.url);
}

function hostOf(url: string | null | undefined): string {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}

function originOf(url: string | null | undefined): string {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

/**
 * Glyphs for things that are not services.
 *
 * Kept next to the service icons so every symbol in the interface has one
 * source, rather than emoji scattered through the components.
 */
export const GLYPH = {
  folder: "📁",
  link: "🔗",
  widget: "🧩",
  container: "🐳",
  dashboard: "🧭",
  monitoring: "📈",
  events: "🔔",
  settings: "⚙️",
  search: "🔍",
  host: "🖥️",
  disk: "💽",
  cpu: "⚡",
  memory: "🧠",
  network: "📶",
  temperature: "🌡️",
  up: "🟢",
  down: "🔴",
  logs: "🪵",
  restart: "🔁",
  start: "▶️",
  stop: "⏹️",
  open: "↗",
  details: "›",
} as const;

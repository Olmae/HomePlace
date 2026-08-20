/**
 * Category icons for container groups.
 *
 * A group of containers is almost always one kind of thing — a media stack, the
 * download box, the reverse proxy — and a line icon for that kind reads faster
 * than the group's name. The category is guessed from the names and images of
 * the containers in the group, so a stack called anything at all still gets the
 * right mark, and a hand-set emoji always wins over the guess.
 *
 * One family: `currentColor`, a 1.6 stroke on a 24-unit grid.
 */
export type GroupCategory =
  | "media"
  | "download"
  | "storage"
  | "database"
  | "network"
  | "security"
  | "automation"
  | "monitoring"
  | "generic";

const KEYWORDS: [GroupCategory, RegExp][] = [
  ["media", /jellyfin|plex|emby|sonarr|radarr|lidarr|bazarr|prowlarr|navidrome|audiobook|tautulli|media|kodi|tv/],
  ["download", /qbit|transmission|deluge|torrent|sabnzbd|nzbget|nzb|aria2|download|jdownload/],
  ["storage", /nextcloud|owncloud|syncthing|samba|smb|minio|seafile|immich|photoprism|paperless|files?|backup|storage/],
  ["database", /postgres|mysql|mariadb|redis|mongo|influx|clickhouse|couch|elastic|\bdb\b/],
  ["network", /nginx|traefik|caddy|proxy|swag|pihole|adguard|unbound|dns|wireguard|\bvpn\b|xray|cloudflared|npm/],
  ["security", /vaultwarden|bitwarden|authelia|authentik|keycloak|\bauth\b|oauth|crowdsec/],
  ["automation", /home.?assistant|hass|node.?red|mqtt|mosquitto|zigbee|z2m|esphome|frigate|automation/],
  ["monitoring", /grafana|prometheus|loki|uptime|netdata|glances|scrutiny|monitor/],
];

/** Guess the category from every scrap of text the group carries. */
export function categoryFor(text: string): GroupCategory {
  const h = text.toLowerCase();
  for (const [category, re] of KEYWORDS) if (re.test(h)) return category;
  return "generic";
}

export function GroupCategoryIcon({ category, className }: { category: GroupCategory; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      {SHAPES[category]}
    </svg>
  );
}

const SHAPES: Record<GroupCategory, JSX.Element> = {
  media: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v11" />
      <path d="M8 10l4 4 4-4" />
      <path d="M5 20h14" />
    </>
  ),
  storage: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v13c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-13" />
      <path d="M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8" />
    </>
  ),
  network: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="5" cy="5" r="2" />
      <circle cx="19" cy="5" r="2" />
      <circle cx="5" cy="19" r="2" />
      <circle cx="19" cy="19" r="2" />
      <path d="M6.5 6.5 10 10M17.5 6.5 14 10M6.5 17.5 10 14M17.5 17.5 14 14" />
    </>
  ),
  security: (
    <>
      <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z" />
      <path d="M9.5 12l2 2 3.5-4" />
    </>
  ),
  automation: (
    <>
      <path d="M4 11l8-7 8 7" />
      <path d="M6.5 9.5V20h11V9.5" />
      <circle cx="12" cy="14" r="2" />
    </>
  ),
  monitoring: (
    <>
      <path d="M3 20h18" />
      <path d="M4 14l4-5 4 4 4-7 4 5" />
    </>
  ),
  generic: (
    <>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </>
  ),
};

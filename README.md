# HomePlace

**HomePlace is the hub of the Places ecosystem — a self-hosted dashboard and
monitoring panel for your home server.**

One page to open in the morning: every service you run, whether it is up, how
the machine is doing, and one click to get anywhere. Containers appear on their
own; you decide which ones become tiles.

- 🧩 **Auto-discovery** — containers on your Docker host show up by themselves,
  one click puts one on the dashboard
- 🟢 **Status at a glance** — availability checks with uptime history, kept by
  HomePlace itself so it works with nothing else installed
- 📊 **Hardware** — CPU, memory, disks, temperatures, network, from Prometheus
- 🖥 **Proxmox** — guests, physical disks and SMART, storages
- 🗂 **Your layout** — tabs, folders, bookmarks, widgets, custom PromQL charts
- 🌗 **Light and dark**, five accents, **English and Russian**
- 🔐 **Local accounts**, with optional single sign-on through FriendPlace

Everything host-specific lives in `.env`. Nothing about your server is in this
repository.

---

## Quick start

```bash
git clone https://github.com/Olmae/HomePlace.git
cd HomePlace
cp .env.example .env
docker compose up -d --build
```

Open <http://localhost:3200> and the setup wizard asks you to create the owner
account. That wizard is reachable only while the panel has no accounts at all —
once the owner exists it closes for good.

For anything beyond the defaults, read `.env.example`: it documents every
setting, and each integration is optional.

---

## How it fits together

```
                         ┌────────────────────┐
   browser ──────────────│     HomePlace      │
                         │  Next.js + SQLite  │
                         └─────────┬──────────┘
              ┌────────────────────┼─────────────────────┐
              │                    │                     │
     docker-socket-proxy      Prometheus              Proxmox API
     containers, control      metrics & history       guests, disks, SMART
              │
      /var/run/docker.sock (read-only, never exposed to the app)
```

HomePlace stores what you arranged — accounts, tabs, tiles, widget settings —
plus a rolling window of its own availability checks. It deliberately does not
store metric history: Prometheus already does that better, and pointing
`PROMETHEUS_URL` at an existing one is less work than maintaining a second
time-series database.

### Why a socket proxy

Anything that can write to `/var/run/docker.sock` can start a privileged
container and own the host. Mounting it into a web application hands that power
to every bug in the application. The bundled `docker-socket-proxy` allowlists
only what the panel uses — listing containers, reading logs, and start/stop/
restart — and refuses everything else, including `exec`.

If you want a strictly read-only panel, set `ALLOW_CONTAINER_CONTROL=false`.
The refusal happens in the server, not in the interface, so it holds regardless
of who signs in.

### Container labels

A container can describe how it wants to appear, so an existing compose file
needs no changes elsewhere:

```yaml
labels:
  homeplace.title: "Jellyfin"
  homeplace.icon: "🎬"
  homeplace.group: "Media"
  homeplace.url: "https://media.example.com"
  homeplace.hide: "false"
```

---

## Authentication

Local login and password is the primary way in, and it always works.

**FriendPlace SSO is optional.** [FriendPlace](https://github.com/Olmae/FriendPlace)
can act as an OAuth 2.0 provider; if you run one, set `FRIENDPLACE_URL` and the
client credentials and a "Sign in with FriendPlace" button appears. With those
variables empty the integration does not exist as far as the login page is
concerned — which is the expected state for most people cloning this project.

With `FRIENDPLACE_ADMINS_ONLY=true` (the default) only administrators there may
enter. If that FriendPlace does not report administrator status, everyone is
refused rather than quietly let in.

Roles: **owner** (created by the wizard, cannot be locked out), **admin** (edits
the dashboard, controls containers), **viewer** (reads).

Forgot the password? `make admin-reset LOGIN=me PASSWORD=…` — it runs inside the
container, where the database already is.

---

## Configuration

Full reference with comments: [`.env.example`](.env.example). In short:

| Variable | What it does |
|---|---|
| `APP_URL` | Public address; used for OAuth redirects and cookie security |
| `AUTH_SECRET` | Session signing key — `make secret` generates one |
| `HOST_DATA_DIR` | Where the SQLite database lives on the host |
| `DOCKER_API_URL` / `DOCKER_HOSTS` | Docker endpoint, or several |
| `ALLOW_CONTAINER_CONTROL` | `false` makes the panel read-only |
| `PROMETHEUS_URL` | Enables hardware metrics and charts |
| `PROXMOX_URL` + token | Enables the hypervisor view |
| `FRIENDPLACE_*` | Optional SSO |
| `DEFAULT_LOCALE` | `en` or `ru` |

### What each integration adds

| Missing | Still works | You lose |
|---|---|---|
| Prometheus | Everything else | Charts, CPU/RAM/disk/temperature widgets |
| Docker | Everything else | Auto-discovery, container control, container-state checks |
| Proxmox | Everything else | Guests, physical disks, SMART |
| FriendPlace | Everything else | The SSO button |

---

## Development

Node 20 or newer.

```bash
npm install
cp .env.example .env          # DATABASE_URL defaults to ./data/homeplace.db
npx prisma db push
npm run dev                   # http://localhost:3200
```

```
src/
  app/            routes — (app) is everything behind the login
  actions/        server actions: the only place that writes
  components/     interface, widgets/ holds the dashboard cards
  lib/            integrations: docker, prometheus, proxmox, friendplace
  i18n/           en.ts is the base dictionary; other locales are checked against it
prisma/schema.prisma
```

A few conventions worth knowing before changing things:

- **No literal colours.** Everything goes through a CSS variable in
  `globals.css`, which is what makes light/dark and the accents work.
- **The dictionary is type-checked.** Add a key to `en.ts` and TypeScript will
  point at every other locale until it is translated.
- **Integrations degrade, they do not throw.** A Prometheus that stops answering
  turns one card into "no data" instead of taking the page down.
- **Secrets only in `.env`.** Not in the database, not in the interface, never
  in git.

---

## Roadmap

Where this is going, roughly in order.

### Next

- [ ] Drag-and-drop layout, resize by dragging the tile edge
- [ ] More widget kinds: multi-series charts, gauges, an uptime strip per service
- [ ] Container detail view: live logs, resource usage over time, inspect
- [ ] Search across services and containers, keyboard-first navigation
- [ ] Custom icon set, an icon picker instead of pasting URLs
- [ ] Per-user dashboards alongside the shared ones

### Alerts and notifications

- [ ] Rules on top of the checks: "notify me when this is down for 5 minutes"
- [ ] Delivery through Telegram, email, ntfy, webhooks
- [ ] Quiet hours, grouping, escalation
- [ ] Web push in the browser

### Service integrations

- [ ] **Home Assistant** — entities, quick toggles, scenes
- [ ] **qBittorrent** — active torrents, speeds, control
- [ ] **Jellyfin** — what is playing, library size, transcodes
- [ ] ***arr stack** — queue, upcoming, health
- [ ] **Proxmox Backup Server** — last backup, datastore usage, failures
- [ ] **Weather** and a calendar widget for the home-page feel
- [ ] **Uptime Kuma** import, for people migrating

### Automation

- [ ] Scenarios: on an event, do a thing (restart a container, send a message)
- [ ] Scheduled actions
- [ ] A read-only public status page for the services you choose

### Apps

- [ ] Android and iOS clients, sharing this API
- [ ] Push notifications on the phone
- [ ] Home-screen widgets

### Housekeeping

- [ ] Import and export of the whole configuration as one file
- [ ] Multi-host Docker in the interface rather than only in `.env`
- [ ] Optional longer metric retention for installations without Prometheus
- [ ] A test suite worth the name

---

## The Places ecosystem

- **[FriendPlace](https://github.com/Olmae/FriendPlace)** — a private site for a
  group of friends; also the identity provider
- **HomePlace** — this: the hub, and the panel for the server it all runs on

## License

[Apache-2.0](LICENSE)

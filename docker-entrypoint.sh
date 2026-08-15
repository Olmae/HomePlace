#!/bin/sh
set -e

# Where the database lives inside the container. The host side is a bind mount
# chosen in .env (HOST_DATA_DIR) — see docker-compose.yml.
DATA_DIR="${DATA_DIR:-/data}"
export DATABASE_URL="${DATABASE_URL:-file:${DATA_DIR}/homeplace.db}"

# A bind-mounted directory arrives owned by whoever created it on the host,
# which is almost never the container's user. Rather than demanding the operator
# get the ownership right before the first start, take the ids from PUID/PGID
# (default 1000 — the first human account on most Linux systems) and adjust.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

mkdir -p "$DATA_DIR"
chown -R "$PUID:$PGID" "$DATA_DIR" 2>/dev/null || true

# The schema is applied on every start rather than through a migration history.
# For a single-file SQLite database owned by one application this is the honest
# trade: `db push` is idempotent, and there is no fleet of environments whose
# schema versions could drift apart.
#
# Not piped anywhere: in a pipeline the shell reports the *last* command's exit
# status, so a failing db push would look like success and the panel would come
# up on a database in an unknown state.
echo "→ applying database schema"
if ! su-exec "$PUID:$PGID" node node_modules/prisma/build/index.js db push --skip-generate; then
  echo "✖ could not apply the schema — refusing to start on a database in an unknown state"
  exit 1
fi

echo "→ starting HomePlace on port ${PORT:-3200}"
exec su-exec "$PUID:$PGID" "$@"

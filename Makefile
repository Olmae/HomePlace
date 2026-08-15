# HomePlace — server commands.
# Usage: make deploy / make logs / make backup ...

COMPOSE := docker compose

.PHONY: help deploy update pull build up down restart logs ps backup shell prune admin-reset secret

help:
	@echo "HomePlace:"
	@echo "  make deploy       — pull, rebuild, restart"
	@echo "  make up           — start"
	@echo "  make down         — stop"
	@echo "  make restart      — restart"
	@echo "  make logs         — follow logs"
	@echo "  make ps           — status"
	@echo "  make backup       — copy the database into ./backups"
	@echo "  make shell        — shell inside the container"
	@echo "  make secret       — generate a value for AUTH_SECRET"
	@echo "  make admin-reset  — reset a password: make admin-reset LOGIN=me PASSWORD=…"

deploy: backup pull build up prune
	@echo "✅ done — follow with: make logs"

update: deploy

pull:
	git pull --rebase --autostash

build:
	$(COMPOSE) build

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f --tail=100

ps:
	$(COMPOSE) ps

prune:
	-docker image prune -f

shell:
	$(COMPOSE) exec app sh

secret:
	@openssl rand -hex 32

# Password recovery. Runs inside the container, where the database lives.
admin-reset:
	@test -n "$(LOGIN)" -a -n "$(PASSWORD)" || { echo "usage: make admin-reset LOGIN=me PASSWORD=secret123"; exit 1; }
	$(COMPOSE) exec app node scripts/admin-reset.mjs "$(LOGIN)" "$(PASSWORD)"

# Database backup. Paths come from .env so the copy lands where the rest of the
# deployment expects it, not in a third place nobody knows about.
backup:
	@set -a; [ -f .env ] && . ./.env; set +a; \
	db="$${HOST_DATA_DIR:-./data}/homeplace.db"; \
	dir="$${HOST_BACKUP_DIR:-./backups}"; \
	mkdir -p "$$dir"; \
	if [ -f "$$db" ]; then \
		dest="$$dir/homeplace-$$(date +%Y%m%d-%H%M%S).db"; \
		if command -v sqlite3 >/dev/null 2>&1; then \
			sqlite3 "$$db" "VACUUM INTO '$$dest'"; \
		else \
			cp "$$db" "$$dest"; \
			echo "⚠️  sqlite3 not found — plain cp used, which can be inconsistent on a live database"; \
		fi; \
		echo "💾 backup: $$dest"; \
		ls -1t "$$dir"/*.db 2>/dev/null | tail -n +15 | xargs -r rm --; \
	else \
		echo "ℹ️  no database yet ($$db) — nothing to back up"; \
	fi

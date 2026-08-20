"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Button } from "@/components/form";
import { makeBackup, getBackups, removeBackup, restoreFromBackup } from "@/actions/backup";
import { bytes } from "@/lib/format";
import type { Dictionary } from "@/i18n";

type Info = { name: string; size: number; at: number };

/**
 * Database snapshots, from the settings page.
 *
 * The whole panel is one SQLite file, so this is its backup: make one, download
 * it, put one back. Restore is deliberately loud — it overwrites the live
 * database, which only takes effect after the container is restarted, so it
 * confirms first and says so afterwards.
 */
export function BackupCard({ d, initial }: { d: Dictionary; initial: Info[] }) {
  const [list, setList] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function backup() {
    setMsg(null);
    startTransition(async () => {
      const r = await makeBackup();
      if (!r.ok) setMsg(r.error ?? d.common.error);
      setList(await getBackups());
    });
  }

  function del(name: string) {
    startTransition(async () => {
      await removeBackup(name);
      setList(await getBackups());
    });
  }

  function restore(name: string) {
    if (!confirm(d.settings.restoreConfirm)) return;
    setMsg(null);
    startTransition(async () => {
      const r = await restoreFromBackup(name);
      setMsg(r.ok ? d.settings.restoreDone : r.error ?? d.common.error);
    });
  }

  return (
    <Card>
      <CardHeader
        title={d.settings.backups}
        action={
          <Button size="sm" variant="primary" disabled={pending} onClick={backup}>
            {d.settings.createBackup}
          </Button>
        }
      />
      <div className="space-y-2 p-4">
        <p className="text-xs text-muted">{d.settings.backupsHint}</p>
        {msg && <p className="text-xs text-warn">{msg}</p>}

        {list.length === 0 ? (
          <p className="text-sm text-muted">{d.common.none}</p>
        ) : (
          <ul className="divide-y divide-line rounded-control border border-line">
            {list.map((b) => (
              <li key={b.name} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{b.name}</p>
                  <p className="text-[11px] text-faint">
                    {new Date(b.at).toLocaleString()} · {bytes(b.size)}
                  </p>
                </div>
                <a
                  href={`/api/backups/${encodeURIComponent(b.name)}`}
                  className="rounded-control border border-line px-2 py-1 text-xs text-muted transition-colors hover:bg-raised hover:text-text"
                >
                  {d.settings.download}
                </a>
                <Button size="sm" variant="quiet" disabled={pending} onClick={() => restore(b.name)}>
                  {d.settings.restore}
                </Button>
                <Button size="sm" variant="quiet" disabled={pending} onClick={() => del(b.name)} title={d.common.delete}>
                  ✕
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

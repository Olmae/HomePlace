import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./db";

/**
 * Snapshots of the SQLite database.
 *
 * The whole panel — dashboards, settings, uptime history, reminders — is one
 * SQLite file, so a backup is a copy of it and a restore is putting a copy
 * back. Before each snapshot the write-ahead log is checkpointed into the main
 * file, so the copy is a consistent point in time rather than "the file minus
 * whatever was still in the WAL".
 *
 * Backups live next to the database, in a `backups/` folder, and never leave the
 * host unless the operator downloads one.
 */

export type BackupInfo = { name: string; size: number; at: number };

function dbPath(): string {
  const url = process.env.DATABASE_URL ?? "";
  const p = url.startsWith("file:") ? url.slice("file:".length) : url;
  return path.resolve(p);
}

function backupsDir(): string {
  return path.join(path.dirname(dbPath()), "backups");
}

const SAFE = /^[A-Za-z0-9._-]+\.db$/;

export async function createBackup(): Promise<{ ok: boolean; name?: string; error?: string }> {
  try {
    const db = dbPath();
    const dir = backupsDir();
    await fs.mkdir(dir, { recursive: true });
    // Flush the WAL into the main file so the copy is a complete moment.
    await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)").catch(() => {});
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `homeplace-${stamp}.db`;
    await fs.copyFile(db, path.join(dir, name));
    return { ok: true, name };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function listBackups(): Promise<BackupInfo[]> {
  try {
    const dir = backupsDir();
    const files = (await fs.readdir(dir)).filter((f) => SAFE.test(f));
    const infos = await Promise.all(
      files.map(async (name) => {
        const st = await fs.stat(path.join(dir, name));
        return { name, size: st.size, at: st.mtimeMs };
      })
    );
    return infos.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function deleteBackup(name: string): Promise<boolean> {
  if (!SAFE.test(name)) return false;
  try {
    await fs.unlink(path.join(backupsDir(), name));
    return true;
  } catch {
    return false;
  }
}

/**
 * Put a snapshot back. The running process keeps the old file open, so this
 * takes effect only after a restart — the caller says so.
 */
export async function restoreBackup(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!SAFE.test(name)) return { ok: false, error: "bad name" };
  try {
    const db = dbPath();
    const src = path.join(backupsDir(), name);
    await fs.access(src);
    await fs.copyFile(src, db);
    // Drop any stale WAL/SHM so SQLite reads the restored file cleanly.
    await fs.rm(`${db}-wal`, { force: true });
    await fs.rm(`${db}-shm`, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Absolute path of one backup, for the download route. Null if the name is unsafe. */
export function backupFile(name: string): string | null {
  if (!SAFE.test(name)) return null;
  return path.join(backupsDir(), name);
}

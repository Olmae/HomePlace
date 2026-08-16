"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/form";
import { moveIntoFolder } from "@/actions/dashboard";
import type { Dictionary } from "@/i18n";

/**
 * A folder, opened.
 *
 * The tiles inside are rendered on the server exactly as they are on the board
 * and handed in as children — so a widget filed into a folder is still a live
 * widget, a service still shows its status, and a container still has its
 * arrow. Filing something away must not quietly demote it to a bookmark.
 *
 * The only thing this component adds is the way back out.
 */
export function FolderContents({
  d,
  title,
  icon,
  count,
  canEdit,
  items,
  children,
}: {
  d: Dictionary;
  title: string;
  icon: string;
  count: number;
  canEdit: boolean;
  /** One entry per child, in the same order as `children`. */
  items: { id: string; title: string; w: number }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const childArray = Array.isArray(children) ? children : [children];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={d.dashboard.openFolder}
        aria-label={d.dashboard.openFolder}
        className="rounded-control px-1.5 py-0.5 text-xs text-faint transition-colors hover:bg-raised hover:text-text"
      >
        {count} ▸
      </button>

      {open && (
        <Dialog open onClose={() => setOpen(false)} title={`${icon} ${title}`} wide>
          <div className="flex flex-col gap-3">
            {count === 0 && <p className="text-sm text-muted">{d.dashboard.folderEmpty}</p>}

            {/* The same twelve-column grid as the board, so a tile that is four
                wide out there looks the same in here. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="relative sm:col-span-6"
                  style={{ gridColumn: undefined }}
                >
                  {canEdit && (
                    <button
                      type="button"
                      title={d.dashboard.takeOut}
                      aria-label={`${item.title} — ${d.dashboard.takeOut}`}
                      disabled={pending}
                      onClick={() => startTransition(() => void moveIntoFolder(item.id, null))}
                      className="absolute right-1.5 top-1.5 z-20 rounded-control border border-line bg-surface/95 px-1.5 py-0.5 text-xs text-muted shadow-card transition-colors hover:text-text"
                    >
                      ↥
                    </button>
                  )}
                  {childArray[i]}
                </div>
              ))}
            </div>

            {canEdit && <p className="text-xs text-faint">{d.dashboard.folderHint}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}

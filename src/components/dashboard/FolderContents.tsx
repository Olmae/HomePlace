"use client";

import { useState, useTransition } from "react";
import type { Item } from "@prisma/client";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/form";
import { TileIcon } from "@/components/TileIcon";
import { moveIntoFolder } from "@/actions/dashboard";
import { autoIcon, guessIcon, GLYPH } from "@/lib/icons";
import type { Dictionary } from "@/i18n";

/**
 * What is inside a folder, and how to get it back out.
 *
 * Filing a tile away is a drag onto the folder; taking it out needs a place to
 * click, and the tile is no longer on the board to click on. Hence this list —
 * it is the only way back, so it exists whether or not the layout is being
 * edited.
 */
export function FolderContents({
  d,
  folder,
  children,
  canEdit,
  iconPack,
}: {
  d: Dictionary;
  folder: Item;
  children: Item[];
  canEdit: boolean;
  iconPack: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={d.dashboard.openFolder}
        className="rounded-control px-1.5 py-0.5 text-xs text-faint transition-colors hover:bg-raised hover:text-text"
      >
        {children.length} ▸
      </button>

      {open && (
        <Dialog open onClose={() => setOpen(false)} title={`${folder.icon || GLYPH.folder} ${folder.title}`}>
          <div className="flex flex-col gap-3">
            {children.length === 0 && (
              <p className="text-sm text-muted">{d.dashboard.folderEmpty}</p>
            )}

            <ul className="divide-y divide-line">
              {children.map((child) => (
                <li key={child.id} className="flex items-center gap-2 py-2">
                  <TileIcon
                    icon={child.icon || autoIcon({ name: child.title, url: child.url ?? "", pack: iconPack })}
                    title={child.title}
                    size="sm"
                    fallback={guessIcon({ name: child.title, url: child.url ?? "" })}
                  />
                  <a
                    href={child.url ?? "#"}
                    target={child.newTab ? "_blank" : undefined}
                    rel={child.newTab ? "noreferrer" : undefined}
                    className="min-w-0 flex-1 truncate text-sm hover:text-accent"
                  >
                    {child.title}
                  </a>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="quiet"
                      disabled={pending}
                      title={d.dashboard.takeOut}
                      onClick={() => startTransition(() => void moveIntoFolder(child.id, null))}
                    >
                      ↥
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            {canEdit && <p className="text-xs text-faint">{d.dashboard.folderHint}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}

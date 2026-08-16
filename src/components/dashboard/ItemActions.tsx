"use client";

import { useState, useTransition } from "react";
import type { Item } from "@prisma/client";
import { deleteItem, toggleLock } from "@/actions/dashboard";
import { ItemDialog } from "./ItemDialog";
import type { Dictionary } from "@/i18n";

/**
 * Edit and delete, shown on a tile in edit mode.
 *
 * `pointer-events-auto` matters: in edit mode the whole tile is covered by a
 * drag surface and its contents are made inert, so these two buttons have to
 * opt back in — otherwise the pencil is there but nothing happens when it is
 * clicked.
 *
 * There are no move arrows any more. Moving a tile is dragging it, and a second
 * way to do the same thing was only in the way.
 */
export function ItemActions({ item, d }: { item: Item; d: Dictionary }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="pointer-events-auto absolute right-1.5 top-1.5 z-20 flex gap-0.5 rounded-control border border-line bg-surface/95 p-0.5 shadow-card">
        <IconButton
          label={item.locked ? d.dashboard.unpin : d.dashboard.pin}
          active={item.locked}
          disabled={pending}
          onClick={() => startTransition(() => void toggleLock(item.id))}
        >
          {item.locked ? "🔒" : "🔓"}
        </IconButton>
        <IconButton label={d.common.edit} disabled={pending} onClick={() => setEditing(true)}>
          ✎
        </IconButton>
        <IconButton
          label={d.common.delete}
          danger
          disabled={pending}
          onClick={() => {
            // A tile can hold a carefully typed address; deleting it by a
            // mis-aimed tap on a phone should not be silent.
            if (!confirm(d.common.confirmDelete)) return;
            startTransition(() => void deleteItem(item.id));
          }}
        >
          ✕
        </IconButton>
      </div>

      {editing && <ItemDialog d={d} mode="edit" item={item} onClose={() => setEditing(false)} />}
    </>
  );
}

function IconButton({
  children,
  label,
  onClick,
  disabled,
  danger,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      // The drag surface is listening on the tile; without stopping the event
      // here, pressing a button would also start a drag.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`h-7 w-7 rounded text-xs transition-colors disabled:opacity-40 ${
        danger
          ? "text-danger hover:bg-danger/10"
          : active
            ? "bg-warn/15 text-warn"
            : "text-muted hover:bg-raised hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

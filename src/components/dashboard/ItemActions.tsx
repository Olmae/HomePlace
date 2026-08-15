"use client";

import { useState, useTransition } from "react";
import type { Item } from "@prisma/client";
import { moveItem, deleteItem } from "@/actions/dashboard";
import { ItemDialog } from "./ItemDialog";
import type { Dictionary } from "@/i18n";

/**
 * The controls that appear on a tile in edit mode.
 *
 * Reordering is two arrows rather than drag-and-drop: it works on a phone, it
 * works from the keyboard, and there is no half-dropped state to recover from
 * if a request fails.
 */
export function ItemActions({ item, d }: { item: Item; d: Dictionary }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="absolute right-1.5 top-1.5 z-10 flex gap-0.5 rounded-control border border-line bg-surface/95 p-0.5 shadow-card">
        <IconButton label={d.dashboard.moveUp} disabled={pending} onClick={() => startTransition(() => void moveItem(item.id, "up"))}>
          ↑
        </IconButton>
        <IconButton label={d.dashboard.moveDown} disabled={pending} onClick={() => startTransition(() => void moveItem(item.id, "down"))}>
          ↓
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
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`h-6 w-6 rounded text-xs transition-colors disabled:opacity-40 ${
        danger ? "text-danger hover:bg-danger/10" : "text-muted hover:bg-raised hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

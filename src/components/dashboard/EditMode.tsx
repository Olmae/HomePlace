"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Dictionary } from "@/i18n";

/**
 * Edit mode, held in the browser instead of the URL.
 *
 * It used to be a query parameter: pressing "Edit layout" navigated to
 * `?edit=1`, which re-ran the whole dashboard on the server — every Docker
 * stat, every uptime probe — just to draw the same tiles with a drag handle on
 * them. That is why the toggle felt slow. Now it is a piece of client state:
 * the tiles are already on the page, the edit affordances are always rendered
 * and simply revealed, and flipping the mode is instant.
 */
const EditContext = createContext<{ editing: boolean; toggle: () => void; canEdit: boolean }>({
  editing: false,
  toggle: () => {},
  canEdit: false,
});

export function useEditMode() {
  return useContext(EditContext);
}

export function EditModeProvider({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <EditContext.Provider value={{ editing: editing && canEdit, toggle: () => setEditing((v) => !v), canEdit }}>
      {children}
    </EditContext.Provider>
  );
}

/** The button that flips edit mode — no navigation, no refetch. */
export function EditToggle({ d }: { d: Dictionary }) {
  const { editing, toggle, canEdit } = useEditMode();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editing}
      className={`rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
        editing ? "bg-accent/10 text-accent" : "text-muted hover:bg-raised hover:text-text"
      }`}
    >
      {editing ? d.dashboard.doneEditing : d.dashboard.editMode}
    </button>
  );
}

/**
 * Hide something while the board is being edited — the container-detail arrow
 * and the start/stop controls, which would otherwise sit under the drag surface
 * and fight the toolbar for the same corner.
 */
export function HideWhenEditing({ children }: { children: ReactNode }) {
  const { editing } = useEditMode();
  if (editing) return null;
  return <>{children}</>;
}

/** The hint line beside the toggle, shown only while editing. */
export function EditHints({ d }: { d: Dictionary }) {
  const { editing } = useEditMode();
  if (!editing) return null;
  return (
    <>
      <span className="hidden text-xs text-faint md:inline">{d.dashboard.dragHint}</span>
      <span className="text-xs text-faint md:hidden">{d.dashboard.reorderHint}</span>
    </>
  );
}

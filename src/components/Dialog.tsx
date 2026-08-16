"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal dialog built on <dialog>.
 *
 * The native element brings focus trapping, Escape and the top layer with it —
 * all things a hand-rolled overlay gets subtly wrong, usually for keyboard
 * users who are least able to work around it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Clicking the backdrop closes: the click lands on the dialog element
      // itself, never on its children, which is how the backdrop is detected.
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      // pointer-events are explicit: a dialog opened from inside a subtree that
      // disables them would inherit that and become unclickable, even though it
      // renders in the browser's top layer.
      className={`pointer-events-auto w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-0 text-text shadow-pop backdrop:bg-black/50 ${
        wide ? "max-w-2xl" : "max-w-md"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-2 py-1 text-muted transition-colors hover:bg-raised hover:text-text"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
    </dialog>
  );
}

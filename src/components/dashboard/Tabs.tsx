"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createDashboard, renameDashboard, deleteDashboard } from "@/actions/dashboard";
import { Dialog } from "@/components/Dialog";
import { Field, Input, Button } from "@/components/form";
import type { Dictionary } from "@/i18n";

/**
 * Dashboard tabs.
 *
 * The active tab lives in the URL rather than in component state, so a
 * particular dashboard can be bookmarked, opened as the browser's home page, or
 * pinned — which is what most people will do with this panel.
 */
export function Tabs({
  d,
  dashboards,
  activeId,
  canEdit,
}: {
  d: Dictionary;
  dashboards: { id: string; name: string }[];
  activeId: string;
  canEdit: boolean;
}) {
  const [dialog, setDialog] = useState<null | "new" | "rename">(null);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const active = dashboards.find((x) => x.id === activeId);

  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto">
        {dashboards.map((dash) => (
          <Link
            key={dash.id}
            href={`/?tab=${dash.id}`}
            className={`whitespace-nowrap rounded-control px-3 py-1.5 text-sm font-medium transition-colors ${
              dash.id === activeId ? "bg-raised text-text" : "text-muted hover:bg-raised hover:text-text"
            }`}
          >
            {dash.name}
          </Link>
        ))}

        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => {
                setName("");
                setDialog("new");
              }}
              title={d.dashboard.newTab}
              className="rounded-control px-2 py-1.5 text-sm text-faint transition-colors hover:bg-raised hover:text-text"
            >
              +
            </button>
            {active && (
              <button
                type="button"
                onClick={() => {
                  setName(active.name);
                  setDialog("rename");
                }}
                title={d.common.edit}
                className="rounded-control px-2 py-1.5 text-xs text-faint transition-colors hover:bg-raised hover:text-text"
              >
                ✎
              </button>
            )}
          </>
        )}
      </div>

      {dialog && (
        <Dialog open onClose={() => setDialog(null)} title={dialog === "new" ? d.dashboard.newTab : d.common.edit}>
          <div className="flex flex-col gap-4">
            <Field label={d.dashboard.tabName}>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <div className="flex justify-between gap-2 border-t border-line pt-3">
              {dialog === "rename" && dashboards.length > 1 ? (
                <Button
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm(d.common.confirmDelete)) return;
                    startTransition(async () => {
                      await deleteDashboard(activeId);
                      setDialog(null);
                    });
                  }}
                >
                  {d.common.delete}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="quiet" onClick={() => setDialog(null)}>
                  {d.common.cancel}
                </Button>
                <Button
                  variant="primary"
                  disabled={pending || !name.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      if (dialog === "new") await createDashboard(name);
                      else await renameDashboard(activeId, name);
                      setDialog(null);
                    })
                  }
                >
                  {d.common.save}
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

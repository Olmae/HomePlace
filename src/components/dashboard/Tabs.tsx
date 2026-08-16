"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createDashboard, renameDashboard, deleteDashboard, setDashboardShared } from "@/actions/dashboard";
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
  dashboards: { id: string; name: string; slug: string; shared: boolean; mine: boolean }[];
  activeId: string;
  canEdit: boolean;
}) {
  const [dialog, setDialog] = useState<null | "new" | "rename">(null);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(true);
  const [pending, startTransition] = useTransition();

  const active = dashboards.find((x) => x.id === activeId);

  return (
    <>
      <div className="flex items-center gap-1 overflow-x-auto">
        {dashboards.map((dash) => (
          <Link
            key={dash.id}
            href={`/?tab=${dash.slug}`}
            // The active tab is the one thing on this row that has to be
            // unmistakable — it names the board you are looking at.
            className={`whitespace-nowrap rounded-control border px-3 py-1.5 text-sm font-medium transition-colors ${
              dash.id === activeId
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-transparent text-muted hover:bg-raised hover:text-text"
            }`}
          >
            {/* A private tab is marked, so it is obvious which board other
                people in the house can see. */}
            {!dash.shared && <span className="mr-1 text-[10px] text-faint">🔒</span>}
            {dash.name}
          </Link>
        ))}

        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => {
                setName("");
                setShared(true);
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
                  setShared(active.shared);
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

            {/* Only the owner sees the switch: an administrator should not be
                able to publish a board that is not theirs. */}
            {(dialog === "new" || active?.mine) && (
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={!shared} onChange={(e) => setShared(!e.target.checked)} />
                {d.dashboard.privateTab}
              </label>
            )}
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
                      if (dialog === "new") {
                        await createDashboard(name, shared);
                      } else {
                        await renameDashboard(activeId, name);
                        if (active && active.mine && active.shared !== shared) {
                          await setDashboardShared(activeId, shared);
                        }
                      }
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

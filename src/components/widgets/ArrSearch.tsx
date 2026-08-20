"use client";

import { useState, useTransition } from "react";
import { Dialog } from "@/components/Dialog";
import { Input, Button } from "@/components/form";
import { searchArr, addToArr } from "@/actions/services";
import type { ArrResult } from "@/lib/services";
import type { Dictionary } from "@/i18n";

/**
 * Search the *arr and add from the panel.
 *
 * A small magnifier on the widget opens this: type a title, and every Sonarr
 * and Radarr instance answers with its matches. Adding hands the title back to
 * the *arr with its own default profile and folder and asks it to search —
 * enough to say "get this", without becoming a second *arr UI.
 */
export function ArrSearch({ d }: { d: Dictionary }) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ArrResult[] | null>(null);
  const [added, setAdded] = useState<Record<string, "ok" | "err">>({});
  const [pending, startTransition] = useTransition();

  function search() {
    if (!term.trim()) return;
    setResults(null);
    startTransition(async () => {
      setResults(await searchArr(term));
    });
  }

  function add(r: ArrResult) {
    const id = `${r.instanceLabel}:${r.externalId}`;
    startTransition(async () => {
      const res = await addToArr(r.instanceLabel, r.externalId);
      setAdded((prev) => ({ ...prev, [id]: res.ok ? "ok" : "err" }));
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={d.services.searchArr}
        title={d.services.searchArr}
        className="rounded-control px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-raised hover:text-text"
      >
        🔍
      </button>

      {open && (
        <Dialog open onClose={() => setOpen(false)} title={d.services.searchArr} wide>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
                placeholder={d.services.searchArrPlaceholder}
                autoFocus
                className="flex-1"
              />
              <Button variant="primary" disabled={pending || !term.trim()} onClick={search}>
                {d.common.search}
              </Button>
            </div>

            {results === null && pending && <p className="text-sm text-muted">{d.common.loading}</p>}
            {results !== null && results.length === 0 && <p className="text-sm text-muted">{d.events.noMatches}</p>}

            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {(results ?? []).map((r) => {
                const id = `${r.instanceLabel}:${r.externalId}`;
                const state = added[id];
                return (
                  <div key={id} className="flex gap-3 rounded-control border border-line p-2">
                    {r.poster ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.poster} alt="" className="h-20 w-14 shrink-0 rounded object-cover" loading="lazy" />
                    ) : (
                      <span className="h-20 w-14 shrink-0 rounded bg-raised" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {r.title} {r.year ? <span className="text-faint">({r.year})</span> : null}
                      </p>
                      <p className="text-[11px] text-faint">
                        {r.instanceLabel} · {r.kind}
                      </p>
                      {r.overview && <p className="mt-1 line-clamp-2 text-[11px] text-muted">{r.overview}</p>}
                    </div>
                    <div className="flex shrink-0 items-center">
                      {r.inLibrary ? (
                        <span className="text-[11px] text-faint">{d.services.inLibrary}</span>
                      ) : state === "ok" ? (
                        <span className="text-[11px] text-ok">✓ {d.services.added}</span>
                      ) : (
                        <Button size="sm" variant="quiet" disabled={pending} onClick={() => add(r)}>
                          {state === "err" ? d.common.failed : d.services.add}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}

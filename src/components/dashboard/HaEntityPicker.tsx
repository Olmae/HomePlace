"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Input, Select, Button } from "@/components/form";
import { discoverHaEntities } from "@/actions/services";
import type { Dictionary } from "@/i18n";

type Entity = { id: string; name: string; state: string; domain: string; toggleable: boolean };

/**
 * Everything Home Assistant knows about, discovered rather than typed.
 *
 * The alternative was a textarea of entity ids, which requires opening Home
 * Assistant in another tab, finding the developer tools and copying strings
 * like `light.kitchen_ceiling_2`. A household is full of devices; the panel can
 * simply ask what they are.
 */
export function HaEntityPicker({
  d,
  value,
  onChange,
}: {
  d: Dictionary;
  /** Selected entity ids, in the order they should appear on the tile. */
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await discoverHaEntities();
      if (result.ok) setEntities(result.entities);
      else setError(result.error ?? d.common.error);
    });
    // Discovery runs once when the dialog opens; the house does not change
    // while somebody fills in a form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const domains = useMemo(() => {
    if (!entities) return [];
    return [...new Set(entities.map((e) => e.domain))].sort();
  }, [entities]);

  const shown = useMemo(() => {
    if (!entities) return [];
    const needle = query.trim().toLowerCase();
    return entities
      .filter((e) => (domain ? e.domain === domain : true))
      .filter((e) => (needle ? `${e.name} ${e.id}`.toLowerCase().includes(needle) : true))
      // Chosen ones first, so a long list does not hide what is already picked.
      .sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)))
      .slice(0, 120);
  }, [entities, query, domain, value]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  if (error) {
    return (
      <div className="rounded-control border border-line p-3">
        <p className="text-xs text-danger">{error}</p>
        <p className="mt-1 text-xs text-muted">{d.services.haPickerHint}</p>
      </div>
    );
  }

  if (!entities) {
    return <p className="text-xs text-muted">{pending ? d.common.loading : d.common.loading}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={d.common.search} className="flex-1" />
        <Select value={domain} onChange={(e) => setDomain(e.target.value)} className="w-36">
          <option value="">{d.services.haAllDomains}</option>
          {domains.map((dom) => (
            <option key={dom} value={dom}>
              {dom}
            </option>
          ))}
        </Select>
      </div>

      <p className="text-[11px] text-faint">
        {value.length} / {entities.length}
      </p>

      <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-control border border-line">
        {shown.map((entity) => {
          const chosen = value.includes(entity.id);
          return (
            <li key={entity.id}>
              <button
                type="button"
                onClick={() => toggle(entity.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                  chosen ? "bg-accent/10" : "hover:bg-raised"
                }`}
              >
                <span
                  className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border ${
                    chosen ? "border-accent bg-accent" : "border-line"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs">{entity.name}</span>
                  <span className="block truncate font-mono text-[10px] text-faint">{entity.id}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted">{entity.state}</span>
                {entity.toggleable && <span className="shrink-0 text-[10px] text-accent">⇄</span>}
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-3 text-xs text-muted">{d.widgets.noData}</li>}
      </ul>

      {value.length > 0 && (
        <Button size="sm" variant="quiet" onClick={() => onChange([])}>
          {d.common.delete}
        </Button>
      )}
    </div>
  );
}

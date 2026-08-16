"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Input, Select } from "@/components/form";
import type { Dictionary } from "@/i18n";

/**
 * Filtering the feed.
 *
 * The state goes into the URL rather than into the component: a filtered view
 * is then a link — "the week jellyfin kept dropping out" can be bookmarked, or
 * pasted to someone else.
 */
export function EventFilters({ d, type, q }: { d: Dictionary; type: string; q: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [text, setText] = useState(q);

  function apply(next: { type?: string; q?: string }) {
    const search = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) search.set(key, value);
      else search.delete(key);
    }
    router.push(`/events?${search.toString()}`);
  }

  const kinds = [
    { value: "", label: d.events.allKinds },
    { value: "down", label: d.events.wentDown },
    { value: "up", label: d.events.cameUp },
    { value: "restart", label: d.events.restarted },
    { value: "login", label: d.events.signedIn },
    { value: "auth-fail", label: d.events.authFailed },
    { value: "system", label: d.events.system },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") apply({ q: text });
        }}
        onBlur={() => {
          if (text !== q) apply({ q: text });
        }}
        placeholder={d.common.search}
        className="w-44"
      />
      <Select value={type} onChange={(e) => apply({ type: e.target.value })} className="w-44">
        {kinds.map((kind) => (
          <option key={kind.value} value={kind.value}>
            {kind.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

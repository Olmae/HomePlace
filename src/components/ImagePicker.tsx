"use client";

import { useRef, useState } from "react";
import { Input, Button } from "./form";
import type { Dictionary } from "@/i18n";

/**
 * Pick a picture: from the device, or by address.
 *
 * The file button is the important half. On a phone it opens the gallery, which
 * is where the photo someone wants as a background actually is — telling them
 * to first upload it somewhere and paste a link is asking them to solve a
 * problem this panel can solve for them.
 */
export function ImagePicker({
  d,
  value,
  onChange,
  placeholder = "https://…/photo.jpg",
}: {
  d: Dictionary;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? d.common.error);
      else onChange(json.url);
    } catch {
      setError(d.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 font-mono text-xs"
        />
        <Button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "…" : d.common.chooseFile}
        </Button>
      </div>

      {/* accept="image/*" is what makes a phone offer the gallery and the
          camera rather than a file manager. */}
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="" className="h-24 w-full rounded-control border border-line object-cover" />
      )}
    </div>
  );
}

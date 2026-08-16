"use client";

import { useMemo, useState } from "react";
import { Dialog } from "./Dialog";
import { Input, Button } from "./form";
import { TileIcon } from "./TileIcon";
import { ImagePicker } from "./ImagePicker";
import { SERVICE_ICONS, GENERAL_ICONS, iconPackUrl } from "@/lib/icons";
import type { Dictionary } from "@/i18n";

/**
 * Choosing an icon without pasting a URL.
 *
 * Three sources in one place, in the order people actually want them: the
 * service this tile is (matched by name, drawn from the bundled set), a general
 * set for everything else, and finally an image — uploaded or linked.
 *
 * The bundled sets are emoji rather than files. They cost nothing to ship, work
 * with no network, and render at any size; the community logo pack is offered
 * alongside for anyone who has enabled it.
 */
export function IconPicker({
  d,
  value,
  onChange,
  hintName,
}: {
  d: Dictionary;
  value: string;
  onChange: (icon: string) => void;
  /** Tile title or container name, used to suggest the matching service icons. */
  hintName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const services = useMemo(() => {
    const needle = (query || hintName || "").toLowerCase().trim();
    const entries = Object.entries(SERVICE_ICONS);
    if (!needle) return entries.slice(0, 48);
    // Matches in both directions: typing "jelly" finds jellyfin, and a tile
    // called "jellyfin" finds it without typing anything.
    return entries.filter(([key]) => key.includes(needle) || needle.includes(key)).slice(0, 48);
  }, [query, hintName]);

  const general = useMemo(() => {
    if (!query.trim()) return GENERAL_ICONS;
    return GENERAL_ICONS.filter((icon) => icon.includes(query.trim()));
  }, [query]);

  function choose(icon: string) {
    onChange(icon);
    setOpen(false);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-control border border-line bg-raised px-2.5 py-1.5 text-sm transition-colors hover:bg-surface"
        >
          <TileIcon icon={value} title={hintName || "?"} size="sm" />
          <span className="text-xs text-muted">{d.dashboard.chooseIcon}</span>
        </button>
        {value && (
          <Button size="sm" variant="quiet" onClick={() => onChange("")}>
            {d.common.delete}
          </Button>
        )}
      </div>

      {open && (
        <Dialog open onClose={() => setOpen(false)} title={d.dashboard.chooseIcon} wide>
          <div className="flex flex-col gap-4">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={d.common.search} autoFocus />

            {services.length > 0 && (
              <section>
                <p className="mb-1.5 text-xs font-medium text-muted">{d.dashboard.iconServices}</p>
                <div className="flex flex-wrap gap-1">
                  {services.map(([key, icon]) => (
                    <button
                      key={key}
                      type="button"
                      title={key}
                      onClick={() => choose(icon)}
                      className="flex h-9 w-9 items-center justify-center rounded-control border border-line text-lg transition-colors hover:border-accent hover:bg-raised"
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section>
              <p className="mb-1.5 text-xs font-medium text-muted">{d.dashboard.iconGeneral}</p>
              <div className="flex flex-wrap gap-1">
                {general.map((icon) => (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => choose(icon)}
                    className="flex h-9 w-9 items-center justify-center rounded-control border border-line text-lg transition-colors hover:border-accent hover:bg-raised"
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </section>

            {hintName && iconPackUrl({ name: hintName }) && (
              <section>
                <p className="mb-1.5 text-xs font-medium text-muted">{d.dashboard.iconLogo}</p>
                <button
                  type="button"
                  onClick={() => choose(iconPackUrl({ name: hintName }))}
                  className="flex items-center gap-2 rounded-control border border-line px-3 py-2 transition-colors hover:border-accent hover:bg-raised"
                >
                  <TileIcon icon={iconPackUrl({ name: hintName })} title={hintName} size="sm" />
                  <span className="text-xs text-muted">{hintName}</span>
                </button>
              </section>
            )}

            <section>
              <p className="mb-1.5 text-xs font-medium text-muted">{d.dashboard.iconImage}</p>
              <ImagePicker d={d} value={value.startsWith("http") || value.startsWith("/") ? value : ""} onChange={choose} />
            </section>
          </div>
        </Dialog>
      )}
    </>
  );
}

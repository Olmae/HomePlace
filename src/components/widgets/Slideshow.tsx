"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

/**
 * A slowly changing picture.
 *
 * It monitors nothing and reports nothing, which is the point: a panel that is
 * open all day is a place someone spends time, and a corner of it holding a
 * photo of somewhere they like makes it a nicer place than one more grey card.
 *
 * Images are given as URLs — the browser fetches them directly, so anything the
 * viewer can reach works: a photo host, a NAS share, another container.
 */
export function Slideshow({
  images,
  intervalSeconds = 20,
  caption,
  fit = "cover",
}: {
  images: string[];
  intervalSeconds?: number;
  caption?: string;
  fit?: "cover" | "contain";
}) {
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<number>>(new Set());

  // Broken URLs are skipped rather than shown as a broken-image icon: a
  // slideshow that stops on a dead link stops being decoration.
  const usable = images.map((src, i) => ({ src, i })).filter(({ i }) => !failed.has(i));

  useEffect(() => {
    if (images.length <= 1) return;
    const id = setInterval(() => {
      // Nothing advances while the tab is hidden — it would only mean arriving
      // back at a random frame with a stack of decoded images behind it.
      if (document.visibilityState === "visible") setIndex((n) => n + 1);
    }, Math.max(3, intervalSeconds) * 1000);
    return () => clearInterval(id);
  }, [images.length, intervalSeconds]);

  if (usable.length === 0) {
    return (
      <Card className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted">🖼️</p>
      </Card>
    );
  }

  const current = usable[index % usable.length];

  return (
    <Card className="group relative h-full overflow-hidden">
      {/* Every image stays mounted and cross-fades: swapping the src would show
          a blank frame while the next one decodes. */}
      {usable.map(({ src, i }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full transition-opacity duration-1000 ${
            fit === "cover" ? "object-cover" : "object-contain"
          } ${i === current.i ? "opacity-100" : "opacity-0"}`}
          loading="lazy"
          onError={() => setFailed((prev) => new Set(prev).add(i))}
        />
      ))}

      {caption && (
        <p className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6 text-xs text-white">
          {caption}
        </p>
      )}

      {usable.length > 1 && (
        <button
          type="button"
          onClick={() => setIndex((n) => n + 1)}
          className="absolute inset-0 cursor-default opacity-0"
          aria-label="Next image"
        />
      )}
    </Card>
  );
}

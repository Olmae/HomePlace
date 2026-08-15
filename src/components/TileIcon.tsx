"use client";

import { useState } from "react";

/**
 * A tile's icon.
 *
 * An emoji or a letter is drawn as text; anything that looks like a URL becomes
 * an image. Auto-detected favicons are wrong often enough — the service moved,
 * never had one, answers 404 with an HTML page — that a silent fallback to the
 * first letter is required, and that fallback is why this is a client
 * component: only the browser knows whether the image actually loaded.
 */
export function TileIcon({
  icon,
  title,
  color,
  size = "md",
}: {
  icon?: string | null;
  title: string;
  color?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const box = { sm: "h-5 w-5 text-xs", md: "h-7 w-7 text-base", lg: "h-10 w-10 text-2xl" }[size];
  const isUrl = !!icon && /^(https?:\/\/|\/)/.test(icon);

  if (isUrl && !failed) {
    return (
      // Not next/image: these point at arbitrary hosts on the local network,
      // each of which the optimiser would have to be allowlisted for.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={icon!}
        alt=""
        className={`${box} shrink-0 rounded object-contain`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className={`${box} flex shrink-0 items-center justify-center rounded font-semibold`}
      style={color ? { backgroundColor: `${color}22`, color } : undefined}
      aria-hidden
    >
      {!isUrl && icon ? icon : title.slice(0, 1).toUpperCase()}
    </span>
  );
}

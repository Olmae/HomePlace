"use client";

import { useRef, useState } from "react";
import { setLight } from "@/actions/services";
import type { Dictionary } from "@/i18n";

/**
 * The light controls, shared between the Home-groups widget and the smart-home
 * page's device panel: a dimmer, a colour picker for the bulbs that have one,
 * and a warm–cool slider for the ones that only do temperature. Everything
 * answers the finger immediately and tells Home Assistant at most every ~200ms
 * while dragging, so the room changes as the slider moves.
 */

export const SWATCHES: [number, number, number][] = [
  [255, 60, 60],
  [255, 150, 40],
  [255, 220, 60],
  [80, 220, 100],
  [60, 200, 220],
  [70, 120, 255],
  [180, 90, 255],
  [255, 130, 200],
  [255, 240, 220], // warm white
];

type Light = {
  id: string;
  brightness?: number;
  rgb?: string;
  supportsColor?: boolean;
  supportsColorTemp?: boolean;
};

export function LightControls({ d, light }: { d: Dictionary; light: Light }) {
  return <Dimmer d={d} ids={[light.id]} seedBright={light.brightness} seedRgb={light.rgb} light={light} />;
}

/** The same controls applied to every light in a group at once. */
export function GroupLightControls({ d, lights }: { d: Dictionary; lights: string[] }) {
  return (
    <div className="mb-2 rounded-control border border-line bg-raised/50 p-2">
      <Dimmer d={d} ids={lights} light={{ id: "group", supportsColor: true }} />
    </div>
  );
}

function Dimmer({
  d,
  ids,
  light,
  seedBright,
  seedRgb,
}: {
  d: Dictionary;
  ids: string[];
  light: Light;
  seedBright?: number;
  seedRgb?: string;
}) {
  const [bright, setBright] = useState(seedBright ?? 100);
  const [warm, setWarm] = useState(50);
  const [color, setColor] = useState(seedRgb ? rgbToHex(seedRgb) : "#ffd8b0");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function send(next: { brightnessPct?: number; colorTempK?: number; rgb?: [number, number, number] }) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      for (const id of ids) void setLight(id, next);
    }, 200);
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-2">
        <span className="w-4 text-center text-[11px] text-faint" aria-hidden>
          ☼
        </span>
        <input
          type="range"
          min={1}
          max={100}
          value={bright}
          aria-label={d.home.brightness}
          onChange={(e) => {
            const v = Number(e.target.value);
            setBright(v);
            send({ brightnessPct: v });
          }}
          className="hp-range flex-1"
          style={{ ["--fill" as string]: `${bright}%` }}
        />
        <span className="w-8 text-right font-mono text-[10px] tabular-nums text-faint">{bright}%</span>
      </label>

      {/* White — through colour temperature, not RGB. A "white" made from
          rgb(255,255,255) comes out dim and blue on most bulbs; real white is
          kelvin. Presets for the three everyone wants, a slider for the rest. */}
      {light.supportsColorTemp !== false && (
        <div className="flex items-center gap-1.5">
          <span className="w-4 text-center text-[11px] text-faint" aria-hidden>
            ◐
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {WHITES.map(([label, k]) => (
              <button
                key={k}
                type="button"
                title={`${label} · ${k}K`}
                onClick={() => {
                  setWarm(kelvinToPct(k));
                  send({ colorTempK: k });
                }}
                className="h-4 w-4 rounded-full border border-line"
                style={{ background: kelvinHex(k) }}
              />
            ))}
            <input
              type="range"
              min={2200}
              max={6500}
              step={100}
              value={pctToKelvin(warm)}
              aria-label={d.home.warmth}
              onChange={(e) => {
                const k = Number(e.target.value);
                setWarm(kelvinToPct(k));
                send({ colorTempK: k });
              }}
              className="hp-range ml-1 flex-1"
              style={{ ["--fill" as string]: `${warm}%` }}
            />
          </div>
        </div>
      )}

      {light.supportsColor && (
        <div className="flex items-center gap-1.5">
          <span className="w-4 text-center text-[11px] text-faint" aria-hidden>
            ◑
          </span>
          <div className="flex flex-1 flex-wrap items-center gap-1">
            {SWATCHES.map((rgb, i) => (
              <button
                key={i}
                type="button"
                aria-label={d.home.color}
                onClick={() => {
                  setColor(rgbToHex(rgb.join(",")));
                  send({ rgb });
                }}
                className="h-4 w-4 rounded-full border border-line"
                style={{ background: `rgb(${rgb.join(",")})` }}
              />
            ))}
            <input
              type="color"
              value={color}
              aria-label={d.home.color}
              onChange={(e) => {
                setColor(e.target.value);
                send({ rgb: hexToRgb(e.target.value) });
              }}
              className="h-5 w-6 cursor-pointer rounded border border-line bg-transparent p-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** The three white points people actually ask for, in kelvin. */
const WHITES: [string, number][] = [
  ["Warm", 2700],
  ["Neutral", 4000],
  ["Cool", 6500],
];

/** A swatch colour standing in for a colour temperature. */
function kelvinHex(k: number): string {
  return k >= 5500 ? "#dce7ff" : k >= 4500 ? "#f2f1ea" : k >= 3500 ? "#ffe4bd" : "#ffcf8a";
}

function pctToKelvin(p: number): number {
  return Math.round(2200 + (p / 100) * (6500 - 2200));
}

function kelvinToPct(k: number): number {
  return Math.round(((k - 2200) / (6500 - 2200)) * 100);
}

/** "255,120,60" → "#ff783c" for the native colour input. */
export function rgbToHex(rgb: string): string {
  const [r, g, b] = rgb.split(",").map((n) => Math.max(0, Math.min(255, Number(n) || 0)));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

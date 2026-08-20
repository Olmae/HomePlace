import { bytes, duration } from "./format";

/**
 * Making Home Assistant readable.
 *
 * Two problems this solves, both visible on a single router uptime sensor:
 *
 *  - The name. When an entity has no friendly name it falls back to its id —
 *    `sensor.archer_ax53_uptime` — which is a slug, not a label. `prettyName`
 *    turns that into "Archer AX53 Uptime".
 *  - The value. That same sensor reports `2873.13333333333` with unit `min`,
 *    and no one reads a router's uptime to thirteen decimal places. `formatValue`
 *    rounds it, and — when Home Assistant classifies it as a duration, or the
 *    operator picks that format — shows it as "1d 23h" instead.
 *
 * Pure and import-light, so it runs the same in the browser (where the smart
 * home page filters and renders) as on the server.
 */

export type ValueFormat = "auto" | "number" | "duration" | "bytes" | "percent" | "datetime" | "relative" | "raw";

/** The formats offered in the picker, in the order they appear. */
export const VALUE_FORMATS: ValueFormat[] = [
  "auto",
  "number",
  "duration",
  "bytes",
  "percent",
  "datetime",
  "relative",
  "raw",
];

/** Short tokens that read better fully capitalised than title-cased. */
const ACRONYMS = new Set(["id", "ip", "cpu", "gpu", "ram", "usb", "wifi", "led", "tv", "ups", "dns", "url", "mac"]);

/**
 * A readable label for an entity.
 *
 * Home Assistant's own friendly name wins whenever it set one; the fallback
 * only fires for the entities that never got named, turning the part after the
 * domain into words. A token that mixes letters and digits (ax53, m2) is left
 * upper-cased, because that is almost always a model number.
 */
export function prettyName(id: string, friendly?: string): string {
  if (friendly && friendly.trim() && friendly !== id) return friendly;
  const slug = id.includes(".") ? id.slice(id.indexOf(".") + 1) : id;
  return slug
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return word.toUpperCase();
      // A run of letters immediately followed by digits — a model number like
      // "ax53" — is more legible left in caps than as "Ax53".
      if (/[a-z]/i.test(word) && /\d/.test(word)) return word.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/** Seconds represented by one unit of the given measure, for duration display. */
function unitToSeconds(unit?: string): number | null {
  switch ((unit ?? "").toLowerCase()) {
    case "ms":
      return 0.001;
    case "s":
    case "sec":
    case "secs":
    case "second":
    case "seconds":
      return 1;
    case "min":
    case "mins":
    case "minute":
    case "minutes":
      return 60;
    case "h":
    case "hr":
    case "hrs":
    case "hour":
    case "hours":
      return 3600;
    case "d":
    case "day":
    case "days":
      return 86400;
    default:
      return null;
  }
}

/** Strip the float noise HA loves — "2873.13333333333" → "2873.13". */
function trimNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return String(n);
  const abs = Math.abs(n);
  const digits = abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  return String(Number(n.toFixed(digits)));
}

/** How `auto` decides, from Home Assistant's own classification and the unit. */
export function autoFormat(unit: string | undefined, deviceClass: string | undefined): ValueFormat {
  const dc = (deviceClass ?? "").toLowerCase();
  if (dc === "timestamp") return "relative";
  if (dc === "duration") return "duration";
  if (dc === "data_size") return "bytes";
  if ((unit ?? "") === "%") return "percent";
  return "number";
}

/**
 * Render a sensor's value in the chosen format.
 *
 * `auto` is the sensible default: it asks {@link autoFormat} what this sensor
 * looks like and applies that. Anything non-numeric (a text state like
 * "playing", or a mode name) is returned untouched — only numbers are reshaped.
 */
export function formatValue(
  state: string,
  unit: string | undefined,
  format: ValueFormat,
  deviceClass?: string
): string {
  if (format === "raw") return unit ? `${state} ${unit}` : state;

  const effective = format === "auto" ? autoFormat(unit, deviceClass) : format;
  const n = Number(state);
  const withUnit = (s: string) => (unit ? `${s} ${unit}` : s);

  // Text states (unavailable, playing, a preset name) have no numeric form.
  if (!Number.isFinite(n)) {
    if (effective === "relative" || effective === "datetime") {
      const t = Date.parse(state);
      if (Number.isFinite(t)) return renderTime(t, effective);
    }
    return state;
  }

  switch (effective) {
    case "duration": {
      const mult = unitToSeconds(unit) ?? 1; // no unit → assume seconds
      return duration(n * mult);
    }
    case "bytes":
      return bytes(n);
    case "percent":
      return `${trimNumber(n)}%`;
    case "datetime":
    case "relative": {
      // A bare number here is a Unix timestamp (seconds if it is too small to
      // be milliseconds).
      const ms = n > 1e12 ? n : n * 1000;
      return renderTime(ms, effective);
    }
    case "number":
    default:
      return withUnit(trimNumber(n));
  }
}

function renderTime(ms: number, format: "relative" | "datetime"): string {
  if (format === "datetime") return new Date(ms).toLocaleString();
  const diff = Date.now() - ms;
  const abs = Math.abs(diff);
  const s = Math.round(abs / 1000);
  const label = s < 60 ? `${s}s` : duration(s);
  return diff >= 0 ? `${label} ago` : `in ${label}`;
}

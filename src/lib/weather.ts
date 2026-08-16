import "server-only";

/**
 * Weather, from Open-Meteo.
 *
 * Chosen because it needs no account and no API key: a self-hosted panel that
 * demands someone register with a weather company before showing a temperature
 * has failed at being self-hosted. The trade-off is that this is the one widget
 * that talks to the public internet, so it fails quietly on a LAN-only box.
 *
 * Results are cached in memory for ten minutes. The forecast does not change
 * faster than that, and a dashboard left open for a day should not make 3000
 * requests to a free service.
 */

export type Weather = {
  temperature: number;
  apparent: number;
  code: number;
  wind: number;
  humidity: number;
  isDay: boolean;
  daily: { day: string; min: number; max: number; code: number }[];
};

type CacheEntry = { at: number; value: Weather };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 10 * 60_000;

export async function fetchWeather(latitude: number, longitude: number): Promise<Weather | null> {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: "auto",
    forecast_days: "4",
  });

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return hit?.value ?? null;
    const body = await res.json();

    const value: Weather = {
      temperature: Number(body.current?.temperature_2m ?? 0),
      apparent: Number(body.current?.apparent_temperature ?? 0),
      code: Number(body.current?.weather_code ?? 0),
      wind: Number(body.current?.wind_speed_10m ?? 0),
      humidity: Number(body.current?.relative_humidity_2m ?? 0),
      isDay: body.current?.is_day === 1,
      daily: (body.daily?.time ?? []).slice(0, 4).map((day: string, i: number) => ({
        day,
        min: Number(body.daily.temperature_2m_min[i]),
        max: Number(body.daily.temperature_2m_max[i]),
        code: Number(body.daily.weather_code[i]),
      })),
    };

    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    // Stale data beats an empty card: a temperature from ten minutes ago is
    // still roughly true, and the alternative is a hole in the dashboard every
    // time the connection hiccups.
    return hit?.value ?? null;
  }
}

/**
 * WMO weather codes as an emoji and a name.
 *
 * The full table has ninety-odd entries that collapse into a handful of things
 * a person cares about: is it wet, is it frozen, can I see the sky.
 */
export function describeWeather(code: number, isDay = true): { icon: string; key: keyof typeof WEATHER_LABELS } {
  if (code === 0) return { icon: isDay ? "☀️" : "🌙", key: "clear" };
  if (code <= 2) return { icon: isDay ? "🌤️" : "☁️", key: "partly" };
  if (code === 3) return { icon: "☁️", key: "cloudy" };
  if (code <= 48) return { icon: "🌫️", key: "fog" };
  if (code <= 57) return { icon: "🌦️", key: "drizzle" };
  if (code <= 67) return { icon: "🌧️", key: "rain" };
  if (code <= 77) return { icon: "🌨️", key: "snow" };
  if (code <= 82) return { icon: "🌧️", key: "showers" };
  if (code <= 86) return { icon: "🌨️", key: "snow" };
  return { icon: "⛈️", key: "storm" };
}

/** Label keys, resolved against the dictionary by the widget. */
export const WEATHER_LABELS = {
  clear: "clear",
  partly: "partly",
  cloudy: "cloudy",
  fog: "fog",
  drizzle: "drizzle",
  rain: "rain",
  snow: "snow",
  showers: "showers",
  storm: "storm",
} as const;

/**
 * Look up a place by name, so nobody has to find their coordinates by hand.
 * Same provider, same no-key policy.
 */
export async function geocode(name: string): Promise<{ name: string; latitude: number; longitude: number; country: string }[]> {
  if (!name.trim()) return [];
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=5&language=en`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const body = await res.json();
    return (body.results ?? []).map((r: Record<string, unknown>) => ({
      name: String(r.name ?? ""),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
      country: String(r.country ?? ""),
    }));
  } catch {
    return [];
  }
}

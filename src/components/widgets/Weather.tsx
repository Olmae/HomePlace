import { Card, CardHeader } from "@/components/ui";
import { fetchWeather, describeWeather } from "@/lib/weather";
import type { Dictionary } from "@/i18n";

/**
 * Weather.
 *
 * On a panel that is also a home page, this is the tile that has nothing to do
 * with servers — and that is the point. It uses Open-Meteo, which needs no
 * account and no key, so it works on a fresh installation without anyone
 * signing up for anything.
 */
export async function WeatherWidget({
  config,
  title,
  d,
}: {
  config: Record<string, unknown>;
  title: string;
  d: Dictionary;
}) {
  const latitude = Number(config.latitude);
  const longitude = Number(config.longitude);
  const place = typeof config.place === "string" ? config.place : "";

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return (
      <Card className="h-full">
        <CardHeader title={title} />
        <p className="p-4 text-sm text-muted">{d.widgets.weatherPick}</p>
      </Card>
    );
  }

  const weather = await fetchWeather(latitude, longitude);
  if (!weather) {
    return (
      <Card className="h-full">
        <CardHeader title={place || title} />
        <p className="p-4 text-sm text-muted">{d.widgets.noData}</p>
      </Card>
    );
  }

  const now = describeWeather(weather.code, weather.isDay);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={place || title}
        action={<span className="text-[11px] text-faint">{d.widgets[now.key]}</span>}
      />

      <div className="flex items-center gap-3 px-4 pt-3">
        <span className="text-4xl leading-none" aria-hidden>
          {now.icon}
        </span>
        <div>
          <p className="font-mono text-3xl tabular-nums">{Math.round(weather.temperature)}°</p>
          <p className="text-xs text-muted">
            {d.widgets.feelsLike} {Math.round(weather.apparent)}° · {Math.round(weather.wind)} {d.widgets.windUnit}
          </p>
        </div>
      </div>

      {/* Four days is what fits without the row becoming a list nobody reads. */}
      <div className="mt-auto flex justify-between gap-1 px-4 pb-3 pt-3">
        {weather.daily.map((day, i) => {
          const forecast = describeWeather(day.code);
          return (
            <div key={day.day} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-[10px] text-faint">
                {i === 0 ? d.widgets.today : new Date(day.day).toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <span aria-hidden>{forecast.icon}</span>
              <span className="font-mono text-[11px] tabular-nums">
                {Math.round(day.max)}°
                <span className="text-faint">/{Math.round(day.min)}°</span>
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

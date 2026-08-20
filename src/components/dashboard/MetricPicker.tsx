"use client";

import { useEffect, useState, useTransition } from "react";
import { Input, Select, Button } from "@/components/form";
import { listMetrics, listInstances, previewQuery } from "@/actions/metrics";
import type { Dictionary } from "@/i18n";

/**
 * Building a query by choosing rather than by typing.
 *
 * Three ways in, in the order people need them: a short list of the questions a
 * home server is actually asked, the full list of metrics this Prometheus
 * happens to hold, and — still — a plain field for anyone who knows exactly what
 * they want. The first covers most cases without knowing PromQL exists.
 *
 * Whatever is chosen can be run on the spot, because a query that returns
 * nothing looks identical to one that was never saved.
 */

/** Presets, mirrored from lib/prometheus so the labels can be translated. */
const PRESETS = [
  "cpu",
  "memory",
  "memoryUsed",
  "load",
  "diskUsed",
  "temperature",
  "networkIn",
  "networkOut",
  "uptime",
] as const;

export function MetricPicker({
  d,
  query,
  instance,
  onChange,
}: {
  d: Dictionary;
  query: string;
  instance: string;
  /** Reports the query, and the unit when a preset implies one. */
  onChange: (next: { query: string; instance?: string; unit?: string; max?: number }) => void;
}) {
  const [mode, setMode] = useState<"preset" | "metric" | "manual">(query ? "manual" : "preset");
  const [instances, setInstances] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [preview, setPreview] = useState<{ ok: boolean; value?: number; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [hosts, names] = await Promise.all([listInstances(), listMetrics()]);
      setInstances(hosts);
      setMetrics(names);
    });
    // The list of machines does not change while a dialog is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choosePreset(key: string) {
    // The preset decides the query, the unit and the scale together — the three
    // are one answer, and leaving the unit behind produces bytes labelled "%".
    const presets: Record<string, { query: string; unit: string; max?: number }> = {
      cpu: { query: promCpu(instance), unit: "percent", max: 100 },
      memory: { query: promMemory(instance), unit: "percent", max: 100 },
      memoryUsed: { query: promMemoryUsed(instance), unit: "bytes" },
      load: { query: `node_load1${sel(instance)}`, unit: "number" },
      diskUsed: { query: promDisk(instance), unit: "percent", max: 100 },
      temperature: { query: `max(node_hwmon_temp_celsius${sel(instance)})`, unit: "number", max: 90 },
      networkIn: { query: `sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*|br-.*|docker.*"${sel(instance, true)}}[2m]))`, unit: "bytes" },
      networkOut: { query: `sum(rate(node_network_transmit_bytes_total{device!~"lo|veth.*|br-.*|docker.*"${sel(instance, true)}}[2m]))`, unit: "bytes" },
      uptime: { query: `time() - node_boot_time_seconds${sel(instance)}`, unit: "number" },
    };
    const chosen = presets[key];
    if (chosen) onChange({ ...chosen, instance });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {(["preset", "metric", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-control border px-2.5 py-1 text-xs transition-colors ${
              m === mode ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-raised"
            }`}
          >
            {d.metrics[m]}
          </button>
        ))}
      </div>

      {instances.length > 0 && (
        <Select
          value={instance}
          onChange={(e) => onChange({ query, instance: e.target.value })}
          className="text-xs"
        >
          <option value="">{d.metrics.everyHost}</option>
          {instances.map((host) => (
            <option key={host} value={host}>
              {host}
            </option>
          ))}
        </Select>
      )}

      {mode === "preset" && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PRESETS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => choosePreset(key)}
              className="rounded-control border border-line px-2 py-1.5 text-left text-xs transition-colors hover:border-accent hover:bg-raised"
            >
              {d.metrics.presets[key]}
            </button>
          ))}
        </div>
      )}

      {mode === "metric" && (
        <>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={d.common.search} className="text-xs" />
          <ul className="max-h-48 overflow-y-auto rounded-control border border-line">
            {metrics
              .filter((name) => (filter ? name.includes(filter) : true))
              .slice(0, 200)
              .map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => onChange({ query: `${name}${sel(instance)}` })}
                    className="block w-full truncate px-3 py-1 text-left font-mono text-[11px] transition-colors hover:bg-raised"
                  >
                    {name}
                  </button>
                </li>
              ))}
            {metrics.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted">{pending ? d.common.loading : d.monitoring.noPrometheus}</li>
            )}
          </ul>
        </>
      )}

      {/* The manual field is always here, whichever mode is chosen: picking is
          the convenience, and typing is what someone reaches for when they know
          exactly what they want. */}
      <Input
        value={query}
        onChange={(e) => onChange({ query: e.target.value })}
        placeholder="node_load1"
        className="font-mono text-xs"
      />

      {mode === "manual" && (
        <div className="rounded-control border border-line p-2">
          <p className="mb-1.5 text-[11px] text-muted">{d.metrics.examplesHint}</p>
          <ul className="space-y-1.5">
            {EXAMPLES.map((example) => (
              <li key={example.key}>
                <button
                  type="button"
                  onClick={() => onChange({ query: example.query(instance), unit: example.unit, max: example.max })}
                  className="w-full rounded border border-transparent px-1.5 py-1 text-left transition-colors hover:border-line hover:bg-raised"
                >
                  <span className="block font-mono text-[10px] leading-relaxed text-accent">
                    {example.query(instance)}
                  </span>
                  <span className="block text-[11px] text-muted">{d.metrics.examples[example.key]}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !query.trim()}
          onClick={() => startTransition(async () => setPreview(await previewQuery(query)))}
        >
          {d.common.test}
        </Button>
        {preview &&
          (preview.ok ? (
            <span className="font-mono text-xs text-ok">{preview.value?.toFixed(2)}</span>
          ) : (
            <span className="truncate text-xs text-danger">{preview.error}</span>
          ))}
      </div>
    </div>
  );
}

/**
 * Worked examples for the manual field.
 *
 * Each one is a real query that runs on a normal home setup, paired with a
 * sentence saying what it answers. Reading five of these teaches more PromQL
 * than a link to the documentation ever does, and clicking one is faster than
 * typing it.
 */
const EXAMPLES: {
  key: "cpu" | "diskFree" | "containerCpu" | "network" | "temperature" | "swap" | "processes" | "systemd";
  query: (instance: string) => string;
  unit?: string;
  max?: number;
}[] = [
  { key: "cpu", query: (i) => promCpu(i), unit: "percent", max: 100 },
  {
    key: "diskFree",
    query: (i) => `node_filesystem_avail_bytes{mountpoint="/"${sel(i, true)}}`,
    unit: "bytes",
  },
  {
    key: "containerCpu",
    query: () => 'sum by (name) (rate(container_cpu_usage_seconds_total{name!=""}[2m])) * 100',
    unit: "percent",
  },
  {
    key: "network",
    query: (i) => `sum(rate(node_network_receive_bytes_total{device!~"lo|veth.*"${sel(i, true)}}[2m]))`,
    unit: "bytes",
  },
  { key: "temperature", query: (i) => `max(node_hwmon_temp_celsius${sel(i)})`, unit: "number", max: 90 },
  {
    key: "swap",
    query: (i) => `node_memory_SwapTotal_bytes${sel(i)} - node_memory_SwapFree_bytes${sel(i)}`,
    unit: "bytes",
  },
  { key: "processes", query: (i) => `node_procs_running${sel(i)}`, unit: "number" },
  {
    key: "systemd",
    query: (i) => `count(node_systemd_unit_state{state="failed"${sel(i, true)}} == 1)`,
    unit: "number",
  },
];

/** `{instance="…"}` or `,instance="…"` depending on where it is being spliced. */
function sel(instance: string, inside = false): string {
  if (!instance) return "";
  const matcher = `instance="${instance.replace(/"/g, '\\"')}"`;
  return inside ? `,${matcher}` : `{${matcher}}`;
}

function promCpu(instance: string): string {
  return `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"${sel(instance, true)}}[2m])) * 100)`;
}

function promMemory(instance: string): string {
  return `100 * (1 - node_memory_MemAvailable_bytes${sel(instance)} / node_memory_MemTotal_bytes${sel(instance)})`;
}

function promMemoryUsed(instance: string): string {
  return `node_memory_MemTotal_bytes${sel(instance)} - node_memory_MemAvailable_bytes${sel(instance)}`;
}

function promDisk(instance: string): string {
  const filter = `fstype!~"tmpfs|overlay"${sel(instance, true)}`;
  return `100 - (min(node_filesystem_avail_bytes{${filter}}) / min(node_filesystem_size_bytes{${filter}}) * 100)`;
}

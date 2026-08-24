"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Field, Input, Select, Button } from "@/components/form";
import {
  saveJellyfinSettings,
  saveQbitSettings,
  saveArrSettings,
  savePbsSettings,
  saveHaSettings,
  type ServiceResult,
} from "@/actions/services";
import { addServiceWidget } from "@/actions/dashboard";
import { SecretField } from "./SecretField";
import type { Dictionary } from "@/i18n";

/**
 * The services this household runs.
 *
 * All five follow the same shape — address, credential, save — because they
 * are the same job five times, and a page where each one is arranged
 * differently is a page nobody finishes reading. Saving performs a real read
 * against the service, so the result line means "it answered", not "it was
 * written down".
 */

export type ServicesDisplay = {
  jellyfin: { url: string; hasKey: boolean };
  qbittorrent: { url: string; username: string; hasPassword: boolean };
  arr: { kind: string; label: string; url: string; hasKey: boolean }[];
  pbs: { url: string; tokenId: string; hasSecret: boolean; verifyTls: boolean };
  homeassistant: { url: string; hasToken: boolean };
};

export function ServiceForms({ d, display }: { d: Dictionary; display: ServicesDisplay }) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <JellyfinForm d={d} value={display.jellyfin} />
      <QbitForm d={d} value={display.qbittorrent} />
      <ArrForm d={d} value={display.arr} />
      <PbsForm d={d} value={display.pbs} />
      <HaForm d={d} value={display.homeassistant} />
    </div>
  );
}

/**
 * "Put it on the board", next to the credentials that make it work.
 *
 * The moment a service is configured is the moment someone wants to see it. The
 * alternative was: leave settings, open the dashboard, press +, choose Widget,
 * find the right one, name it — five steps to express something the panel
 * already knows.
 */
function AddToBoard({ d, widget, title, enabled }: { d: Dictionary; widget: string; title: string; enabled: boolean }) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!enabled) return null;

  return (
    <Button
      size="sm"
      variant="quiet"
      disabled={pending || done}
      onClick={() => startTransition(async () => setDone((await addServiceWidget(widget, title)).ok))}
    >
      {done ? d.settings.addedToBoard : d.settings.addToBoard}
    </Button>
  );
}

function Result({ result, d }: { result: ServiceResult | null; d: Dictionary }) {
  if (!result) return null;
  return result.ok ? (
    <span className="text-xs text-ok">✓ {d.common.ok}</span>
  ) : (
    <span className="truncate text-xs text-danger" title={result.error}>
      {result.error ?? d.common.failed}
    </span>
  );
}

function JellyfinForm({ d, value }: { d: Dictionary; value: ServicesDisplay["jellyfin"] }) {
  const [form, setForm] = useState({ url: value.url, apiKey: "" });
  const [result, setResult] = useState<ServiceResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader title="Jellyfin" action={<Badge tone={value.url ? "ok" : "neutral"}>{value.url ? "on" : "off"}</Badge>} />
      <div className="flex flex-col gap-3 p-4">
        <Field label={d.settings.url}>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="http://192.168.0.10:8096"
            className="font-mono text-xs"
          />
        </Field>
        <SecretField
          d={d}
          label="API key"
          hasSecret={value.hasKey}
          value={form.apiKey}
          onChange={(v) => setForm({ ...form, apiKey: v })}
          hint={d.settings.jellyfinKeyHint}
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => startTransition(async () => setResult(await saveJellyfinSettings(form)))}>
            {d.common.save}
          </Button>
          <Result result={result} d={d} />
          <AddToBoard d={d} widget="jellyfin" title="Jellyfin" enabled={!!value.url} />
        </div>
      </div>
    </Card>
  );
}

function QbitForm({ d, value }: { d: Dictionary; value: ServicesDisplay["qbittorrent"] }) {
  const [form, setForm] = useState({ url: value.url, username: value.username, password: "" });
  const [result, setResult] = useState<ServiceResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader title="qBittorrent" action={<Badge tone={value.url ? "ok" : "neutral"}>{value.url ? "on" : "off"}</Badge>} />
      <div className="flex flex-col gap-3 p-4">
        <Field label={d.settings.url}>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="http://192.168.0.10:8080"
            className="font-mono text-xs"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={d.settings.username}>
            <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </Field>
          <SecretField
            d={d}
            label={d.settings.password}
            hasSecret={value.hasPassword}
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => startTransition(async () => setResult(await saveQbitSettings(form)))}>
            {d.common.save}
          </Button>
          <Result result={result} d={d} />
          <AddToBoard d={d} widget="qbittorrent" title="qBittorrent" enabled={!!value.url} />
        </div>
      </div>
    </Card>
  );
}

/** Several *arr instances: they are the same API with different names. */
function ArrForm({ d, value }: { d: Dictionary; value: ServicesDisplay["arr"] }) {
  const [rows, setRows] = useState(
    value.length > 0
      ? value.map((a) => ({ kind: a.kind, label: a.label, url: a.url, apiKey: "" }))
      : [{ kind: "sonarr", label: "Sonarr", url: "", apiKey: "" }]
  );
  const [result, setResult] = useState<ServiceResult | null>(null);
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<(typeof rows)[number]>) {
    setRows((prev) => prev.map((row, index) => (index === i ? { ...row, ...patch } : row)));
  }

  return (
    <Card>
      <CardHeader
        title="Sonarr / Radarr / Lidarr"
        action={<Badge tone={value.length > 0 ? "ok" : "neutral"}>{value.length || "off"}</Badge>}
      />
      <div className="flex flex-col gap-3 p-4">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
            <Field label={d.settings.kind}>
              <Select value={row.kind} onChange={(e) => update(i, { kind: e.target.value, label: e.target.value })}>
                <option value="sonarr">Sonarr</option>
                <option value="radarr">Radarr</option>
                <option value="lidarr">Lidarr</option>
                <option value="readarr">Readarr</option>
              </Select>
            </Field>
            <Field label={d.dashboard.tileTitle}>
              <Input value={row.label} onChange={(e) => update(i, { label: e.target.value })} />
            </Field>
            <Field label={d.settings.url}>
              <Input
                value={row.url}
                onChange={(e) => update(i, { url: e.target.value })}
                placeholder="http://192.168.0.10:8989"
                className="font-mono text-xs"
              />
            </Field>
            <SecretField
              d={d}
              label="API key"
              hasSecret={!!value[i]?.hasKey}
              value={row.apiKey}
              onChange={(v) => update(i, { apiKey: v })}
            />
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setRows((prev) => [...prev, { kind: "radarr", label: "Radarr", url: "", apiKey: "" }])}>
            +
          </Button>
          <Button variant="primary" disabled={pending} onClick={() => startTransition(async () => setResult(await saveArrSettings(rows)))}>
            {d.common.save}
          </Button>
          <Result result={result} d={d} />
          <AddToBoard d={d} widget="arr" title="*arr" enabled={value.length > 0} />
        </div>
      </div>
    </Card>
  );
}

function PbsForm({ d, value }: { d: Dictionary; value: ServicesDisplay["pbs"] }) {
  const [form, setForm] = useState({
    url: value.url,
    tokenId: value.tokenId,
    tokenSecret: "",
    verifyTls: value.verifyTls,
  });
  const [result, setResult] = useState<ServiceResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader title="Proxmox Backup Server" action={<Badge tone={value.url ? "ok" : "neutral"}>{value.url ? "on" : "off"}</Badge>} />
      <div className="flex flex-col gap-3 p-4">
        <Field label={d.settings.url}>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="https://192.168.0.11:8007"
            className="font-mono text-xs"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={d.settings.tokenId}>
            <Input
              value={form.tokenId}
              onChange={(e) => setForm({ ...form, tokenId: e.target.value })}
              placeholder="root@pam!homeplace"
              className="font-mono text-xs"
            />
          </Field>
          <SecretField
            d={d}
            label={d.settings.tokenSecret}
            hasSecret={value.hasSecret}
            value={form.tokenSecret}
            onChange={(v) => setForm({ ...form, tokenSecret: v })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={form.verifyTls} onChange={(e) => setForm({ ...form, verifyTls: e.target.checked })} />
          {d.settings.verifyTls}
        </label>
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => startTransition(async () => setResult(await savePbsSettings(form)))}>
            {d.common.save}
          </Button>
          <Result result={result} d={d} />
          <AddToBoard d={d} widget="pbs" title="Proxmox Backup" enabled={!!value.url} />
        </div>
      </div>
    </Card>
  );
}

function HaForm({ d, value }: { d: Dictionary; value: ServicesDisplay["homeassistant"] }) {
  const [form, setForm] = useState({ url: value.url, token: "" });
  const [result, setResult] = useState<ServiceResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardHeader title="Home Assistant" action={<Badge tone={value.url ? "ok" : "neutral"}>{value.url ? "on" : "off"}</Badge>} />
      <div className="flex flex-col gap-3 p-4">
        <Field label={d.settings.url}>
          <Input
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="http://192.168.0.12:8123"
            className="font-mono text-xs"
          />
        </Field>
        <SecretField
          d={d}
          label={d.settings.haToken}
          hasSecret={value.hasToken}
          value={form.token}
          onChange={(v) => setForm({ ...form, token: v })}
          hint={d.settings.haTokenHint}
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={pending} onClick={() => startTransition(async () => setResult(await saveHaSettings(form)))}>
            {d.common.save}
          </Button>
          <Result result={result} d={d} />
          <AddToBoard d={d} widget="homeassistant" title="Home Assistant" enabled={!!value.url} />
        </div>
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader } from "@/components/ui";
import { Input, Button, Select } from "@/components/form";
import { saveNutritionProfile, searchFood, searchBarcode, logFood, deleteFood, type NutritionState } from "@/actions/nutrition";
import type { NutritionProfile } from "@/lib/nutrition";
import type { FoodMatch, SearchResult } from "@/lib/fatsecret";
import { fill, type Dictionary } from "@/i18n";

/**
 * The food diary on the board.
 *
 * Two halves: the targets computed from a personal profile, and the day filled
 * against them. Foods come from FatSecret's search when it is configured —
 * scaled by grams — or are typed in by hand; either way the day's totals climb
 * the same bars. Personal, so it only ever shows the signed-in account's day.
 */
export function NutritionDiary({ d, title, state, canControl }: { d: Dictionary; title: string; state: NutritionState; canControl: boolean }) {
  const t = d.widgets;
  const router = useRouter();
  const [, start] = useTransition();
  const [editing, setEditing] = useState(!state.profile);

  const refresh = () => router.refresh();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={title}
        icon="🍎"
        action={
          canControl ? (
            <button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] text-faint transition-colors hover:text-text">
              {editing ? d.common.close : t.nutritionProfile}
            </button>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        {editing && canControl ? (
          <ProfileForm d={d} profile={state.profile} onSaved={() => { setEditing(false); refresh(); }} />
        ) : (
          <>
            <Totals d={d} state={state} />
            <Entries d={d} state={state} canControl={canControl} onChange={refresh} />
          </>
        )}
      </div>

      {!editing && canControl && state.profile && <AddFood d={d} lookup={state.lookup} onAdded={refresh} start={start} />}
    </Card>
  );
}

// ─────────────────────────────── Targets ────────────────────────────────

function Totals({ d, state }: { d: Dictionary; state: NutritionState }) {
  const t = d.widgets;
  const { totals, targets } = state;
  if (!targets) return <p className="p-4 text-sm text-muted">{t.nutritionNoProfile}</p>;

  const left = Math.max(0, targets.kcal - totals.kcal);
  return (
    <div className="p-3">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tabular-nums">{totals.kcal}</div>
          <div className="text-[11px] text-faint">
            / {targets.kcal} {t.nutritionKcal}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-medium tabular-nums text-ok">{left}</div>
          <div className="text-[11px] text-faint">{t.nutritionLeft}</div>
        </div>
      </div>
      <Bar label={t.nutritionKcal} value={totals.kcal} target={targets.kcal} accent="bg-accent" />
      <Bar label={t.nutritionProtein} value={totals.protein} target={targets.protein} accent="bg-ok" unit="g" />
      <Bar label={t.nutritionFat} value={totals.fat} target={targets.fat} accent="bg-warn" unit="g" />
      <Bar label={t.nutritionCarbs} value={totals.carbs} target={targets.carbs} accent="bg-info" unit="g" />
    </div>
  );
}

function Bar({ label, value, target, accent, unit }: { label: string; value: number; target: number; accent: string; unit?: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = value > target;
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span className="text-muted">{label}</span>
        <span className={`tabular-nums ${over ? "text-danger" : "text-faint"}`}>
          {value} / {target}
          {unit ?? ""}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-raised">
        <div className={`h-full rounded-full ${over ? "bg-danger" : accent}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ──────────────────────────────── Diary ─────────────────────────────────

function Entries({ d, state, canControl, onChange }: { d: Dictionary; state: NutritionState; canControl: boolean; onChange: () => void }) {
  if (state.entries.length === 0) return <p className="px-3 pb-3 text-sm text-muted">{d.widgets.nutritionEmpty}</p>;
  return (
    <div className="border-t border-line">
      {state.entries.map((e) => (
        <div key={e.id} className="group flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-raised">
          <span className="min-w-0 flex-1 truncate">
            {e.name}
            {e.grams != null && <span className="text-faint"> · {e.grams}g</span>}
          </span>
          <span className="shrink-0 tabular-nums text-faint">{Math.round(e.kcal)}</span>
          {canControl && (
            <button
              type="button"
              onClick={() => void deleteFood(e.id).then(onChange)}
              className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
              aria-label={d.common.delete}
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────── Add food ───────────────────────────────

function AddFood({ d, lookup, onAdded, start }: { d: Dictionary; lookup: boolean; onAdded: () => void; start: (fn: () => void) => void }) {
  const t = d.widgets;
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(!lookup);
  const [scanning, setScanning] = useState(false);
  const [canScan, setCanScan] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A camera is enough — the scanner uses the native BarcodeDetector where it
    // exists and falls back to a bundled decoder (ZXing) everywhere else, so the
    // button is offered on iOS and Firefox too, not only on Chrome/Android.
    setCanScan(typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  function onQuery(v: string) {
    setQuery(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setResult(null); return; }
    timer.current = setTimeout(async () => {
      setBusy(true);
      try { setResult(await searchFood(v.trim())); } finally { setBusy(false); }
    }, 400);
  }

  async function lookupBarcode(code?: string) {
    const c = (code ?? barcode).replace(/\D/g, "");
    if (c.length < 6) return;
    setBarcode(c);
    setQuery("");
    setBusy(true);
    try { setResult(await searchBarcode(c)); } finally { setBusy(false); }
  }

  if (manual) return <ManualForm d={d} onAdded={onAdded} start={start} onCancel={lookup ? () => setManual(false) : undefined} />;

  const foods = result?.foods ?? [];
  return (
    <div className="border-t border-line p-2">
      <div className="flex gap-2">
        <Input value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t.nutritionSearch} className="flex-1" />
        <Button variant="quiet" onClick={() => setManual(true)} title={t.nutritionManual}>
          ✎
        </Button>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookupBarcode()}
          inputMode="numeric"
          placeholder={t.nutritionBarcode}
          className="flex-1"
        />
        {canScan && (
          <Button variant="quiet" onClick={() => setScanning(true)} title={t.nutritionScan}>
            📷
          </Button>
        )}
        <Button variant="quiet" onClick={() => lookupBarcode()} disabled={barcode.replace(/\D/g, "").length < 6} title={t.nutritionBarcode}>
          🔍
        </Button>
      </div>
      {scanning && <BarcodeScanner d={d} onDetected={(code) => { setScanning(false); void lookupBarcode(code); }} onClose={() => setScanning(false)} />}
      {busy && <p className="px-1 pt-2 text-xs text-faint">{d.common.loading}</p>}
      {result?.error && !busy && (
        <p className="px-1 pt-2 text-xs text-danger">
          {searchErrorText(result.error, t)}{" "}
          <button type="button" onClick={() => setManual(true)} className="underline">
            {t.nutritionManual}
          </button>
        </p>
      )}
      {result && !result.error && foods.length === 0 && !busy && <p className="px-1 pt-2 text-xs text-faint">{t.nutritionNoResults}</p>}
      {foods.length > 0 && (
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {foods.map((r) => (
            <FoodResult key={r.id} d={d} match={r} onAdded={() => { setQuery(""); setResult(null); onAdded(); }} start={start} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Live barcode scanning with the browser's own BarcodeDetector.
 *
 * No library and no network: where the API exists (Chrome, Android) it reads
 * the camera frames directly. The button that opens this is only shown when the
 * API and a camera are both present, so this always has something to do.
 */
function BarcodeScanner({ d, onDetected, onClose }: { d: Dictionary; onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let cleanup = () => {};

    (async () => {
      try {
        if ("BarcodeDetector" in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Detector = (window as any).BarcodeDetector;
          const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play();
          let raf = 0;
          const tick = async () => {
            if (stopped || !videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes[0]?.rawValue) { onDetectedRef.current(String(codes[0].rawValue)); return; }
            } catch {
              /* a frame that will not decode — try the next one */
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
          cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((tr) => tr.stop()); };
        } else {
          // No native detector (iOS, Firefox): load the JS decoder on demand so
          // it never weighs on the initial bundle.
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          const reader = new BrowserMultiFormatReader();
          const video = videoRef.current;
          if (!video) return;
          const controls = await reader.decodeFromConstraints({ video: { facingMode: "environment" } }, video, (result) => {
            if (result && !stopped) onDetectedRef.current(result.getText());
          });
          cleanup = () => controls.stop();
        }
      } catch {
        setError(d.widgets.nutritionScanError);
      }
    })();

    return () => {
      stopped = true;
      cleanup();
    };
    // Started once when the scanner opens; the detection callback is read from a
    // ref so a parent re-render never tears the camera down mid-scan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/80 p-4" onClick={onClose}>
      <video ref={videoRef} className="max-h-[60vh] w-full max-w-md rounded-card" muted playsInline onClick={(e) => e.stopPropagation()} />
      {error ? <p className="text-sm text-danger">{error}</p> : <p className="text-sm text-white/80">{d.widgets.nutritionScanHint}</p>}
      <Button variant="ghost" onClick={onClose}>
        {d.common.close}
      </Button>
    </div>
  );
}

/** Turn a search-error code into something a person can act on. */
function searchErrorText(error: string, t: Dictionary["widgets"]): string {
  if (error.startsWith("ip:")) return fill(t.nutritionErrorIp, { ip: error.slice(3) || "—" });
  if (error === "auth" || error === "not-configured") return t.nutritionErrorAuth;
  return t.nutritionErrorApi;
}

function FoodResult({ d, match, onAdded, start }: { d: Dictionary; match: FoodMatch; onAdded: () => void; start: (fn: () => void) => void }) {
  const [grams, setGrams] = useState("100");
  const [open, setOpen] = useState(false);
  const per = match.per100;

  const g = Number(grams) || 0;
  const f = per ? g / 100 : 1;
  const scaled = per ? { kcal: per.kcal * f, protein: per.protein * f, fat: per.fat * f, carbs: per.carbs * f } : null;

  function add() {
    if (!scaled) return;
    start(() => void logFood({ name: match.name, ...scaled, grams: per ? g : null }).then(onAdded));
  }

  return (
    <div className="rounded-control bg-raised px-2 py-1.5 text-sm">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="min-w-0 flex-1 truncate">{match.name}</span>
        {per && <span className="shrink-0 text-xs text-faint">{per.kcal} / 100g</span>}
      </button>
      {open && (
        <div className="mt-1.5 flex items-center gap-2">
          {per ? (
            <>
              <Input value={grams} onChange={(e) => setGrams(e.target.value)} inputMode="numeric" className="w-16" />
              <span className="text-xs text-faint">g · {Math.round(scaled!.kcal)} {d.widgets.nutritionKcal}</span>
              <Button variant="quiet" onClick={add} className="ml-auto">
                ＋
              </Button>
            </>
          ) : (
            <span className="text-xs text-faint">{d.widgets.nutritionNoMacros}</span>
          )}
        </div>
      )}
    </div>
  );
}

function ManualForm({ d, onAdded, start, onCancel }: { d: Dictionary; onAdded: () => void; start: (fn: () => void) => void; onCancel?: () => void }) {
  const t = d.widgets;
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [f, setF] = useState("");
  const [c, setC] = useState("");

  function add() {
    if (!name.trim() || !kcal) return;
    start(() =>
      void logFood({ name, kcal: Number(kcal) || 0, protein: Number(p) || 0, fat: Number(f) || 0, carbs: Number(c) || 0 }).then(() => {
        setName(""); setKcal(""); setP(""); setF(""); setC("");
        onAdded();
      })
    );
  }

  return (
    <div className="space-y-2 border-t border-line p-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.nutritionName} />
      <div className="grid grid-cols-4 gap-1.5">
        <Field value={kcal} set={setKcal} ph={t.nutritionKcal} />
        <Field value={p} set={setP} ph={t.nutritionProtein} />
        <Field value={f} set={setF} ph={t.nutritionFat} />
        <Field value={c} set={setC} ph={t.nutritionCarbs} />
      </div>
      <div className="flex gap-2">
        <Button variant="quiet" onClick={add} disabled={!name.trim() || !kcal} className="flex-1">
          {d.common.add}
        </Button>
        {onCancel && (
          <Button variant="quiet" onClick={onCancel}>
            {d.common.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ value, set, ph }: { value: string; set: (v: string) => void; ph: string }) {
  return <Input value={value} onChange={(e) => set(e.target.value)} placeholder={ph} inputMode="numeric" className="text-center" />;
}

// ────────────────────────────── Profile ─────────────────────────────────

function ProfileForm({ d, profile, onSaved }: { d: Dictionary; profile: NutritionProfile | null; onSaved: () => void }) {
  const t = d.widgets;
  const [, start] = useTransition();
  const [weight, setWeight] = useState(String(profile?.weight ?? ""));
  const [height, setHeight] = useState(String(profile?.height ?? ""));
  const [age, setAge] = useState(String(profile?.age ?? ""));
  const [sex, setSex] = useState<NutritionProfile["sex"]>(profile?.sex ?? "male");
  const [activity, setActivity] = useState<NutritionProfile["activity"]>(profile?.activity ?? "moderate");
  const [goal, setGoal] = useState<NutritionProfile["goal"]>(profile?.goal ?? "maintain");

  function save() {
    start(() =>
      void saveNutritionProfile({
        weight: Number(weight) || 0,
        height: Number(height) || 0,
        age: Number(age) || 0,
        sex,
        activity,
        goal,
      }).then(onSaved)
    );
  }

  const valid = Number(weight) > 0 && Number(height) > 0 && Number(age) > 0;

  return (
    <div className="space-y-2.5 p-3">
      <div className="grid grid-cols-3 gap-2">
        <Labeled label={t.nutritionWeight}>
          <Input value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" className="text-center" />
        </Labeled>
        <Labeled label={t.nutritionHeight}>
          <Input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="numeric" className="text-center" />
        </Labeled>
        <Labeled label={t.nutritionAge}>
          <Input value={age} onChange={(e) => setAge(e.target.value)} inputMode="numeric" className="text-center" />
        </Labeled>
      </div>
      <Labeled label={t.nutritionSex}>
        <Select value={sex} onChange={(e) => setSex(e.target.value as NutritionProfile["sex"])}>
          <option value="male">{t.nutritionMale}</option>
          <option value="female">{t.nutritionFemale}</option>
        </Select>
      </Labeled>
      <Labeled label={t.nutritionActivity}>
        <Select value={activity} onChange={(e) => setActivity(e.target.value as NutritionProfile["activity"])}>
          <option value="sedentary">{t.nutritionActSedentary}</option>
          <option value="light">{t.nutritionActLight}</option>
          <option value="moderate">{t.nutritionActModerate}</option>
          <option value="active">{t.nutritionActActive}</option>
          <option value="very">{t.nutritionActVery}</option>
        </Select>
      </Labeled>
      <Labeled label={t.nutritionGoal}>
        <Select value={goal} onChange={(e) => setGoal(e.target.value as NutritionProfile["goal"])}>
          <option value="lose">{t.nutritionGoalLose}</option>
          <option value="maintain">{t.nutritionGoalMaintain}</option>
          <option value="gain">{t.nutritionGoalGain}</option>
        </Select>
      </Labeled>
      <Button variant="primary" onClick={save} disabled={!valid} className="w-full">
        {d.common.save}
      </Button>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-faint">{label}</span>
      {children}
    </label>
  );
}

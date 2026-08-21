import "server-only";

/**
 * A small iCalendar reader.
 *
 * Enough of RFC 5545 to put the next few events of any `.ics` feed on a tile —
 * a shared family calendar, a sports schedule, a release calendar — without a
 * dependency and without the account-linking the Google widget needs. Read-only
 * and forgiving: an event it cannot parse is skipped, not fatal.
 */

export type IcalEvent = { summary: string; at: number; allDay: boolean };

export async function readIcal(url: string, limit = 8): Promise<IcalEvent[] | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const text = unfold(await res.text());

    const now = Date.now();
    const events: IcalEvent[] = [];
    for (const block of text.split("BEGIN:VEVENT").slice(1)) {
      const body = block.split("END:VEVENT")[0];
      const summary = decode(field(body, "SUMMARY"));
      const dt = rawField(body, "DTSTART");
      if (!summary || !dt) continue;
      const parsed = parseDate(dt.value, dt.params);
      if (!parsed) continue;
      // Only what is still to come, plus events still running today.
      if (parsed.at < now - 12 * 3600_000) continue;
      events.push({ summary, at: parsed.at, allDay: parsed.allDay });
    }

    return events.sort((a, b) => a.at - b.at).slice(0, limit);
  } catch {
    return null;
  }
}

/** RFC 5545 folds long lines by starting the continuation with a space or tab. */
function unfold(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function field(body: string, name: string): string {
  return rawField(body, name)?.value ?? "";
}

/** A property with its parameters: "DTSTART;VALUE=DATE:20250101" → value + params. */
function rawField(body: string, name: string): { value: string; params: string } | null {
  const re = new RegExp(`^${name}([^:\\n]*):(.*)$`, "im");
  const m = re.exec(body);
  if (!m) return null;
  return { params: m[1], value: m[2].trim() };
}

function parseDate(value: string, params: string): { at: number; allDay: boolean } | null {
  // All-day: DTSTART;VALUE=DATE:20250131
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (dateOnly || /VALUE=DATE\b/i.test(params)) {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(value);
    if (!m) return null;
    return { at: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime(), allDay: true };
  }
  // Date-time: 20250131T140000Z or 20250131T140000 (local/floating).
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!dt) return null;
  const [, y, mo, d, h, mi, s, z] = dt;
  const at = z === "Z"
    ? Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
    : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
  return { at, allDay: false };
}

function decode(s: string): string {
  return s.replace(/\\n/g, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

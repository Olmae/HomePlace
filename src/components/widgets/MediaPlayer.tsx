"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { readMediaPlayers, sendMediaCommand, setMediaValue, sendMediaPhrase } from "@/actions/media";
import type { Dictionary } from "@/i18n";

/**
 * The speaker, on the board.
 *
 * The remote people reach for most often is the one for whatever is playing in
 * the room, and going to Home Assistant for it means opening an app to press a
 * button. So the cover, the track and the transport live on the dashboard, and
 * the same player opens full screen when the tile is too small to be a remote.
 *
 * Two rules shape this component:
 *
 * - Buttons the speaker cannot obey are not drawn. Home Assistant publishes a
 *   feature bitmask per player; a dead "next track" on a radio stream is worse
 *   than no button at all.
 * - The truth is the speaker's. Every press answers with the player's fresh
 *   state and that replaces what is on screen, so a press made from a phone,
 *   from Home Assistant, or from the speaker's own buttons all converge. The
 *   only thing invented locally is the progress bar between polls.
 */

export type Player = {
  id: string;
  name: string;
  state: string;
  title?: string;
  artist?: string;
  album?: string;
  art?: string;
  volume?: number;
  muted?: boolean;
  position?: number;
  duration?: number;
  positionAt?: number;
  source?: string;
  sources: string[];
  shuffle?: boolean;
  repeat?: "off" | "all" | "one";
  can: {
    pause: boolean;
    play: boolean;
    stop: boolean;
    next: boolean;
    previous: boolean;
    volumeSet: boolean;
    volumeMute: boolean;
    seek: boolean;
    selectSource: boolean;
    turnOn: boolean;
    turnOff: boolean;
    shuffle: boolean;
    repeat: boolean;
  };
};

/** What the transport may ask for — the allowlist the lib enforces, narrowed. */
type Cmd =
  | "play_pause"
  | "stop"
  | "next"
  | "previous"
  | "turn_on"
  | "turn_off"
  | "mute"
  | "unmute"
  | "shuffle_on"
  | "shuffle_off"
  | "repeat_off"
  | "repeat_all"
  | "repeat_one";

type Answer = { ok: boolean; error?: string; players?: Player[] };

/** The same picture by two routes: through the panel, and straight from HA. */
type Cover = { proxied?: string; direct?: string };

/** Where this browser remembers the wall it likes. */
const WALL_KEY = "homeplace:media-wall";

/** How the wall behind the full-screen player behaves. */
export type Background = "drift" | "aurora" | "waves" | "beams" | "pulse" | "still";

export const BACKGROUNDS: Background[] = ["aurora", "waves", "beams", "pulse", "drift", "still"];

/** The operator's own button: a phrase this player understands. */
export type Phrase = { service: string; phrase: string; label?: string };

/**
 * Watch the tile's own height and say when it is too short to be a full remote.
 *
 * The dashboard tile is a fixed box the operator resizes; there is no media
 * query for "this tile is small", only for the window. A ResizeObserver on the
 * body is what lets a two-row tile drop the volume and the source line to keep
 * the cover and the transport, instead of spilling over the tile beneath it.
 */
function useCompact(threshold = 300) {
  const ref = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height ?? 0;
      if (h > 0) setCompact(h < threshold);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [threshold]);

  return { ref, compact };
}

export function MediaPlayerWidget({
  d,
  title,
  players: initial,
  canControl,
  background = "drift",
  like,
}: {
  d: Dictionary;
  title: string;
  players: Player[];
  canControl: boolean;
  background?: Background;
  like?: Phrase | null;
}) {
  const [players, setPlayers] = useState(initial);
  const [chosen, setChosen] = useState<string | null>(initial[0]?.id ?? null);
  const [full, setFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  // Below this height the tile keeps the cover and the transport and sheds the
  // rest, so it fits instead of overflowing.
  const { ref: bodyRef, compact } = useCompact(300);

  // The ids this tile was configured with, not the ones currently in state:
  // a poll must ask for the same set every time, or a player that dropped out
  // once would never be asked about again.
  const ids = useRef(initial.map((p) => p.id));

  const player = players.find((p) => p.id === chosen) ?? players[0];
  // The whole tile is tinted by whatever is on the turntable; --art falls back
  // to the panel's accent, so nothing depends on the picture being readable.
  // Reset per picture: one cover that would not come through the proxy must not
  // condemn the next track to the accent colour for ever.
  const [proxyFailed, setProxyFailed] = useState<string | null>(null);
  const art: Cover = {
    proxied: proxyFailed === player?.art ? undefined : proxied(player?.art),
    direct: player?.art,
  };
  const colours = useCoverColors(art.proxied);
  // Two and three fall back to the one before them, so a cover with a single
  // strong colour still produces a gradient rather than a hole.
  const tint = {
    ["--art" as string]: colours[0] ?? "var(--accent)",
    ["--art-2" as string]: colours[1] ?? colours[0] ?? "var(--accent)",
    ["--art-3" as string]: colours[2] ?? colours[1] ?? colours[0] ?? "var(--accent)",
  };

  /** Merge one player's fresh state into the list, leaving the others alone. */
  const merge = useCallback((fresh: Player[]) => {
    setPlayers((prev) => {
      const next = prev.map((p) => fresh.find((f) => f.id === p.id) ?? p);
      // A player the tile did not know about yet (first poll after it appeared).
      for (const f of fresh) if (!next.some((p) => p.id === f.id)) next.push(f);
      return next;
    });
  }, []);

  /** Apply a change to one player at once, before the speaker has confirmed it. */
  const patch = useCallback((id: string, changes: Partial<Player>) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
  }, []);

  const readNow = useCallback(async () => {
    const r = await readMediaPlayers(ids.current);
    if (r.ok && r.players) merge(r.players as Player[]);
  }, [merge]);

  // Whether anything is playing, read by the poll loop without re-subscribing.
  const anyPlaying = useRef(false);
  useEffect(() => {
    anyPlaying.current = players.some(isPlaying);
  }, [players]);

  /*
   * Polling that follows the music.
   *
   * A stopped speaker changes state rarely, so asking every ten seconds is
   * waste; a playing one can change track any second, and a ten-second poll is
   * why the new track's clock only started moving after a visible pause. So it
   * asks every four seconds while something plays and every twenty when nothing
   * does, and not at all while the tab is hidden — a dashboard left open on a
   * second monitor should not keep a speaker's API busy all day.
   */
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        await readNow();
      }
      if (stopped) return;
      timer = setTimeout(tick, (anyPlaying.current ? 4 : 20) * 1000);
    };

    timer = setTimeout(tick, (anyPlaying.current ? 4 : 20) * 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [readNow]);

  function run(action: () => Promise<Answer>) {
    if (!canControl) return;
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? d.common.error);
      else if (result.players) merge(result.players);
    });
  }

  /**
   * A command, shown before it is confirmed.
   *
   * The speaker is the truth, but the round trip to Home Assistant and back is
   * long enough that a play button that does nothing until it returns feels
   * broken — you press again. So the obvious effect of each command is applied
   * locally at once and the speaker's real answer replaces it a moment later; a
   * track change also triggers an immediate re-read so its new clock and cover
   * arrive without waiting for the next poll.
   */
  const command = (id: string, cmd: Cmd) => {
    const p = players.find((x) => x.id === id);
    if (p) {
      const optimistic: Partial<Player> = {
        play_pause: { state: isPlaying(p) ? "paused" : "playing", positionAt: Date.now() },
        stop: { state: "idle" },
        turn_on: { state: "idle" },
        turn_off: { state: "off" },
        mute: { muted: true },
        unmute: { muted: false },
        shuffle_on: { shuffle: true },
        shuffle_off: { shuffle: false },
        repeat_off: { repeat: "off" as const },
        repeat_all: { repeat: "all" as const },
        repeat_one: { repeat: "one" as const },
        next: {},
        previous: {},
      }[cmd];
      if (optimistic) patch(id, optimistic);
    }
    run(() => sendMediaCommand(id, cmd));
    // A skip lands on a new track; read it back promptly so the position, the
    // title and the cover are the new ones rather than the last poll's.
    if (cmd === "next" || cmd === "previous") setTimeout(() => void readNow(), 700);
  };

  const setValue = (id: string, what: "volume" | "seek" | "source", value: number | string) =>
    run(() => setMediaValue(id, what, value));

  // The like button answers instantly and on its own: the phrase went to the
  // speaker, which is all anyone wants to know, and waiting for a poll to prove
  // it would leave the button looking dead for ten seconds.
  const [praised, setPraised] = useState(false);
  function say(id: string) {
    if (!like) return;
    setPraised(true);
    setTimeout(() => setPraised(false), 1600);
    run(() => sendMediaPhrase(id, like.service, like.phrase));
  }

  if (!player) {
    return (
      <Card className="h-full">
        <CardHeader title={title} icon="🔊" />
        <p className="p-4 text-sm text-muted">{d.media.noPlayers}</p>
      </Card>
    );
  }

  return (
    <>
      <Card className="flex h-full flex-col overflow-hidden" style={tint}>
        <CardHeader
          title={title}
          icon="🔊"
          action={
            <button
              type="button"
              onClick={() => setFull(true)}
              className="rounded-control px-1.5 py-0.5 text-xs text-muted transition-colors hover:bg-raised hover:text-text"
              aria-label={d.media.fullscreen}
              title={d.media.fullscreen}
            >
              ⤢
            </button>
          }
        />

        <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          {/* The player switcher is the first thing to go when the tile is
              short: it is the least-used control and costs a whole row. */}
          {players.length > 1 && !compact && (
            <div className="flex flex-wrap gap-1">
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setChosen(p.id)}
                  className={`rounded-control border px-2 py-0.5 text-[11px] transition-colors ${
                    p.id === player.id ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-raised"
                  }`}
                >
                  {isPlaying(p) && <span aria-hidden>♪ </span>}
                  {p.name}
                </button>
              ))}
            </div>
          )}

          <Now
            d={d}
            player={player}
            art={art}
            compact={compact}
            onFallback={() => setProxyFailed(player?.art ?? null)}
            onOpen={() => setFull(true)}
          />

          <Progress d={d} player={player} canControl={canControl} onSeek={(s) => setValue(player.id, "seek", s)} />

          <Transport
            d={d}
            player={player}
            canControl={canControl}
            onCommand={(c) => command(player.id, c)}
            size="sm"
            like={like ? { ...like, praised, onSay: () => say(player.id) } : null}
          />

          {/* Volume stays whatever the tile's shape — a remote without it is
              half a remote. On a short tile the body scrolls to reach it rather
              than dropping it. */}
          {player.can.volumeSet && (
            <Volume
              d={d}
              player={player}
              canControl={canControl}
              onVolume={(v) => setValue(player.id, "volume", v)}
              onMute={() => command(player.id, player.muted ? "unmute" : "mute")}
            />
          )}

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </Card>

      {full && (
        <FullScreen
          d={d}
          player={player}
          art={art}
          tint={tint}
          background={background}
          like={like ? { ...like, praised, onSay: () => say(player.id) } : null}
          onFallback={() => setProxyFailed(player?.art ?? null)}
          players={players}
          canControl={canControl}
          onClose={() => setFull(false)}
          onChoose={setChosen}
          onCommand={(c) => command(player.id, c)}
          onSeek={(s) => setValue(player.id, "seek", s)}
          onVolume={(v) => setValue(player.id, "volume", v)}
          onSource={(s) => setValue(player.id, "source", s)}
          error={error}
        />
      )}
    </>
  );
}

// ───────────────────────────────── Pieces ────────────────────────────────

function isPlaying(p: Player): boolean {
  return p.state === "playing";
}

function isOff(p: Player): boolean {
  return p.state === "off" || p.state === "unavailable" || p.state === "standby";
}

/**
 * The cover.
 *
 * Tries the panel's proxy first, because only a same-origin picture can be read
 * for its colour, and falls back to the address Home Assistant gave out if that
 * fails for any reason. The picture is the point; the colour is a bonus, and a
 * bonus must never be able to take the picture away.
 */
function Art({
  art,
  className,
  onFallback,
  animate = false,
}: {
  art: Cover;
  className: string;
  onFallback: () => void;
  /** Play the rise-out-of-blur entrance once per new picture. */
  animate?: boolean;
}) {
  const [src, setSrc] = useState(art.proxied ?? art.direct);

  // A new track means a new picture: without this the element would keep
  // showing whatever the last src resolved to.
  useEffect(() => {
    setSrc(art.proxied ?? art.direct);
  }, [art.proxied, art.direct]);

  if (!src) return null;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- the image optimiser
    // would have to be told about a domain the operator chooses at runtime.
    <img
      // Keyed on the src so a new track remounts the element and the entrance
      // animation runs again instead of only on the very first cover.
      key={animate ? src : undefined}
      src={src}
      alt=""
      className={`${className} ${animate ? "hp-cover-in" : ""}`}
      onError={() => {
        if (src !== art.direct && art.direct) {
          setSrc(art.direct);
          onFallback();
        }
      }}
    />
  );
}

/** What is on: the cover, the track, and nothing else competing with them. */
function Now({
  d,
  player,
  art,
  onFallback,
  onOpen,
  compact = false,
}: {
  d: Dictionary;
  player: Player;
  art: Cover;
  onFallback: () => void;
  onOpen: () => void;
  /** A short tile: smaller cover, and the player/source line drops away. */
  compact?: boolean;
}) {
  const line = player.title ?? (isOff(player) ? d.media.off : d.media.idle);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={d.media.fullscreen}
        className={`relative shrink-0 overflow-hidden rounded-control border border-line bg-raised transition-transform hover:scale-[1.03] ${
          compact ? "h-14 w-14" : "h-20 w-20"
        }`}
        style={{ boxShadow: "0 4px 18px -8px rgb(var(--art) / 0.8)" }}
      >
        <Art art={art} className="h-full w-full object-cover" onFallback={onFallback} animate />
        {!art.proxied && !art.direct && (
          <span className="flex h-full w-full items-center justify-center text-2xl" aria-hidden>
            ♪
          </span>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <p className={`truncate font-semibold ${compact ? "text-sm" : "text-base"}`} title={line}>
          {line}
        </p>
        {player.artist && (
          <p className="truncate text-sm text-muted" title={player.artist}>
            {player.artist}
          </p>
        )}
        {!compact && (
          <p className="truncate text-[11px] text-faint">
            {player.name}
            {player.source ? ` · ${player.source}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The progress bar, which runs on its own between polls.
 *
 * Home Assistant reports the position and the moment it was measured; a
 * playing track has moved on since. Ticking locally is what keeps the bar from
 * jumping forward once every ten seconds and standing still in between.
 */
function Progress({
  d,
  player,
  canControl,
  onSeek,
}: {
  d: Dictionary;
  player: Player;
  canControl: boolean;
  onSeek: (seconds: number) => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isPlaying(player)) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [player]);

  if (player.duration === undefined || player.duration <= 0 || player.position === undefined) return null;

  const drift = isPlaying(player) && player.positionAt ? (now - player.positionAt) / 1000 : 0;
  const position = Math.min(player.position + drift, player.duration);
  const percent = (position / player.duration) * 100;
  const seekable = canControl && player.can.seek;

  const spinning = isPlaying(player);

  return (
    <div>
      <div
        role={seekable ? "slider" : undefined}
        aria-label={seekable ? d.media.seek : undefined}
        aria-valuemin={seekable ? 0 : undefined}
        aria-valuemax={seekable ? Math.round(player.duration) : undefined}
        aria-valuenow={seekable ? Math.round(position) : undefined}
        tabIndex={seekable ? 0 : undefined}
        onClick={(e) => {
          if (!seekable) return;
          const box = e.currentTarget.getBoundingClientRect();
          onSeek(((e.clientX - box.left) / box.width) * player.duration!);
        }}
        onKeyDown={(e) => {
          if (!seekable) return;
          const step = e.key === "ArrowRight" ? 10 : e.key === "ArrowLeft" ? -10 : 0;
          if (!step) return;
          e.preventDefault();
          onSeek(Math.max(0, Math.min(player.duration!, position + step)));
        }}
        // Tall enough for the spiral to have somewhere to go; the bar itself
        // stays 6px and sits in the middle of it.
        className={`relative flex h-8 w-full items-center ${seekable ? "cursor-pointer" : ""}`}
      >
        {/* Behind the bar. Drawn first, thinner and dimmer, which is the whole
            trick: the same curve in front and behind, and the eye reads the two
            as one loop going round. */}
        <Helix half="back" percent={percent} spinning={spinning} />

        <div className="relative z-10 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full transition-[width] duration-1000 ease-linear"
            style={{
              width: `${percent}%`,
              background: "rgb(var(--art))",
              boxShadow: "0 0 10px rgb(var(--art) / 0.55)",
            }}
          />
        </div>

        <Helix half="front" percent={percent} spinning={spinning} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-faint">
        <span>{clock(position)}</span>
        <span>{clock(player.duration)}</span>
      </div>
    </div>
  );
}

// ────────────────────────────────── Spiral ───────────────────────────────

/*
 * A helix wound around the progress bar.
 *
 * The curve is a sine wave, and depth is a lie told with two of them: the half
 * of each turn where the wave is travelling away is drawn behind the bar, thin
 * and faint, and the half coming back towards the viewer is drawn in front,
 * thicker and brighter. Nothing rotates — the path is periodic, so sliding it
 * left by exactly one period is indistinguishable from spinning it, and costs
 * one composited transform instead of a redraw per frame.
 *
 * It fills with the track: both halves are clipped to the played fraction, so
 * the spiral is wound only as far as the music has gone.
 */
const PERIOD = 36; // user units per turn
const SPAN = 576; // long enough for the widest tile, plus one period to slide
const AMPLITUDE = 9;
const MIDLINE = 15;
const HEIGHT = 30;

/** One half of every turn, as a path: the front ones or the back ones. */
function helixPath(front: boolean): string {
  const step = 1.25;
  let path = "";
  let drawing = false;

  for (let x = 0; x <= SPAN; x += step) {
    const angle = (x / PERIOD) * Math.PI * 2;
    // cos is the depth axis of the same circle sin walks around: positive is
    // the near half of the turn.
    const near = Math.cos(angle) > 0;
    if (near !== front) {
      drawing = false;
      continue;
    }
    const y = MIDLINE + AMPLITUDE * Math.sin(angle);
    path += `${drawing ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
    drawing = true;
  }
  return path.trim();
}

const HELIX = { front: helixPath(true), back: helixPath(false) };

function Helix({ half, percent, spinning }: { half: "front" | "back"; percent: number; spinning: boolean }) {
  const front = half === "front";

  return (
    <svg
      viewBox={`0 0 ${SPAN} ${HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden
      className={`pointer-events-none absolute inset-0 h-8 w-full ${front ? "z-20" : "z-0"}`}
      // Only as far as the track has played. The transition matches the bar's,
      // so the spiral and the fill advance as one thing.
      style={{ clipPath: `inset(0 ${100 - percent}% 0 0)`, transition: "clip-path 1s linear" }}
    >
      <g className="hp-helix" data-spinning={spinning ? "true" : "false"}>
        <path
          d={front ? HELIX.front : HELIX.back}
          fill="none"
          stroke="rgb(var(--art))"
          strokeWidth={front ? 2.4 : 1.5}
          strokeLinecap="round"
          opacity={front ? 0.95 : 0.4}
          // Without this the non-uniform viewBox scaling would squash the
          // stroke along with the geometry.
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}

/**
 * The colours of the cover, as "r g b" triples for the CSS variables.
 *
 * Read from the artwork the browser has already downloaded, through the panel's
 * own proxy — a canvas that has touched a cross-origin image refuses to be read,
 * so this only works because the picture comes back through our origin.
 *
 * Not the average, which on any real cover is mud. Pixels are bucketed by hue
 * and weighted by how colourful they are, and the three heaviest buckets that
 * are not the same colour twice come back — the shades someone would name if
 * asked what the sleeve looks like.
 */
function useCoverColors(art: string | undefined): string[] {
  const [colours, setColours] = useState<string[]>([]);

  useEffect(() => {
    setColours([]);
    if (!art) return;

    let cancelled = false;
    const image = new Image();
    image.src = art;

    image.onload = () => {
      if (cancelled) return;
      try {
        const size = 32;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, size, size);
        const found = palette(ctx.getImageData(0, 0, size, size).data);
        if (found.length > 0 && !cancelled) setColours(found);
      } catch {
        // Tainted canvas, or a browser that will not decode it: the panel's own
        // accent stays, which is a perfectly good colour.
      }
    };

    return () => {
      cancelled = true;
    };
  }, [art]);

  return colours;
}

/** Up to three colours, heaviest first, no two of them near-identical. */
function palette(pixels: Uint8ClampedArray): string[] {
  const buckets = new Map<number, { weight: number; r: number; g: number; b: number }>();

  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (a < 200) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    // Near-black and near-white pixels carry no hue and would otherwise win by
    // sheer count on any cover with a dark background.
    if (max < 40 || min > 225 || chroma < 25) continue;

    const hue = hueOf(r, g, b, max, chroma);
    const key = Math.round(hue / 24); // fifteen buckets around the wheel
    const found = buckets.get(key) ?? { weight: 0, r: 0, g: 0, b: 0 };
    const weight = chroma / 255;
    buckets.set(key, {
      weight: found.weight + weight,
      r: found.r + r * weight,
      g: found.g + g * weight,
      b: found.b + b * weight,
    });
  }

  const ranked = [...buckets.values()]
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((b) => [b.r / b.weight, b.g / b.weight, b.b / b.weight] as const);

  const chosen: (readonly [number, number, number])[] = [];
  for (const colour of ranked) {
    // Two shades of the same red make a gradient nobody can see. Distance in
    // plain RGB is crude and entirely good enough at this size.
    if (chosen.some((c) => distance(c, colour) < 60)) continue;
    chosen.push(colour);
    if (chosen.length === 3) break;
  }

  return chosen.map(([r, g, b]) => lift(r, g, b));
}

function distance(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function hueOf(r: number, g: number, b: number, max: number, chroma: number): number {
  const hue = max === r ? (g - b) / chroma : max === g ? 2 + (b - r) / chroma : 4 + (r - g) / chroma;
  return ((hue * 60) % 360 + 360) % 360;
}

/**
 * Keep the colour readable in both themes.
 *
 * A cover's own colour can be nearly black or a pastel that vanishes on white.
 * The hue is what makes the tile feel like the record; the lightness is ours to
 * decide, so it is pushed into a band that works on either background.
 */
function lift(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const scale = max < 150 ? 150 / Math.max(max, 1) : max > 225 ? 225 / max : 1;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * scale)));
  return `${clamp(r)} ${clamp(g)} ${clamp(b)}`;
}

/** Cover art routed through the panel, so the canvas above may read it. */
function proxied(art: string | undefined): string | undefined {
  return art ? `/api/ha-art?u=${encodeURIComponent(art)}` : undefined;
}

/** Only the buttons this player says it obeys. */
function Transport({
  d,
  player,
  canControl,
  onCommand,
  size,
  like,
  power = true,
}: {
  d: Dictionary;
  player: Player;
  canControl: boolean;
  onCommand: (command: Cmd) => void;
  size: "sm" | "lg";
  like?: (Phrase & { praised: boolean; onSay: () => void }) | null;
  /** Off. The full screen puts it up by the close button instead. */
  power?: boolean;
}) {
  const small = size === "sm";
  const button = `flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
    small ? "h-10 w-10" : "h-14 w-14"
  } text-muted hover:bg-raised hover:text-text`;
  const main = `flex shrink-0 items-center justify-center rounded-full text-white transition-transform disabled:opacity-40 hover:scale-105 ${
    small ? "h-12 w-12" : "h-[4.5rem] w-[4.5rem]"
  }`;
  // The one coloured control takes the record's colour, and carries a little of
  // it into the shadow so it sits on the tile rather than on top of it.
  const mainStyle = { background: "rgb(var(--art))", boxShadow: "0 6px 18px -8px rgb(var(--art))" };
  const glyph = small ? 18 : 26;

  if (isOff(player)) {
    return (
      <div className="flex items-center justify-center">
        <button
          type="button"
          disabled={!canControl || !player.can.turnOn}
          onClick={() => onCommand("turn_on")}
          className={main}
          style={mainStyle}
          aria-label={d.media.turnOn}
        >
          <Glyph name="power" size={glyph} />
        </button>
      </div>
    );
  }

  const toggled = "text-[rgb(var(--art))] hover:text-[rgb(var(--art))]";
  // An empty slot the size of a side button, so the play control stays dead
  // centre even when a stream offers no previous or next.
  const spacer = <span className={button} aria-hidden />;

  const secondary =
    player.can.shuffle || player.can.repeat || !!like || player.can.stop || (power && player.can.turnOff);

  return (
    <div className={`flex flex-col items-center ${small ? "gap-2" : "gap-3"}`}>
      {/* Primary transport: previous · play · next, the play button always in
          the middle. Missing side controls leave their slot, not a gap. */}
      <div className={`flex items-center justify-center ${small ? "gap-3" : "gap-5"}`}>
        {player.can.previous ? (
          <button type="button" disabled={!canControl} onClick={() => onCommand("previous")} className={button} aria-label={d.media.previous}>
            <Glyph name="previous" size={small ? 18 : 24} />
          </button>
        ) : (
          spacer
        )}

        <button
          type="button"
          disabled={!canControl || !(player.can.play || player.can.pause)}
          onClick={() => onCommand("play_pause")}
          className={main}
          style={mainStyle}
          aria-label={isPlaying(player) ? d.media.pause : d.media.play}
        >
          <Glyph name={isPlaying(player) ? "pause" : "play"} size={glyph} />
        </button>

        {player.can.next ? (
          <button type="button" disabled={!canControl} onClick={() => onCommand("next")} className={button} aria-label={d.media.next}>
            <Glyph name="next" size={small ? 18 : 24} />
          </button>
        ) : (
          spacer
        )}
      </div>

      {/* Secondary controls: shuffle, repeat, like, stop, power — wrapped and
          centred under the transport, so a narrow tile drops them to a second
          line instead of shoving the play button off centre. */}
      {secondary && (
        <div className={`flex flex-wrap items-center justify-center ${small ? "gap-1.5" : "gap-3"}`}>
          {player.can.shuffle && (
            <button
              type="button"
              disabled={!canControl}
              onClick={() => onCommand(player.shuffle ? "shuffle_off" : "shuffle_on")}
              className={`${button} ${player.shuffle ? toggled : ""}`}
              aria-pressed={player.shuffle ?? false}
              aria-label={d.media.shuffle}
              title={d.media.shuffle}
            >
              <Glyph name="shuffle" size={small ? 16 : 22} />
            </button>
          )}

          {player.can.repeat && (
            <button
              type="button"
              disabled={!canControl}
              onClick={() => onCommand(player.repeat === "off" || !player.repeat ? "repeat_all" : player.repeat === "all" ? "repeat_one" : "repeat_off")}
              className={`${button} ${player.repeat && player.repeat !== "off" ? toggled : ""}`}
              aria-label={player.repeat === "one" ? d.media.repeatOne : d.media.repeat}
              title={player.repeat === "one" ? d.media.repeatOne : d.media.repeat}
            >
              <Glyph name={player.repeat === "one" ? "repeatOne" : "repeat"} size={small ? 16 : 22} />
            </button>
          )}

          {like && (
            <button
              type="button"
              disabled={!canControl}
              onClick={like.onSay}
              className={`${button} ${like.praised ? "scale-110 text-[rgb(var(--art))]" : ""} transition-transform`}
              aria-label={like.label || d.media.like}
              title={like.label || d.media.like}
            >
              <Glyph name="heart" size={small ? 17 : 23} filled={like.praised} />
            </button>
          )}

          {player.can.stop && (
            <button type="button" disabled={!canControl} onClick={() => onCommand("stop")} className={button} aria-label={d.media.stop}>
              <Glyph name="stop" size={small ? 14 : 20} />
            </button>
          )}

          {power && player.can.turnOff && (
            <button type="button" disabled={!canControl} onClick={() => onCommand("turn_off")} className={button} aria-label={d.media.turnOff}>
              <Glyph name="power" size={small ? 16 : 22} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Transport icons as geometry, not as text.
 *
 * The ⏸ and ▶ characters are drawn by whatever font the system hands over: they
 * sit at different heights, carry their own side bearings, and the triangle is
 * usually a pixel or two left of where its own bounding box says it is. Inside a
 * round button that reads as crooked. Drawn here, each shape is centred on the
 * same 24-unit box — and the play triangle is nudged right by its own optical
 * centre, which is the one place where "mathematically centred" looks wrong.
 */
function Glyph({
  name,
  size,
  filled,
}: {
  name:
    | "play"
    | "pause"
    | "next"
    | "previous"
    | "stop"
    | "power"
    | "shuffle"
    | "repeat"
    | "repeatOne"
    | "heart"
    | "palette";
  size: number;
  /** The heart only: filled while the phrase is on its way. */
  filled?: boolean;
}) {
  const shapes: Record<string, JSX.Element> = {
    play: <path d="M9 5.5 19 12 9 18.5Z" fill="currentColor" />,
    pause: (
      <g fill="currentColor">
        <rect x="8" y="5.5" width="3.2" height="13" rx="1.1" />
        <rect x="12.8" y="5.5" width="3.2" height="13" rx="1.1" />
      </g>
    ),
    next: (
      <g fill="currentColor">
        <path d="M6 5.5 15 12 6 18.5Z" />
        <rect x="16" y="5.5" width="2.4" height="13" rx="1.1" />
      </g>
    ),
    previous: (
      <g fill="currentColor">
        <path d="M18 5.5 9 12l9 6.5Z" />
        <rect x="5.6" y="5.5" width="2.4" height="13" rx="1.1" />
      </g>
    ),
    stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />,
    palette: (
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
        <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.6 0-.8.7-1.4 1.6-1.4h1.6A4.6 4.6 0 0 0 20.5 10c0-3.6-3.8-6.5-8.5-6.5Z" />
        <circle cx="8.2" cy="10.5" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="12" cy="7.8" r="1.15" fill="currentColor" stroke="none" />
        <circle cx="15.8" cy="10" r="1.15" fill="currentColor" stroke="none" />
      </g>
    ),
    shuffle: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 6.5h3.2c1.1 0 2 .5 2.7 1.4l4.4 6.2c.6.9 1.6 1.4 2.7 1.4h3" />
        <path d="M3.5 17.5h3.2c1.1 0 2-.5 2.7-1.4l.9-1.2" />
        <path d="M14.2 8.3l.7-1c.6-.5 1.6-.8 2.6-.8h3" />
        <path d="M17.8 4.2 20.5 6.5l-2.7 2.3M17.8 13.2l2.7 2.3-2.7 2.3" />
      </g>
    ),
    repeat: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 7.5h9.5a3 3 0 0 1 3 3v1" />
        <path d="M17.5 16.5H8a3 3 0 0 1-3-3v-1" />
        <path d="m8.5 5 -2 2.5 2 2.5M15.5 19l2-2.5-2-2.5" />
      </g>
    ),
    repeatOne: (
      <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 7.5h9.5a3 3 0 0 1 3 3v1" />
        <path d="M17.5 16.5H8a3 3 0 0 1-3-3v-1" />
        <path d="m8.5 5 -2 2.5 2 2.5M15.5 19l2-2.5-2-2.5" />
        <path d="M11.4 10.6 12.6 10v4" />
      </g>
    ),
    // Two circles and a point, which is what a heart is; drawn rather than
    // typed so it sits in the same box as the transport and does not arrive
    // as somebody's emoji font.
    heart: (
      <path
        d="M12 20s-7.2-4.4-7.2-9.2A4.1 4.1 0 0 1 12 8.1a4.1 4.1 0 0 1 7.2 2.7C19.2 15.6 12 20 12 20Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    ),
    power: (
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 4.5v6.5" />
        <path d="M7.4 7A6.6 6.6 0 1 0 16.6 7" />
      </g>
    ),
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="block">
      {shapes[name]}
    </svg>
  );
}

function Volume({
  d,
  player,
  canControl,
  onVolume,
  onMute,
  size = "sm",
}: {
  d: Dictionary;
  player: Player;
  canControl: boolean;
  onVolume: (level: number) => void;
  onMute: () => void;
  size?: "sm" | "lg";
}) {
  /*
   * Volume has to answer the finger, not the network.
   *
   * The slider follows the pointer immediately, and the speaker is told at most
   * every 150ms while dragging rather than once at the end — so the room gets
   * louder as you drag instead of when you let go. The local value then stands
   * for a moment after the last change: Home Assistant reports the volume from
   * before the call for a beat, and letting that land would snap the handle
   * backwards under the finger.
   */
  const [local, setLocal] = useState<number | null>(null);
  const send = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (send.current) clearTimeout(send.current);
      if (settle.current) clearTimeout(settle.current);
    };
  }, []);

  function slide(next: number) {
    setLocal(next);
    if (settle.current) clearTimeout(settle.current);
    if (send.current) return; // a call is already queued; it will pick up the latest
    send.current = setTimeout(() => {
      send.current = null;
      setLocal((current) => {
        if (current !== null) onVolume(current);
        return current;
      });
    }, 150);
  }

  function release() {
    if (send.current) {
      clearTimeout(send.current);
      send.current = null;
    }
    if (local !== null) onVolume(local);
    // Long enough for the answer to come back with the new number in it.
    settle.current = setTimeout(() => setLocal(null), 1200);
  }

  const level = local ?? player.volume ?? 0;
  const shown = Math.round(level * 100);

  return (
    <div className="flex items-center gap-2">
      {player.can.volumeMute && (
        <button
          type="button"
          disabled={!canControl}
          onClick={onMute}
          className="shrink-0 rounded-control px-1 text-sm text-muted transition-colors hover:bg-raised hover:text-text disabled:opacity-40"
          aria-label={player.muted ? d.media.unmute : d.media.mute}
        >
          {player.muted ? "🔇" : "🔊"}
        </button>
      )}
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(level * 100)}
        disabled={!canControl}
        aria-label={d.media.volume}
        onChange={(e) => slide(Number(e.target.value) / 100)}
        onPointerUp={release}
        onKeyUp={release}
        // The filled part of the track is the level, in the record's colour:
        // the number is confirmation, the bar is what is actually read.
        style={{ ["--fill" as string]: `${shown}%` }}
        className={`hp-range flex-1 ${size === "lg" ? "h-2" : ""}`}
      />
      <span
        className={`shrink-0 text-right font-mono tabular-nums ${
          size === "lg" ? "w-10 text-sm" : "w-8 text-xs"
        } ${local !== null ? "text-[rgb(var(--art))]" : "text-faint"}`}
      >
        {shown}
      </span>
    </div>
  );
}

/**
 * The wall behind the full-screen player.
 *
 * Three ways of being alive, chosen per widget, because how much movement is
 * pleasant and how much is distracting is not something one default can settle
 * — a player on a wall panel in the hallway and one open on a desk want
 * different answers:
 *
 * - `drift`  — the cover itself, blurred, slowly wandering. Quietest.
 * - `aurora` — the cover's own two or three colours as soft lights, each on its
 *   own path and its own timing, so they meet and part instead of pulsing
 *   together. The picture stays behind them, dimmer.
 * - `pulse`  — one gradient of the whole palette, breathing.
 * - `still`  — the picture, and nothing moving at all.
 *
 * Every one of them stops moving under `prefers-reduced-motion`, in the
 * stylesheet rather than here.
 */
function Wall({
  art,
  background,
  onFallback,
}: {
  art: Cover;
  background: Background;
  onFallback: () => void;
}) {
  // The cover is the ground under every one of them. It is nearly out of sight
  // under the moving ones — what it gives them is the colour of the room, not a
  // picture to look at.
  const cover = background === "drift" || background === "still" ? "opacity-40" : "opacity-20";

  return (
    <>
      <div className={`absolute inset-0 ${background === "drift" ? "hp-drift" : ""}`} aria-hidden>
        <Art art={art} className={`h-full w-full scale-125 object-cover blur-2xl ${cover}`} onFallback={onFallback} />
      </div>

      {background === "aurora" && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {/* Three lights on three timings that share no common multiple, so
              they meet and part instead of pulsing together and the pattern
              never quite repeats within the length of a track. */}
          <span className="hp-aurora hp-aurora-1" />
          <span className="hp-aurora hp-aurora-2" />
          <span className="hp-aurora hp-aurora-3" />
        </div>
      )}

      {background === "waves" && (
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {/* Discs far wider than the screen, rounded almost to circles and
              turning slowly: the edge that crosses the frame reads as a swell.
              Three of them, two turning one way and one the other, and the
              crossings are what makes it look like liquid rather than a wheel. */}
          <span className="hp-wave hp-wave-1" />
          <span className="hp-wave hp-wave-2" />
          <span className="hp-wave hp-wave-3" />
        </div>
      )}

      {background === "beams" && (
        // One cone of light per colour, swept round from the centre and blurred
        // until the edges are gone. Slow enough to read as light moving through
        // a room rather than as something spinning.
        <div className="hp-beams absolute inset-0" aria-hidden />
      )}

      {background === "pulse" && (
        // A gradient twice the size of its box, slid across it and breathing —
        // the colours keep arriving from somewhere instead of standing still.
        <div className="hp-pulse absolute inset-0" aria-hidden />
      )}

      <div className="absolute inset-0 bg-surface/60" aria-hidden />
    </>
  );
}

/**
 * The wall picker: every option as a square, alive, in this track's colours.
 *
 * Each square is the real `Wall` shrunk into a tile rather than a drawing of
 * one, so nothing here can drift out of step with what pressing it produces.
 * The choice is kept in the browser: the widget's own setting is the default
 * for everybody, and this is one person deciding what they want to look at
 * tonight, which is not worth a round trip or a row in the database.
 */
function WallPicker({
  d,
  art,
  value,
  onChange,
  onFallback,
}: {
  d: Dictionary;
  art: Cover;
  value: Background;
  onChange: (background: Background) => void;
  onFallback: () => void;
}) {
  const names: Record<Background, string> = {
    drift: d.media.bgDrift,
    aurora: d.media.bgAurora,
    waves: d.media.bgWaves,
    beams: d.media.bgBeams,
    pulse: d.media.bgPulse,
    still: d.media.bgStill,
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {BACKGROUNDS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`flex flex-col gap-1 rounded-control border p-1.5 text-left transition-colors ${
            option === value ? "border-[rgb(var(--art))] bg-white/10" : "border-line/60 hover:bg-white/5"
          }`}
        >
          <span className="hp-preview relative block aspect-square w-full overflow-hidden rounded bg-surface">
            <Wall art={art} background={option} onFallback={onFallback} />
          </span>
          <span className="truncate text-[10px] leading-tight text-muted">{names[option]}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * The player, taking the whole screen.
 *
 * A native `<dialog>` so Escape and the top layer come for free — the tile it
 * opens from lives inside a board that sets its own stacking and pointer rules,
 * and an overlay div would end up underneath one of them. The cover is used
 * twice: sharp in the middle, blurred and dimmed behind everything, which is
 * what makes a phone-sized remote look like it belongs to the music.
 */
function FullScreen({
  d,
  player,
  art,
  tint,
  background,
  like,
  onFallback,
  players,
  canControl,
  onClose,
  onChoose,
  onCommand,
  onSeek,
  onVolume,
  onSource,
  error,
}: {
  d: Dictionary;
  player: Player;
  art: Cover;
  tint: Record<string, string>;
  background: Background;
  like?: (Phrase & { praised: boolean; onSay: () => void }) | null;
  onFallback: () => void;
  players: Player[];
  canControl: boolean;
  onClose: () => void;
  onChoose: (id: string) => void;
  onCommand: (command: Cmd) => void;
  onSeek: (seconds: number) => void;
  onVolume: (level: number) => void;
  onSource: (source: string) => void;
  error: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [wall, setWall] = useState<Background>(background);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  // What this browser last chose wins over the widget's setting: the setting is
  // the default for everyone, the choice is this person, tonight.
  useEffect(() => {
    const saved = window.localStorage.getItem(WALL_KEY);
    if (saved && (BACKGROUNDS as string[]).includes(saved)) setWall(saved as Background);
  }, []);

  function choose(next: Background) {
    setWall(next);
    window.localStorage.setItem(WALL_KEY, next);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      style={tint}
      className="pointer-events-auto h-[100dvh] max-h-none w-screen max-w-none border-0 bg-surface p-0 text-text backdrop:bg-black/80"
    >
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden">
        <Wall art={art} background={wall} onFallback={onFallback} />

        {/* Off and close, together: both of them end the thing you are looking
            at, and looking for one of them in a corner is enough. */}
        <div className="absolute right-4 top-4 z-10 flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-raised ${
              picking ? "text-[rgb(var(--art))]" : "text-muted hover:text-text"
            }`}
            aria-label={d.media.background}
            title={d.media.background}
            aria-expanded={picking}
          >
            <Glyph name="palette" size={18} />
          </button>

          {player.can.turnOff && (
            <button
              type="button"
              disabled={!canControl}
              onClick={() => onCommand("turn_off")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-raised hover:text-danger disabled:opacity-40"
              aria-label={d.media.turnOff}
              title={d.media.turnOff}
            >
              <Glyph name="power" size={18} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm text-muted transition-colors hover:bg-raised hover:text-text"
            aria-label={d.common.close}
          >
            ✕
          </button>
        </div>

        {picking && (
          // Anchored under its own button rather than centred: the covers stay
          // visible while choosing, which is the whole point of previewing on
          // the track that is playing.
          <div className="absolute right-4 top-16 z-20 w-64 rounded-card border border-line bg-surface/95 p-2 shadow-pop backdrop-blur">
            <WallPicker d={d} art={art} value={wall} onChange={choose} onFallback={onFallback} />
          </div>
        )}

        <div className="relative z-10 flex w-full max-w-lg flex-col items-center gap-6 px-6">
          <div
            className="aspect-square w-full max-w-[min(78vw,24rem)] overflow-hidden rounded-card border border-line bg-raised"
            // The sleeve throws its own colour onto the wall behind it.
            style={{ boxShadow: "0 0 60px -10px rgb(var(--art) / 0.7)" }}
          >
            <Art art={art} className="h-full w-full object-cover" onFallback={onFallback} animate />
            {!art.proxied && !art.direct && (
              <span className="flex h-full w-full items-center justify-center text-6xl" aria-hidden>
                ♪
              </span>
            )}
          </div>

          <div className="w-full text-center">
            <p className="truncate text-xl font-semibold">{player.title ?? (isOff(player) ? d.media.off : d.media.idle)}</p>
            {player.artist && <p className="truncate text-base text-muted">{player.artist}</p>}
            {player.album && <p className="truncate text-xs text-faint">{player.album}</p>}
          </div>

          <div className="w-full">
            <Progress d={d} player={player} canControl={canControl} onSeek={onSeek} />
          </div>

          <Transport d={d} player={player} canControl={canControl} onCommand={onCommand} size="lg" like={like} power={false} />

          {player.can.volumeSet && (
            <div className="w-full">
              <Volume
                d={d}
                player={player}
                canControl={canControl}
                size="lg"
                onVolume={onVolume}
                onMute={() => onCommand(player.muted ? "unmute" : "mute")}
              />
            </div>
          )}

          {player.can.selectSource && player.sources.length > 0 && (
            <select
              value={player.source ?? ""}
              disabled={!canControl}
              onChange={(e) => onSource(e.target.value)}
              aria-label={d.media.source}
              className="w-full rounded-control border border-line bg-raised/80 px-3 py-2 text-sm text-text"
            >
              {!player.source && <option value="">{d.media.source}</option>}
              {player.sources.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          {players.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {players.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onChoose(p.id)}
                  className={`rounded-control border px-2.5 py-1 text-xs transition-colors ${
                    p.id === player.id ? "border-accent bg-accent/10 text-accent" : "border-line text-muted hover:bg-raised"
                  }`}
                >
                  {isPlaying(p) && <span aria-hidden>♪ </span>}
                  {p.name}
                </button>
              ))}
            </div>
          )}

          {!canControl && <p className="text-xs text-faint">{d.media.readOnly}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      </div>
    </dialog>
  );
}

/** m:ss, or h:mm:ss for the long ones. */
function clock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

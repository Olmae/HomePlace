import { Card } from "@/components/ui";
import { getSetting } from "@/lib/db";
import type { NowPlaying as State } from "@/app/api/now-playing/route";
import type { Dictionary } from "@/i18n";

/**
 * The track playing on a machine that pushes to /api/now-playing.
 *
 * Nothing here polls anything: the state is whatever was last posted. If the
 * sender stops — the PC sleeps, the script dies — the tile goes quiet after a
 * couple of minutes rather than freezing on a track from yesterday.
 */
export async function NowPlayingWidget({ title, d }: { title: string; d: Dictionary }) {
  const state = await getSetting<State | null>("nowplaying.state", null);
  const fresh = state && Date.now() - state.updatedAt < 120_000 && state.playing && state.title;

  if (!fresh) {
    return (
      <Card className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
        <span className="text-2xl opacity-40" aria-hidden>
          🎧
        </span>
        <p className="text-xs text-muted">{d.widgets.nothingPlaying}</p>
      </Card>
    );
  }

  const progress = state.duration && state.position ? Math.min(100, (state.position / state.duration) * 100) : null;

  return (
    <Card className="relative h-full overflow-hidden">
      {/* The cover art doubles as the background: a music tile without the
          artwork is just two lines of text. */}
      {state.art && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.art} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl opacity-40" />
          <div className="absolute inset-0 bg-surface/50" />
        </>
      )}

      <div className="relative flex h-full items-center gap-3 p-3">
        {state.art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={state.art} alt="" className="h-14 w-14 shrink-0 rounded object-cover shadow-card" />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-raised text-2xl" aria-hidden>
            🎵
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{state.title}</p>
          {state.artist && <p className="truncate text-xs text-muted">{state.artist}</p>}
          {progress !== null && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

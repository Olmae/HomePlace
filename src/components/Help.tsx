"use client";

import { useState } from "react";
import { Dialog } from "./Dialog";
import type { Dictionary } from "@/i18n";

/**
 * The question mark in the top bar.
 *
 * Six short paragraphs, no links to a wiki that will not exist. A self-hosted
 * panel is set up once, usually late at night, and the answer to "what does
 * this button do" should be one click away rather than in a README on another
 * screen.
 */
export function Help({ d }: { d: Dictionary }) {
  const [open, setOpen] = useState(false);

  const sections = [
    { title: d.help.dashboardTitle, text: d.help.dashboardText },
    { title: d.help.containersTitle, text: d.help.containersText },
    { title: d.help.monitoringTitle, text: d.help.monitoringText },
    { title: d.help.alertsTitle, text: d.help.alertsText },
    { title: d.help.nowPlayingTitle, text: d.help.nowPlayingText },
    { title: d.help.shortcutsTitle, text: d.help.shortcutsText },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={d.help.title}
        aria-label={d.help.title}
        className="flex h-8 w-8 items-center justify-center rounded-control text-sm text-muted transition-colors hover:bg-raised hover:text-text"
      >
        ?
      </button>

      {open && (
        <Dialog open onClose={() => setOpen(false)} title={d.help.title} wide>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">{d.help.intro}</p>
            {sections.map((section) => (
              <section key={section.title}>
                <h3 className="mb-1 text-sm font-semibold">{section.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{section.text}</p>
              </section>
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

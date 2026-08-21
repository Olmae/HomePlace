"use client";

import { useState, useTransition } from "react";
import { Card, CardHeader } from "@/components/ui";
import { Input, Button } from "@/components/form";
import { saveShopping } from "@/actions/shopping";
import type { ShoppingItem } from "@/lib/shopping";
import type { Dictionary } from "@/i18n";

/**
 * The shopping list on the board.
 *
 * Tick things off as they land in the basket, add a line, clear what is bought.
 * Shared with the Telegram bot — a line added on the way to the shop shows up
 * here — so it persists to the same setting the bot writes.
 */
export function ShoppingList({ d, title, items: initial, canControl }: { d: Dictionary; title: string; items: ShoppingItem[]; canControl: boolean }) {
  const [items, setItems] = useState<ShoppingItem[]>(initial);
  const [text, setText] = useState("");
  const [, startTransition] = useTransition();

  function persist(next: ShoppingItem[]) {
    setItems(next);
    startTransition(() => void saveShopping(next));
  }

  function add() {
    const t = text.trim();
    if (!t) return;
    persist([...items, { id: `s${Date.now().toString(36)}`, text: t, done: false }]);
    setText("");
  }

  const doneCount = items.filter((i) => i.done).length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={title}
        icon="🛒"
        action={
          doneCount > 0 && canControl ? (
            <button
              type="button"
              onClick={() => persist(items.filter((i) => !i.done))}
              className="text-[11px] text-faint transition-colors hover:text-text"
            >
              {d.widgets.shoppingClear}
            </button>
          ) : null
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1">
        {items.length === 0 && <p className="p-2 text-sm text-muted">{d.widgets.shoppingEmpty}</p>}
        {items.map((item) => (
          <label
            key={item.id}
            className="group flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-raised"
          >
            <input
              type="checkbox"
              checked={item.done}
              disabled={!canControl}
              onChange={() => persist(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
            />
            <span className={`min-w-0 flex-1 truncate ${item.done ? "text-faint line-through" : ""}`}>{item.text}</span>
            {canControl && (
              <button
                type="button"
                onClick={() => persist(items.filter((i) => i.id !== item.id))}
                className="shrink-0 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label={d.common.delete}
              >
                ✕
              </button>
            )}
          </label>
        ))}
      </div>
      {canControl && (
        <div className="flex gap-2 border-t border-line p-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={d.widgets.shoppingAdd}
            className="flex-1"
          />
          <Button variant="quiet" onClick={add} disabled={!text.trim()}>
            ＋
          </Button>
        </div>
      )}
    </Card>
  );
}

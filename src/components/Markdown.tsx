import { Fragment, type ReactNode } from "react";

/**
 * A small Markdown renderer, no dependency.
 *
 * A notes tile is a scratchpad, not a document, so this covers what a scratchpad
 * uses — headings, bold and italic, links, code, lists, task checkboxes, rules
 * and quotes — and renders anything it does not recognise as plain text. It is
 * line-based and deliberately forgiving; a stray asterisk should never throw.
 *
 * Links open in a new tab and inline HTML is never emitted, so a note cannot
 * become a way to inject markup into the page.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`my-1 ${list.ordered ? "list-decimal" : "list-disc"} space-y-0.5 pl-5`}>
        {list.items}
      </Tag>
    );
    list = null;
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();

    // Task item — a checkbox with a label.
    const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line);
    if (task) {
      flush();
      blocks.push(
        <label key={i} className="flex items-start gap-2 py-0.5 text-sm">
          <input type="checkbox" checked={task[1].toLowerCase() === "x"} readOnly className="mt-0.5" />
          <span className={task[1].toLowerCase() === "x" ? "text-faint line-through" : ""}>{inline(task[2])}</span>
        </label>
      );
      return;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || ordered) {
      const isOrdered = !!ordered;
      if (!list || list.ordered !== isOrdered) {
        flush();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push(<li key={i}>{inline((bullet ?? ordered)![1])}</li>);
      return;
    }

    flush();

    if (line === "") return;
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      blocks.push(<hr key={i} className="my-2 border-line" />);
      return;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = ["text-lg", "text-base", "text-sm", "text-xs"][level - 1];
      blocks.push(
        <p key={i} className={`mt-2 font-semibold tracking-tight ${size}`}>
          {inline(heading[2])}
        </p>
      );
      return;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(
        <blockquote key={i} className="my-1 border-l-2 border-line pl-3 text-sm text-muted">
          {inline(line.replace(/^>\s?/, ""))}
        </blockquote>
      );
      return;
    }
    blocks.push(
      <p key={i} className="text-sm leading-relaxed">
        {inline(line)}
      </p>
    );
  });
  flush();

  return <div className="space-y-0.5">{blocks}</div>;
}

/** Inline formatting: bold, italic, code, and links. */
function inline(text: string): ReactNode {
  // Split on the four inline constructs, keeping the delimiters via capture.
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((t, i) => {
    if (/^\*\*[^*]+\*\*$/.test(t)) return <strong key={i}>{t.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(t)) return <em key={i}>{t.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(t)) return <code key={i} className="rounded bg-raised px-1 font-mono text-[0.85em]">{t.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t);
    if (link) {
      const href = /^https?:\/\//i.test(link[2]) || link[2].startsWith("/") ? link[2] : `https://${link[2]}`;
      return (
        <a key={i} href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {link[1]}
        </a>
      );
    }
    return <Fragment key={i}>{t}</Fragment>;
  });
}

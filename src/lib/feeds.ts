import "server-only";

/**
 * A tolerant RSS/Atom reader.
 *
 * No XML dependency: a feed is a handful of `<item>` or `<entry>` blocks, and a
 * few regexes pull the title, link and date out of either dialect well enough
 * for a dashboard tile. Anything it cannot parse comes back empty rather than
 * throwing — a broken feed must not take a widget down.
 *
 * Good for release feeds (a GitHub repo's releases.atom), a blog, or the news.
 */

export type FeedItem = { title: string; link: string; at: number };
export type Feed = { title: string; items: FeedItem[] };

export async function readFeed(url: string, limit = 8): Promise<Feed | null> {
  try {
    const res = await fetch(url, {
      headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const xml = await res.text();

    const feedTitle = decode(first(xml.replace(/<(item|entry)[\s\S]*/i, ""), /<title[^>]*>([\s\S]*?)<\/title>/i));
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) ?? [];

    const items: FeedItem[] = blocks.slice(0, limit).map((block) => {
      const title = decode(first(block, /<title[^>]*>([\s\S]*?)<\/title>/i));
      // RSS puts the URL in <link>text</link>; Atom in <link href="…"/>.
      const link =
        first(block, /<link[^>]*href=["']([^"']+)["']/i) || decode(first(block, /<link[^>]*>([\s\S]*?)<\/link>/i));
      const dateStr =
        first(block, /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
        first(block, /<updated[^>]*>([\s\S]*?)<\/updated>/i) ||
        first(block, /<published[^>]*>([\s\S]*?)<\/published>/i) ||
        first(block, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i);
      return { title, link: link.trim(), at: Date.parse(dateStr) || 0 };
    });

    return { title: feedTitle || url, items: items.filter((i) => i.title) };
  } catch {
    return null;
  }
}

function first(text: string, re: RegExp): string {
  return re.exec(text)?.[1]?.trim() ?? "";
}

/** Unwrap CDATA and decode the handful of entities feeds actually use. */
function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

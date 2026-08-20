/**
 * The public status page's configuration.
 *
 * Off by default, because a panel is a private thing until its owner decides
 * otherwise. When on, it exposes only the services listed here — never the whole
 * board — as up/down with a day's uptime, at `/status`, with no sign-in.
 */
export type StatusPageConfig = {
  enabled: boolean;
  title: string;
  /** Item ids to show. Only checkable items are meaningful. */
  itemIds: string[];
};

export const STATUS_PAGE_KEY = "status.public";
export const EMPTY_STATUS_PAGE: StatusPageConfig = { enabled: false, title: "", itemIds: [] };

export function normalizeStatusPage(value: unknown): StatusPageConfig {
  const v = (value ?? {}) as Partial<StatusPageConfig>;
  return {
    enabled: v.enabled === true,
    title: typeof v.title === "string" ? v.title : "",
    itemIds: Array.isArray(v.itemIds) ? v.itemIds.filter((x): x is string => typeof x === "string") : [],
  };
}

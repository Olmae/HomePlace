import type { ValueFormat } from "./haFormat";

/**
 * The operator's own layer over the smart home.
 *
 * Home Assistant knows the entities, their rooms and their kinds; this holds
 * the three things it does not:
 *
 *  - **Groups** made by hand — "the desk", "everything on the balcony" — that
 *    cut across rooms and device kinds. Universal: nothing here is specific to
 *    any one house.
 *  - **Value formats**, per entity, so a duration reads as days and hours and a
 *    byte count reads as gigabytes. Empty means `auto`, which is almost always
 *    right on its own.
 *  - **Name overrides**, for the rare entity whose friendly name is still wrong
 *    after {@link prettyName} has done what it can.
 *
 * Pure, so the resolver runs in the browser where the page already lives.
 */

export type HomeGroup = {
  id: string;
  name: string;
  icon?: string;
  /** Entity ids that belong to this group. */
  members: string[];
};

export type HomeConfig = {
  groups: HomeGroup[];
  formats: Record<string, ValueFormat>;
  names: Record<string, string>;
};

export const EMPTY_HOME: HomeConfig = { groups: [], formats: {}, names: {} };

/** Where the smart-home layer is stored, and carried between installations. */
export const HOME_CONFIG_KEY = "home.config";

export function normalizeHome(value: unknown): HomeConfig {
  const v = (value ?? {}) as Partial<HomeConfig>;
  return {
    groups: Array.isArray(v.groups)
      ? v.groups
          .filter((g): g is HomeGroup => !!g && typeof g.id === "string" && typeof g.name === "string")
          .map((g) => ({ id: g.id, name: g.name, icon: g.icon, members: Array.isArray(g.members) ? g.members : [] }))
      : [],
    formats: v.formats && typeof v.formats === "object" ? (v.formats as Record<string, ValueFormat>) : {},
    names: v.names && typeof v.names === "object" ? (v.names as Record<string, string>) : {},
  };
}

export type HomeBucket<T> = {
  key: string;
  name: string;
  icon?: string;
  /** Present for a hand-made group — the edit target. */
  groupId?: string;
  items: T[];
};

/**
 * Sort entities into buckets: hand-made groups first in their saved order, then
 * the remainder split by the chosen automatic dimension (room or kind), then a
 * final catch-all for whatever has neither.
 */
export function groupEntities<T extends { id: string; area?: string; domain: string }>(
  items: T[],
  config: HomeConfig,
  autoBy: "area" | "domain",
  labels: { unplaced: string; kindLabel: (domain: string) => string },
): HomeBucket<T>[] {
  const assigned = new Map<string, HomeGroup>();
  for (const group of config.groups) {
    for (const id of group.members) if (!assigned.has(id)) assigned.set(id, group);
  }

  const custom = new Map<string, HomeBucket<T>>();
  for (const group of config.groups) {
    custom.set(group.id, { key: `group:${group.id}`, name: group.name, icon: group.icon, groupId: group.id, items: [] });
  }

  const auto = new Map<string, HomeBucket<T>>();
  const unplaced: HomeBucket<T> = { key: "unplaced", name: labels.unplaced, items: [] };

  for (const item of items) {
    const inGroup = assigned.get(item.id);
    if (inGroup) {
      custom.get(inGroup.id)!.items.push(item);
      continue;
    }
    const dim = autoBy === "area" ? item.area : item.domain;
    if (dim) {
      let bucket = auto.get(dim);
      if (!bucket) {
        bucket = {
          key: `${autoBy}:${dim}`,
          name: autoBy === "domain" ? labels.kindLabel(dim) : dim,
          items: [],
        };
        auto.set(dim, bucket);
      }
      bucket.items.push(item);
      continue;
    }
    unplaced.items.push(item);
  }

  const autoSorted = [...auto.values()].sort((a, b) => a.name.localeCompare(b.name));
  const result = [...custom.values(), ...autoSorted];
  if (unplaced.items.length > 0) result.push(unplaced);
  return result;
}

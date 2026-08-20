/**
 * Container groups.
 *
 * A busy host has twenty containers that belong to five or six stacks, and a
 * flat list makes you read all twenty to find the one you want. Groups fold
 * them back into the stacks they came from.
 *
 * Two kinds, and the point is that they are universal — nothing here knows the
 * name of any particular stack:
 *
 *  - **Automatic**, from the Docker Compose project every container already
 *    carries in `com.docker.compose.project`. Anyone who runs Compose gets
 *    their stacks grouped for free, whatever they are called.
 *  - **Custom**, made by hand, listing the containers that belong together for
 *    reasons Compose does not know about.
 *
 * Both are editable: an automatic group can be renamed, re-iconed or hidden
 * through an *override* keyed by the project name, without turning it into a
 * hand-maintained list. A container named in a custom group leaves its
 * automatic one — every container lands in exactly one place.
 *
 * This module is pure and carries no imports, so the resolver runs in the
 * browser (where the container list already lives and search happens) as
 * happily as on the server.
 */

export type CustomGroup = {
  id: string;
  name: string;
  icon?: string;
  /** Container names that belong to this group. */
  members: string[];
};

/** Edits applied to an automatic group, keyed by its Compose project name. */
export type GroupOverride = {
  name?: string;
  icon?: string;
  hidden?: boolean;
};

export type ContainerGroupConfig = {
  custom: CustomGroup[];
  overrides: Record<string, GroupOverride>;
};

export const EMPTY_GROUPS: ContainerGroupConfig = { custom: [], overrides: {} };

/** A resolved bucket of containers, ready to render. */
export type GroupBucket<T> = {
  /** Stable identity — "custom:<id>", "auto:<project>", or "ungrouped". */
  key: string;
  name: string;
  icon?: string;
  auto: boolean;
  /** Present for automatic groups: the override key and edit target. */
  projectKey?: string;
  /** Present for custom groups. */
  customId?: string;
  hidden: boolean;
  items: T[];
};

/** Fill in defaults so a partially-shaped stored value cannot crash the page. */
export function normalizeGroups(value: unknown): ContainerGroupConfig {
  const v = (value ?? {}) as Partial<ContainerGroupConfig>;
  return {
    custom: Array.isArray(v.custom)
      ? v.custom
          .filter((g): g is CustomGroup => !!g && typeof g.id === "string" && typeof g.name === "string")
          .map((g) => ({ id: g.id, name: g.name, icon: g.icon, members: Array.isArray(g.members) ? g.members : [] }))
      : [],
    overrides: v.overrides && typeof v.overrides === "object" ? v.overrides : {},
  };
}

/**
 * Sort containers into buckets: custom groups first in their saved order, then
 * automatic groups alphabetically, then the ungrouped remainder last.
 */
export function groupContainers<T extends { name: string; project?: string }>(
  items: T[],
  config: ContainerGroupConfig,
  ungroupedLabel: string
): GroupBucket<T>[] {
  // name → custom group it was assigned to. First mention wins, so a container
  // listed in two groups by mistake still lands in exactly one.
  const assigned = new Map<string, CustomGroup>();
  for (const group of config.custom) {
    for (const name of group.members) {
      if (!assigned.has(name)) assigned.set(name, group);
    }
  }

  const custom = new Map<string, GroupBucket<T>>();
  for (const group of config.custom) {
    custom.set(group.id, {
      key: `custom:${group.id}`,
      name: group.name,
      icon: group.icon,
      auto: false,
      customId: group.id,
      hidden: false,
      items: [],
    });
  }

  const auto = new Map<string, GroupBucket<T>>();
  const ungrouped: GroupBucket<T> = {
    key: "ungrouped",
    name: ungroupedLabel,
    auto: false,
    hidden: false,
    items: [],
  };

  for (const item of items) {
    const inCustom = assigned.get(item.name);
    if (inCustom) {
      custom.get(inCustom.id)!.items.push(item);
      continue;
    }
    if (item.project) {
      let bucket = auto.get(item.project);
      if (!bucket) {
        const override = config.overrides[item.project] ?? {};
        bucket = {
          key: `auto:${item.project}`,
          name: override.name || item.project,
          icon: override.icon,
          auto: true,
          projectKey: item.project,
          hidden: !!override.hidden,
          items: [],
        };
        auto.set(item.project, bucket);
      }
      bucket.items.push(item);
      continue;
    }
    ungrouped.items.push(item);
  }

  const autoSorted = [...auto.values()].sort((a, b) => a.name.localeCompare(b.name));
  const result = [...custom.values(), ...autoSorted];
  if (ungrouped.items.length > 0) result.push(ungrouped);
  // Empty custom groups still render, so they can be filled — but only when
  // there is nothing to search for; a search should never surface an empty box.
  return result;
}

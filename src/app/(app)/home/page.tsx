import { pageUser } from "@/lib/pageUser";
import { canEdit } from "@/lib/auth";
import { haStates, haConfig, haAreas } from "@/lib/services";
import { getSetting } from "@/lib/db";
import { EMPTY_HOME, HOME_CONFIG_KEY, normalizeHome } from "@/lib/homeConfig";
import { dict } from "@/i18n";
import { EmptyState } from "@/components/ui";
import { AutoRefresh } from "@/components/AutoRefresh";
import { SmartHome } from "@/components/home/SmartHome";

export const dynamic = "force-dynamic";

/**
 * The smart home, in full.
 *
 * A widget on the board is for the four things you touch every evening. This is
 * for everything else: every light, sensor, switch, scene and automation the
 * house has, grouped the way Home Assistant groups it, searchable, and
 * switchable in place.
 *
 * It is a separate page rather than a bigger widget because a house does not fit
 * in a tile, and because "show me everything" and "show me the porch light" are
 * different questions that deserve different screens.
 */
export default async function SmartHomePage() {
  const user = await pageUser();
  const d = dict(user.locale);

  if (!(await haConfig())) {
    return <EmptyState title={d.home.notConfigured} hint={d.home.notConfiguredHint} />;
  }

  const [entities, areas, configRaw] = await Promise.all([
    haStates(),
    haAreas(),
    getSetting<unknown>(HOME_CONFIG_KEY, EMPTY_HOME),
  ]);
  if (!entities) {
    return <EmptyState title={d.home.unreachable} hint={d.home.notConfiguredHint} />;
  }

  return (
    <>
      <AutoRefresh seconds={15} />
      <SmartHome
        d={d}
        canControl={canEdit(user)}
        areas={areas}
        config={normalizeHome(configRaw)}
        entities={entities.map((e) => ({
          id: e.id,
          name: e.name,
          state: e.state,
          unit: e.unit,
          domain: e.domain,
          toggleable: e.toggleable,
          area: e.area,
          deviceClass: e.deviceClass,
          attributes: e.attributes,
        }))}
      />
    </>
  );
}

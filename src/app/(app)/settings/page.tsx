import { prisma, getSetting } from "@/lib/db";
import { pageUser } from "@/lib/pageUser";
import { atLeast } from "@/lib/auth";
import { dockerHealth } from "@/lib/docker";
import { prometheusHealth } from "@/lib/prometheus";
import { proxmoxHealth } from "@/lib/proxmox";
import { settings as cfg } from "@/lib/config";
import { effectiveOrigin } from "@/lib/origin";
import { integrationStatus, integrationsForDisplay } from "@/lib/integrations";
import { enabled as ssoEnabled } from "@/lib/friendplace";
import { dict } from "@/i18n";
import { Card, CardHeader, Badge, SectionTitle } from "@/components/ui";
import { ago } from "@/lib/format";
import { PasswordForm } from "./PasswordForm";
import { IntegrationForms } from "./IntegrationForms";
import { RuleForms } from "./RuleForms";
import { ServiceForms } from "./ServiceForms";
import { PushCard } from "./PushCard";
import { servicesForDisplay } from "@/lib/services";
import { currentNowPlayingToken } from "@/actions/integrations";

export const dynamic = "force-dynamic";

/**
 * Settings.
 *
 * Read-only where it matters: every connection is configured in .env and shown
 * here with whether it currently answers. A dashboard that could rewrite its
 * own credentials from the browser would be a much more interesting target than
 * one that cannot.
 */
export default async function SettingsPage() {
  const user = await pageUser();
  const d = dict(user.locale);
  const isAdmin = atLeast(user.role, "admin");

  const status = await integrationStatus();
  const [docker, prom, pve, display, npToken] = await Promise.all([
    status.docker ? dockerHealth() : Promise.resolve([]),
    status.prometheus ? prometheusHealth() : Promise.resolve({ ok: false, error: "not configured" }),
    status.proxmox ? proxmoxHealth() : Promise.resolve({ ok: false, error: "not configured" }),
    integrationsForDisplay(user.id),
    isAdmin ? currentNowPlayingToken() : Promise.resolve(""),
  ]);
  const iconPack = await getSetting<boolean>("icons.pack", false);
  const rules = isAdmin ? await prisma.alertRule.findMany({ orderBy: { createdAt: "asc" } }) : [];
  const services = isAdmin ? await servicesForDisplay() : null;
  const pushCount = await prisma.pushSubscription.count({ where: { userId: user.id } });

  const users = isAdmin
    ? await prisma.user.findMany({ orderBy: { createdAt: "asc" } })
    : [];

  const roleLabel: Record<string, string> = {
    owner: d.settings.roleOwner,
    admin: d.settings.roleAdmin,
    viewer: d.settings.roleViewer,
  };

  return (
    <div className="space-y-7">
      <h1 className="text-lg font-semibold tracking-tight">{d.settings.title}</h1>

      <section>
        <SectionTitle hint={d.settings.configuredIn}>{d.settings.integrations}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {docker.map((host) => (
            <IntegrationCard
              key={host.key}
              name={`${d.settings.integrationDocker} · ${host.label}`}
              configured
              ok={host.ok}
              error={host.error}
              d={d}
            />
          ))}
          {!status.docker && <IntegrationCard name={d.settings.integrationDocker} configured={false} ok={false} d={d} />}
          <IntegrationCard
            name={d.settings.integrationPrometheus}
            configured={status.prometheus}
            ok={prom.ok}
            error={prom.error}
            d={d}
          />
          <IntegrationCard
            name={d.settings.integrationProxmox}
            configured={status.proxmox}
            ok={pve.ok}
            error={pve.error}
            d={d}
          />
          <IntegrationCard
            name={d.settings.integrationFriendPlace}
            configured={ssoEnabled()}
            ok={ssoEnabled()}
            d={d}
          />
        </div>
        {!cfg.allowContainerControl() && (
          <p className="mt-2 text-xs text-muted">⚠ {d.containers.controlDisabled}</p>
        )}

        {isAdmin && (
          <div className="mt-3">
            <IntegrationForms d={d} display={display} nowPlayingToken={npToken} appUrl={effectiveOrigin()} iconPack={iconPack} />
          </div>
        )}
      </section>

      {isAdmin && services && (
        <section>
          <SectionTitle hint={d.settings.servicesHint}>{d.settings.services}</SectionTitle>
          <ServiceForms d={d} display={services} />
        </section>
      )}

      {isAdmin && (
        <section>
          <SectionTitle>{d.settings.alerts}</SectionTitle>
          <RuleForms d={d} rules={rules} />
        </section>
      )}

      <section>
        <SectionTitle>{d.settings.notifications}</SectionTitle>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <PushCard d={d} count={pushCount} />
        </div>
      </section>

      <section>
        <SectionTitle>{d.settings.account}</SectionTitle>
        <Card className="max-w-md p-4">
          <p className="text-sm font-medium">{user.name}</p>
          <p className="text-xs text-muted">
            {user.login ?? user.email} · {roleLabel[user.role] ?? user.role}
          </p>
          {/* SSO-only accounts have no password here; offering the form would be
              a dead end. */}
          {user.passwordHash && (
            <div className="mt-4 border-t border-line pt-4">
              <PasswordForm d={d} />
            </div>
          )}
        </Card>
      </section>

      {isAdmin && (
        <section>
          <SectionTitle>{d.settings.users}</SectionTitle>
          <Card>
            <CardHeader title={`${users.length}`} />
            <ul className="divide-y divide-line">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <p className="truncate text-xs text-muted">{u.login ?? u.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {u.fpUserId && <Badge tone="accent">FriendPlace</Badge>}
                    {u.disabled && <Badge tone="danger">off</Badge>}
                    <Badge tone={u.role === "owner" ? "ok" : "neutral"}>{roleLabel[u.role] ?? u.role}</Badge>
                    <span className="whitespace-nowrap text-xs text-faint">
                      {u.lastLoginAt ? ago(u.lastLoginAt, d) : d.common.never}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}

function IntegrationCard({
  name,
  configured,
  ok,
  error,
  d,
}: {
  name: string;
  configured: boolean;
  ok: boolean;
  error?: string;
  d: ReturnType<typeof dict>;
}) {
  return (
    <Card className="flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {error && configured && (
          <p className="truncate font-mono text-[11px] text-faint" title={error}>
            {error}
          </p>
        )}
      </div>
      <Badge tone={!configured ? "neutral" : ok ? "ok" : "danger"}>
        {!configured ? d.common.notConfigured : ok ? d.settings.connected : d.settings.failing}
      </Badge>
    </Card>
  );
}

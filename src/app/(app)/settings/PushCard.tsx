"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardHeader, Badge } from "@/components/ui";
import { Button } from "@/components/form";
import { pushPublicKey, subscribePush, unsubscribePush, testPush } from "@/actions/push";
import type { Dictionary } from "@/i18n";

/**
 * Turning on notifications in this browser.
 *
 * Each browser subscribes separately — that is how the web push works, and it
 * is also what people expect: allowing notifications on a phone should not
 * start them on the laptop at work.
 *
 * The permission prompt can only be raised from a click, so this is a button
 * and not something that happens on load.
 */
export function PushCard({ d, count }: { d: Dictionary; count: number }) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSupported(false);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => setSupported(false));
  }, []);

  async function enable() {
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(d.settings.pushDenied);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const key = await pushPublicKey();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await subscribePush({
        endpoint: json.endpoint ?? "",
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
      });
      setSubscribed(true);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : d.common.error);
    }
  }

  async function disable() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setSubscribed(false);
  }

  return (
    <Card>
      <CardHeader
        title={d.settings.push}
        action={<Badge tone={subscribed ? "ok" : "neutral"}>{count || (subscribed ? 1 : 0)}</Badge>}
      />
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-muted">{d.settings.pushHint}</p>

        {!supported ? (
          // Safari on iOS only allows this for an installed app, and plain HTTP
          // is refused everywhere — both worth saying out loud rather than
          // leaving a button that silently does nothing.
          <p className="text-xs text-warn">{d.settings.pushUnsupported}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {subscribed ? (
              <>
                <Button variant="danger" disabled={pending} onClick={() => startTransition(() => void disable())}>
                  {d.settings.turnOff}
                </Button>
                <Button
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await testPush();
                      setMessage(result.ok ? d.settings.pushSent : result.error ?? d.common.error);
                    })
                  }
                >
                  {d.common.test}
                </Button>
              </>
            ) : (
              <Button variant="primary" disabled={pending} onClick={() => startTransition(() => void enable())}>
                {d.settings.pushEnable}
              </Button>
            )}
          </div>
        )}

        {message && <p className="text-xs text-muted">{message}</p>}
      </div>
    </Card>
  );
}

/**
 * The VAPID key travels as base64url text and the browser wants raw bytes.
 * Converting it here is unavoidable boilerplate of the push API.
 */
function urlBase64ToUint8Array(base64: string): BufferSource {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const normalised = padded.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);

  // Allocated through ArrayBuffer explicitly: the DOM types want a view backed
  // by a plain ArrayBuffer, and Uint8Array.from is not specific enough for them.
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

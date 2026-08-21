import "server-only";
import { createSocket } from "node:dgram";

/**
 * Wake-on-LAN.
 *
 * A "magic packet" is six 0xFF bytes followed by the target's MAC repeated
 * sixteen times, sent as a UDP broadcast the sleeping network card is listening
 * for. No dependency — node's dgram is all it takes — and it only ever leaves
 * the LAN, which is where the machine it wakes lives.
 */
export async function sendWol(
  mac: string,
  broadcast = "255.255.255.255",
  port = 9
): Promise<{ ok: boolean; error?: string }> {
  const bytes = mac.trim().split(/[:-]/).map((h) => parseInt(h, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) {
    return { ok: false, error: "not a MAC address" };
  }

  const packet = Buffer.alloc(102);
  packet.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) packet.set(bytes, 6 + i * 6);

  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    const done = (result: { ok: boolean; error?: string }) => {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve(result);
    };

    socket.once("error", (e) => done({ ok: false, error: e.message }));
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(packet, port, broadcast, (e) => done(e ? { ok: false, error: e.message } : { ok: true }));
    });

    // A stuck socket must not hang the request.
    setTimeout(() => done({ ok: false, error: "timed out" }), 4000);
  });
}

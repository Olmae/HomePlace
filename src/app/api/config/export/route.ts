import { NextResponse } from "next/server";
import { currentUser } from "@/lib/session";
import { canEdit } from "@/lib/auth";
import { exportConfig } from "@/actions/config";

export const dynamic = "force-dynamic";

/**
 * The export as a downloadable file.
 *
 * A route rather than a server action, because a browser can only be handed a
 * file by navigating to something that sets Content-Disposition — and a plain
 * link works from a phone, where the clipboard dance does not.
 */
export async function GET() {
  const user = await currentUser();
  if (!canEdit(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const config = await exportConfig();
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(config, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="homeplace-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}

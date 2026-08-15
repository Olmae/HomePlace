import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for the container healthcheck.
 *
 * It touches the database on purpose: a process that is up but cannot reach its
 * own storage is not healthy, and reporting it as healthy is how a broken
 * deployment stays broken quietly.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "database unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}

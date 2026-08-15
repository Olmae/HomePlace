import "server-only";
import { redirect } from "next/navigation";
import { currentUser } from "./session";
import { needsSetup } from "./auth";

/**
 * The signed-in user for a page inside the app shell.
 *
 * The layout already redirects anonymous visitors, but Next renders a layout
 * and its page in parallel — the page still executes once with no user, and
 * asserting one exists there produces a real error in the log on every visit to
 * a fresh installation. This redirects instead, which is both correct and
 * quiet.
 */
export async function pageUser() {
  const user = await currentUser();
  if (!user) redirect((await needsSetup()) ? "/setup" : "/login");
  return user;
}

/**
 * Emergency access recovery.
 *
 *   docker compose exec app node scripts/admin-reset.mjs <login> <password>
 *   npm run admin:reset -- <login> <password>
 *
 * The setup wizard is the normal way in, and it closes permanently once the
 * owner exists. This script is the other end of that: a forgotten password on a
 * self-hosted panel should not mean losing the dashboard, and someone who can
 * already run commands inside the container has full access anyway — so this
 * grants nothing that was not already available.
 *
 * It resets the password of an existing account, or creates an owner if the
 * login is unknown.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// `docker exec` starts with a clean environment — none of what the entrypoint
// exported for the server process is here. Rebuild the same default so the
// script finds the database without the caller having to know where it is.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${process.env.DATA_DIR ?? "/data"}/homeplace.db`;
}

const prisma = new PrismaClient();

async function main() {
  const [login, password] = process.argv.slice(2);
  if (!login || !password) {
    console.error("usage: admin-reset <login> <password>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("password must be at least 8 characters");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { login } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      // Also clears `disabled`: locking yourself out and then not being able to
      // unlock yourself would defeat the point of the script.
      data: { passwordHash, disabled: false },
    });
    console.log(`✔ password reset for ${login} (${existing.role})`);
  } else {
    const user = await prisma.user.create({
      data: { login, name: login, passwordHash, role: "owner" },
    });
    if ((await prisma.dashboard.count()) === 0) {
      await prisma.dashboard.create({ data: { name: "Home", order: 0, shared: true, ownerId: user.id } });
    }
    console.log(`✔ owner account created: ${login}`);
  }

  await prisma.event.create({
    data: { type: "system", severity: "warn", title: `admin-reset: ${login}`, actor: "cli" },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

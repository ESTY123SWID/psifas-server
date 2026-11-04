import fs from "node:fs/promises";
import { afterAll, beforeEach } from "vitest";

import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

// Same safety net as globalSetup: never truncate anything but a database named *test*.
if (!new URL(env.databaseUrl).pathname.includes("test")) {
    throw new Error("Tests must run against a database whose name contains \"test\".");
}

beforeEach(async () => {
    await prisma.$executeRawUnsafe(
        'TRUNCATE TABLE "Reaction", "Post", "ClassMember", "Class", "User", "PendingImageDeletion" RESTART IDENTITY CASCADE'
    );
    await fs.rm(env.storage.uploadsDir, { recursive: true, force: true });
});

afterAll(async () => {
    await prisma.$disconnect();
});

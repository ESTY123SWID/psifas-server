/**
 * Creates the first SystemAdmin, or promotes an existing account. No credentials live in code.
 *
 *   ADMIN_EMAIL="you@example.com" npm run seed:admin
 *
 * - Existing account: promoted to SystemAdmin. Its password is NOT touched and none is needed.
 * - New account: also needs ADMIN_NAME, and a password — typed at a hidden prompt (nothing is
 *   echoed or stored), or passed in a temporary ADMIN_PASSWORD environment variable.
 * Only an argon2id hash is ever written to the database. The password is never printed.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { passwordPolicySchema } from "../src/schemas/auth.schema.js";
import { emailSchema, nameSchema } from "../src/schemas/common.schema.js";
import { hashPassword } from "../src/utils/password.js";

function fail(message: string): never {
    console.error(`[seed-admin] ${message}`);
    process.exit(1);
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
    const stdin = process.stdin;
    if (!stdin.isTTY) fail("No terminal for a hidden prompt. Set ADMIN_PASSWORD for this one command instead.");

    return new Promise((resolve) => {
        process.stdout.write(question);
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding("utf8");
        let value = "";
        const onData = (chunk: string) => {
            for (const char of chunk) {
                if (char === "\r" || char === "\n") {
                    stdin.setRawMode(false);
                    stdin.pause();
                    stdin.off("data", onData);
                    process.stdout.write("\n");
                    resolve(value);
                    return;
                }
                if (char === "\u0003") {
                    process.stdout.write("\n");
                    process.exit(130);
                }
                if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
                else value += char;
            }
        };
        stdin.on("data", onData);
    });
}

const env = z
    .object({
        DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
        ADMIN_EMAIL: emailSchema,
        ADMIN_NAME: nameSchema.optional(),
        ADMIN_PASSWORD: z.string().optional(),
    })
    .safeParse({
        ...process.env,
        ADMIN_NAME: process.env.ADMIN_NAME || undefined,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || undefined,
    });

if (!env.success) {
    fail(`Missing or invalid variables: ${env.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
}

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = env.data;
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });

try {
    const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true, role: true } });

    if (existing) {
        if (existing.role === "SystemAdmin") {
            console.log(`[seed-admin] ${ADMIN_EMAIL} is already a SystemAdmin. Nothing changed.`);
        } else {
            await prisma.user.update({ where: { id: existing.id }, data: { role: "SystemAdmin" } });
            console.log(`[seed-admin] ${ADMIN_EMAIL} is now a SystemAdmin (password unchanged).`);
        }
    } else {
        if (!ADMIN_NAME) fail("The account does not exist yet: set ADMIN_NAME to create it.");
        const password = ADMIN_PASSWORD ?? (await promptHidden("Password for the new SystemAdmin (hidden): "));
        const checked = passwordPolicySchema.safeParse(password);
        if (!checked.success) fail(checked.error.issues[0]?.message ?? "Invalid password.");

        await prisma.user.create({
            data: {
                name: ADMIN_NAME,
                email: ADMIN_EMAIL,
                passwordHash: await hashPassword(checked.data),
                role: "SystemAdmin",
            },
        });
        console.log(`[seed-admin] Created SystemAdmin ${ADMIN_EMAIL}.`);
    }
} finally {
    await prisma.$disconnect();
}

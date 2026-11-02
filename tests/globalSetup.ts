import "dotenv/config";
import { execSync } from "node:child_process";

/**
 * Applies pending migrations (non-destructive) to the dedicated test database once per run.
 * Table contents are truncated before every test in tests/setup.ts.
 */
export default function setup() {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
        throw new Error("TEST_DATABASE_URL is not set. Tests need a separate, disposable PostgreSQL database.");
    }
    const databaseName = new URL(url).pathname.slice(1);
    if (!databaseName.includes("test") || url === process.env.DATABASE_URL) {
        throw new Error(`Refusing to use "${databaseName}" for tests: the test database name must contain "test".`);
    }

    execSync("npx prisma migrate deploy", {
        stdio: "inherit",
        env: { ...process.env, DATABASE_URL: url },
    });
}

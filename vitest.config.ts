import "dotenv/config";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
    test: {
        include: ["tests/**/*.test.ts"],
        globalSetup: ["tests/globalSetup.ts"],
        setupFiles: ["tests/setup.ts"],
        // All test files share one database, so they run one after another.
        fileParallelism: false,
        testTimeout: 30_000,
        hookTimeout: 60_000,
        env: {
            NODE_ENV: "test",
            DATABASE_URL: testDatabaseUrl,
            JWT_SECRET: "test-only-secret-that-is-at-least-32-characters-long",
            CLIENT_ORIGINS: "http://localhost:5173",
            COOKIE_SECURE: "false",
            COOKIE_SAMESITE: "lax",
            TRUST_PROXY: "1",
            API_PUBLIC_URL: "http://localhost:4000/api",
            STORAGE_DRIVER: "local",
            // Dot-prefixed on purpose: regression test for serving files under hidden folders.
            UPLOADS_DIR: path.join(os.tmpdir(), ".psifas-test-uploads", "uploads"),
            AUTH_RATE_LIMIT_MAX: "5",
        },
    },
});

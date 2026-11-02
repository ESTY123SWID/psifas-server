/**
 * DEVELOPMENT ONLY — runs a real PostgreSQL server from npm binaries (no installation needed).
 *
 *   npm run db:local
 *
 * Listens on localhost:5433 (user/password: psifas/psifas) and creates the `psifas` and
 * `psifas_test` databases. Data is kept in server/.local-db. Press Ctrl+C to stop.
 * If you already have PostgreSQL (installed, Docker, Neon, Supabase…) you don't need this:
 * just point DATABASE_URL at it.
 */
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
const DATABASES = ["psifas", "psifas_test"];

const pg = new EmbeddedPostgres({
    databaseDir: path.resolve(".local-db"),
    user: "psifas",
    password: "psifas",
    port: PORT,
    persistent: true,
    autoRehydrateSymlinks: true,
    // Without this, initdb inherits the Windows code page (e.g. WIN1255) and rejects emoji etc.
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
});

async function main() {
    try {
        await pg.initialise();
    } catch (error) {
        // The cluster already exists from an earlier run.
        if (!String(error).includes("already exists") && !String(error).includes("not empty")) {
            console.warn("[local-db] initialise:", (error as Error).message);
        }
    }

    await pg.start();

    const client = pg.getPgClient();
    await client.connect();
    for (const name of DATABASES) {
        const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
        if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
    }
    await client.end();

    console.log(`[local-db] PostgreSQL is running on localhost:${PORT}`);
    for (const name of DATABASES) {
        console.log(`[local-db]   postgresql://psifas:psifas@localhost:${PORT}/${name}`);
    }
    console.log("[local-db] Press Ctrl+C to stop.");

    const shutdown = async () => {
        await pg.stop();
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}

main().catch(async (error) => {
    console.error("[local-db] Failed to start:", error);
    await pg.stop().catch(() => {});
    process.exit(1);
});

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { retryPendingImageDeletions } from "./storage/index.js";

/** How often image deletions that failed earlier (e.g. a storage outage) are retried. */
const IMAGE_DELETION_RETRY_INTERVAL_MS = 10 * 60 * 1000;

const app = createApp();

function retryImageDeletions() {
    retryPendingImageDeletions()
        .then(({ deleted, failed }) => {
            if (deleted || failed) console.log(`[storage] Pending image deletions: ${deleted} deleted, ${failed} still failing`);
        })
        .catch((error: unknown) => console.error("[storage] Pending image deletion run failed:", error));
}

const server = app.listen(env.port, () => {
    console.log(`[server] Psifas API listening on port ${env.port} (${env.nodeEnv})`);
    console.log(`[server] Allowed client origins: ${env.clientOrigins.join(", ")}`);
    retryImageDeletions();
});
setInterval(retryImageDeletions, IMAGE_DELETION_RETRY_INTERVAL_MS).unref();

async function shutdown(signal: string) {
    console.log(`[server] ${signal} received, shutting down...`);
    server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

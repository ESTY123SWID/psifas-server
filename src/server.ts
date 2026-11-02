import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();

const server = app.listen(env.port, () => {
    console.log(`[server] Psifas API listening on port ${env.port} (${env.nodeEnv})`);
    console.log(`[server] Allowed client origins: ${env.clientOrigins.join(", ")}`);
});

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

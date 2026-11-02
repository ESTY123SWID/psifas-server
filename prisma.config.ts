import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
    },
    datasource: {
        // Not using env() here so that `prisma generate` also works without a database configured.
        url: process.env.DATABASE_URL ?? "",
    },
});

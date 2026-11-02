import "dotenv/config";
import path from "node:path";
import { z } from "zod";

const booleanFromString = z
    .enum(["true", "false"])
    .transform((value) => value === "true");

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters long"),
    SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),

    /** Comma-separated list of browser origins allowed to call the API with credentials. */
    CLIENT_ORIGINS: z.string().default("http://localhost:5173"),
    COOKIE_SECURE: booleanFromString.optional(),
    COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    /** Number of reverse-proxy hops to trust (e.g. 1 on Render). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),

    /** Public base URL of this API, used to build signed image URLs. */
    API_PUBLIC_URL: z.string().url().optional(),
    STORAGE_DRIVER: z.enum(["local"]).default("local"),
    UPLOADS_DIR: z.string().default("uploads"),
    /** Secret for signing media URLs. Falls back to a key derived from JWT_SECRET. */
    MEDIA_URL_SECRET: z.string().min(32).optional(),

    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
});

// Treat `KEY=` (empty) the same as an unset variable, as in .env.example.
const definedVariables = Object.fromEntries(
    Object.entries(process.env).filter(([, value]) => value !== undefined && value !== "")
);

const parsed = envSchema.safeParse(definedVariables);

if (!parsed.success) {
    const issues = parsed.error.issues
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === "production";
const cookieSecure = raw.COOKIE_SECURE ?? isProduction;

if (raw.COOKIE_SAMESITE === "none" && !cookieSecure) {
    throw new Error("COOKIE_SAMESITE=none requires COOKIE_SECURE=true");
}

export const env = {
    nodeEnv: raw.NODE_ENV,
    isProduction,
    isTest: raw.NODE_ENV === "test",
    port: raw.PORT,
    databaseUrl: raw.DATABASE_URL,
    jwtSecret: raw.JWT_SECRET,
    sessionTtlMs: raw.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    clientOrigins: raw.CLIENT_ORIGINS.split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    cookie: {
        secure: cookieSecure,
        sameSite: raw.COOKIE_SAMESITE,
        // The __Host- prefix makes the browser enforce Secure + Path=/ + no Domain.
        name: cookieSecure ? "__Host-psifas_session" : "psifas_session",
    },
    trustProxy: raw.TRUST_PROXY,
    apiPublicUrl: (raw.API_PUBLIC_URL ?? `http://localhost:${raw.PORT}/api`).replace(/\/+$/, ""),
    storage: {
        driver: raw.STORAGE_DRIVER,
        uploadsDir: path.resolve(raw.UPLOADS_DIR),
    },
    mediaUrlSecret: raw.MEDIA_URL_SECRET,
    authRateLimitMax: raw.AUTH_RATE_LIMIT_MAX,
} as const;

export type Env = typeof env;

import { rateLimit } from "express-rate-limit";

import { env } from "../config/env.js";

/** Brute-force protection for login and registration (per IP). */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.authRateLimitMax,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Successful logins don't count, so a user who logs in/out normally is never locked out.
    skipSuccessfulRequests: true,
    message: {
        code: "TOO_MANY_REQUESTS",
        message: "יותר מדי ניסיונות. נסי שוב בעוד כמה דקות.",
    },
});

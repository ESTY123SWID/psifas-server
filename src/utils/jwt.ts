import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

const ISSUER = "psifas-api";
const AUDIENCE = "psifas-client";

export interface SessionClaims {
    userId: number;
    /** Must equal User.sessionVersion; bumping it (password change) revokes older tokens. */
    sessionVersion: number;
}

export function signSessionToken(userId: number, sessionVersion: number): string {
    return jwt.sign({ sv: sessionVersion }, env.jwtSecret, {
        algorithm: "HS256",
        subject: String(userId),
        issuer: ISSUER,
        audience: AUDIENCE,
        expiresIn: Math.floor(env.sessionTtlMs / 1000),
    });
}

/** Returns the claims of a valid token, or null for any invalid/expired token. */
export function verifySessionToken(token: string): SessionClaims | null {
    try {
        const payload = jwt.verify(token, env.jwtSecret, {
            algorithms: ["HS256"],
            issuer: ISSUER,
            audience: AUDIENCE,
        });
        if (typeof payload !== "object" || typeof payload.sub !== "string") return null;
        const userId = Number(payload.sub);
        if (!Number.isSafeInteger(userId) || userId <= 0) return null;
        // Tokens issued before session versioning existed count as version 0.
        const sessionVersion = payload.sv === undefined ? 0 : Number(payload.sv);
        if (!Number.isSafeInteger(sessionVersion) || sessionVersion < 0) return null;
        return { userId, sessionVersion };
    } catch {
        return null;
    }
}

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "../config/env.js";

const URL_BUCKET_MS = 60 * 60 * 1000;

const signingKey = env.mediaUrlSecret ??
    createHmac("sha256", env.jwtSecret).update("psifas-media-url-signing").digest("hex");

function sign(key: string, expiresAt: number): string {
    return createHmac("sha256", signingKey)
        .update(`${key}\n${expiresAt}`)
        .digest("base64url");
}

/**
 * Expiry is rounded up to the next full hour plus one hour, so the URL of an image stays
 * identical across refetches within the same hour (no needless image re-downloads in the
 * client) while every URL is still valid for at least one hour and at most two.
 */
export function createMediaSignature(key: string, now = Date.now()) {
    const expiresAt = Math.ceil(now / URL_BUCKET_MS) * URL_BUCKET_MS + URL_BUCKET_MS;
    return { exp: expiresAt, sig: sign(key, expiresAt) };
}

export function verifyMediaSignature(key: string, exp: unknown, sig: unknown, now = Date.now()): boolean {
    if (typeof exp !== "string" || typeof sig !== "string") return false;
    const expiresAt = Number(exp);
    if (!Number.isSafeInteger(expiresAt) || expiresAt < now) return false;

    const expected = Buffer.from(sign(key, expiresAt));
    const received = Buffer.from(sig);
    return expected.length === received.length && timingSafeEqual(expected, received);
}

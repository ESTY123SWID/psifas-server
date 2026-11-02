import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { forbidden } from "../utils/httpError.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-requested-with";

function originOf(value: string | undefined): string | null {
    if (!value) return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

/**
 * CSRF protection for cookie-authenticated, state-changing requests (two independent checks):
 *
 * 1. Origin verification — the Origin (or, if absent, Referer) header must be one of
 *    CLIENT_ORIGINS. Browsers always send Origin on cross-origin POST/PATCH/DELETE.
 * 2. Custom header — `X-Requested-With` must be present. A plain HTML form cannot set it, and a
 *    cross-origin fetch that sets it triggers a CORS preflight, which only CLIENT_ORIGINS pass.
 *
 * Combined with SameSite cookies this blocks cross-site request forgery without a token store.
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();

    const requestOrigin = originOf(req.get("origin")) ?? originOf(req.get("referer"));
    if (!requestOrigin || !env.clientOrigins.includes(requestOrigin)) {
        throw forbidden("הבקשה נחסמה: מקור הבקשה אינו מורשה.", "CSRF_ORIGIN_REJECTED");
    }

    if (!req.get(CSRF_HEADER)) {
        throw forbidden("הבקשה נחסמה: חסרה כותרת אבטחה.", "CSRF_HEADER_MISSING");
    }

    next();
}

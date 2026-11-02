import type { CookieOptions, NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { userRepository } from "../repositories/user.repository.js";
import { forbidden, unauthorized } from "../utils/httpError.js";
import { signSessionToken, verifySessionToken } from "../utils/jwt.js";

function sessionCookieOptions(): CookieOptions {
    return {
        httpOnly: true,
        secure: env.cookie.secure,
        sameSite: env.cookie.sameSite,
        path: "/",
    };
}

export function setSessionCookie(res: Response, userId: number, sessionVersion: number): void {
    res.cookie(env.cookie.name, signSessionToken(userId, sessionVersion), {
        ...sessionCookieOptions(),
        maxAge: env.sessionTtlMs,
    });
}

export function clearSessionCookie(res: Response): void {
    // Must use the same attributes as when it was set, otherwise browsers keep it.
    res.clearCookie(env.cookie.name, sessionCookieOptions());
}

/**
 * 401 when there is no valid session. The user is re-read from the database on every request,
 * so deleted accounts and role changes take effect immediately.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token: unknown = req.cookies?.[env.cookie.name];
    const claims = typeof token === "string" ? verifySessionToken(token) : null;

    if (claims === null) {
        if (token !== undefined) clearSessionCookie(res);
        throw unauthorized();
    }

    const user = await userRepository.findById(claims.userId);
    if (!user) {
        clearSessionCookie(res);
        throw unauthorized("החשבון אינו קיים עוד. יש להתחבר מחדש.");
    }
    if (user.sessionVersion !== claims.sessionVersion) {
        clearSessionCookie(res);
        throw unauthorized("הסיסמה שונתה. יש להתחבר מחדש.");
    }

    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
}

/** 403 for an authenticated user who is not a system admin. Must run after requireAuth. */
export function requireSystemAdmin(req: Request, _res: Response, next: NextFunction): void {
    if (!req.user) throw unauthorized();
    if (req.user.role !== "SystemAdmin") {
        throw forbidden("פעולה זו מיועדת למנהלות מערכת בלבד.");
    }
    next();
}

export function currentUser(req: Request) {
    if (!req.user) throw unauthorized();
    return req.user;
}

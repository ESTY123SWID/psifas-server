import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

import { Prisma } from "../generated/prisma/client.js";
import { HttpError } from "../utils/httpError.js";

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
    next(new HttpError(404, "ROUTE_NOT_FOUND", "הנתיב המבוקש אינו קיים."));
}

function toHttpError(error: unknown): HttpError | null {
    if (error instanceof HttpError) return error;

    if (error instanceof ZodError) {
        const details = error.issues.map((issue) => ({
            field: issue.path.join(".") || null,
            message: issue.message,
        }));
        return new HttpError(400, "VALIDATION_ERROR", details[0]?.message ?? "הנתונים שנשלחו אינם תקינים.", details);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // Never leak database internals — map known codes to generic messages.
        if (error.code === "P2002") return new HttpError(409, "CONFLICT", "הרשומה כבר קיימת.");
        if (error.code === "P2025") return new HttpError(404, "NOT_FOUND", "המשאב לא נמצא.");
        if (error.code === "P2003") return new HttpError(409, "CONFLICT", "הפעולה מתנגשת בנתונים קשורים.");
        return null;
    }

    // body-parser errors (malformed JSON, body too large…) carry an HTTP status.
    if (typeof error === "object" && error !== null && "type" in error && "status" in error) {
        const status = Number((error as { status: unknown }).status);
        if (status === 413) return new HttpError(413, "PAYLOAD_TOO_LARGE", "גוף הבקשה גדול מדי.");
        if (status >= 400 && status < 500) return new HttpError(400, "MALFORMED_REQUEST", "גוף הבקשה אינו תקין.");
    }

    return null;
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
    const httpError = toHttpError(error);

    if (!httpError) {
        console.error("[error] Unhandled error:", error);
        res.status(500).json({ code: "INTERNAL_ERROR", message: "אירעה שגיאה בשרת. נסי שוב מאוחר יותר." });
        return;
    }

    res.status(httpError.status).json({
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details !== undefined ? { details: httpError.details } : {}),
    });
}

import type { NextFunction, Request, Response } from "express";

import { classRepository } from "../repositories/class.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { classIdParamsSchema } from "../schemas/common.schema.js";
import { forbidden, notFound, unauthorized } from "../utils/httpError.js";
import { parseInput } from "./validate.js";

/**
 * Checks — against the database, on every request — that the caller is a member of :classId.
 * 404 if the class does not exist, 403 if it exists but the caller is not a member.
 */
export async function requireClassMember(req: Request, _res: Response, next: NextFunction): Promise<void> {
    if (!req.user) throw unauthorized();
    const { classId } = parseInput(classIdParamsSchema, req.params);

    const membership = await membershipRepository.find(req.user.id, classId);
    if (!membership) {
        const exists = await classRepository.exists(classId);
        if (!exists) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
        throw forbidden("אינך חברה בכיתה זו.", "NOT_A_MEMBER");
    }

    req.membership = { classId, role: membership.role };
    next();
}

/** Must run after requireClassMember. Class-manager rights are per class, never global. */
export function requireClassManager(req: Request, _res: Response, next: NextFunction): void {
    if (req.membership?.role !== "ClassManager") {
        throw forbidden("פעולה זו מיועדת למנהלות הכיתה בלבד.", "NOT_CLASS_MANAGER");
    }
    next();
}

export function currentMembership(req: Request) {
    if (!req.membership) throw forbidden();
    return req.membership;
}

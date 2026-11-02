import type { ClassRole } from "../generated/prisma/enums.js";
import { type TransactionClient, prisma } from "../lib/prisma.js";
import { classRepository } from "../repositories/class.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { conflict, forbidden, notFound } from "../utils/httpError.js";
import { toClassMemberDto } from "../utils/mappers.js";
import { type PageRequest, toSkipTake, totalPagesFor } from "../utils/pagination.js";

const LAST_MANAGER = () =>
    conflict("LAST_MANAGER", "לא ניתן להסיר או לשנות את המנהלת האחרונה בכיתה. יש להעביר קודם את הניהול.");

/**
 * Runs a membership change inside a transaction that holds a row lock on the class, after
 * checking that the change would not leave the class without a manager. Two concurrent
 * "demote the other manager" requests therefore can't both succeed.
 */
async function changeMembershipSafely(
    classId: number,
    userId: number,
    /** The manager performing the change; re-verified under the lock. Null when users act on themselves. */
    actorId: number | null,
    removesManagerRole: boolean,
    change: (tx: TransactionClient) => Promise<unknown>
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const locked = await classRepository.lockForUpdate(tx, classId);
        if (!locked) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");

        if (actorId !== null) {
            const actor = await membershipRepository.find(actorId, classId, tx);
            if (actor?.role !== "ClassManager") {
                throw forbidden("פעולה זו מיועדת למנהלות הכיתה בלבד.", "NOT_CLASS_MANAGER");
            }
        }

        const membership = await membershipRepository.find(userId, classId, tx);
        if (!membership) throw notFound("החברה אינה חברה בכיתה.", "MEMBER_NOT_FOUND");

        if (membership.role === "ClassManager" && removesManagerRole) {
            const managers = await membershipRepository.countManagers(classId, tx);
            if (managers <= 1) throw LAST_MANAGER();
        }

        await change(tx);
    });
}

export const memberService = {
    async list(classId: number, request: PageRequest) {
        const { skip, take } = toSkipTake(request);
        const [members, totalCount, managerCount] = await Promise.all([
            membershipRepository.listMembers(classId, skip, take),
            membershipRepository.count(classId),
            membershipRepository.countManagers(classId),
        ]);
        return {
            members: members.map(toClassMemberDto),
            totalCount,
            managerCount,
            page: request.page,
            pageSize: request.pageSize,
            totalPages: totalPagesFor(totalCount, request.pageSize),
        };
    },

    /** actorId === null: a SystemAdmin acting from the admin area (no class role required). */
    async updateRole(classId: number, actorId: number | null, memberId: number, role: ClassRole) {
        await changeMembershipSafely(classId, memberId, actorId, role !== "ClassManager", (tx) =>
            membershipRepository.updateRole(memberId, classId, role, tx)
        );
        return { id: memberId, role };
    },

    async remove(classId: number, actorId: number | null, memberId: number): Promise<void> {
        await changeMembershipSafely(classId, memberId, actorId, true, (tx) =>
            membershipRepository.delete(memberId, classId, tx)
        );
    },

    async leave(classId: number, userId: number): Promise<void> {
        await changeMembershipSafely(classId, userId, null, true, (tx) =>
            membershipRepository.delete(userId, classId, tx)
        );
    },
};

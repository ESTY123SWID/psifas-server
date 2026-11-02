import { Prisma } from "../generated/prisma/client.js";
import type { ClassRole } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { classRepository } from "../repositories/class.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { deleteStoredImages } from "../storage/index.js";
import type { ClassOptionDto } from "../types/api.types.js";
import { conflict, notFound } from "../utils/httpError.js";
import { generateInviteCode, normalizeInviteCode } from "../utils/inviteCode.js";
import { toClassOptionDto } from "../utils/mappers.js";

const MAX_INVITE_CODE_ATTEMPTS = 5;

function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Retries with a fresh code if the random code happens to collide with an existing one. */
async function withUniqueInviteCode<T>(operation: (inviteCode: string) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await operation(generateInviteCode());
        } catch (error) {
            const target = error instanceof Prisma.PrismaClientKnownRequestError ? JSON.stringify(error.meta) : "";
            if (!isUniqueViolation(error) || !target.includes("inviteCode") || attempt >= MAX_INVITE_CODE_ATTEMPTS) {
                throw error;
            }
        }
    }
}

export const classService = {
    async listMine(userId: number): Promise<ClassOptionDto[]> {
        const memberships = await membershipRepository.listClassesOfUser(userId);
        return memberships.map((membership) => toClassOptionDto(membership.class, membership.role));
    },

    async getDetails(classId: number, role: ClassRole): Promise<ClassOptionDto> {
        const classItem = await classRepository.findById(classId);
        if (!classItem) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
        return toClassOptionDto(classItem, role);
    },

    async create(userId: number, name: string) {
        if (await membershipRepository.userHasClassNamed(userId, name)) {
            throw conflict("CLASS_NAME_TAKEN", "כיתה בשם הזה כבר קיימת ברשימת הכיתות שלך.");
        }

        const classItem = await withUniqueInviteCode((inviteCode) =>
            prisma.$transaction((tx) => classRepository.createWithManager(tx, { name, inviteCode, managerId: userId }))
        );

        return {
            ...toClassOptionDto(classItem, "ClassManager"),
            inviteCode: classItem.inviteCode,
        };
    },

    async join(userId: number, rawInviteCode: string) {
        const inviteCode = normalizeInviteCode(rawInviteCode);
        const classItem = inviteCode ? await classRepository.findByInviteCode(inviteCode) : null;
        if (!classItem) {
            throw notFound("קוד ההצטרפות שגוי או לא תקף.", "INVITE_INVALID");
        }

        try {
            await membershipRepository.create(userId, classItem.id, "Member");
        } catch (error) {
            // The composite primary key (userId, classId) makes duplicate joins impossible, even concurrently.
            if (isUniqueViolation(error)) throw conflict("ALREADY_MEMBER", "את כבר חברה בכיתה הזו.");
            throw error;
        }

        return { classId: classItem.id, ...toClassOptionDto(classItem, "Member") };
    },

    async rename(classId: number, name: string, role: ClassRole): Promise<ClassOptionDto> {
        const classItem = await classRepository.updateName(classId, name);
        return toClassOptionDto(classItem, role);
    },

    async getInviteCode(classId: number) {
        const classItem = await classRepository.findById(classId);
        if (!classItem) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
        return { inviteCode: classItem.inviteCode };
    },

    async regenerateInviteCode(classId: number) {
        const classItem = await withUniqueInviteCode((inviteCode) =>
            classRepository.updateInviteCode(classId, inviteCode)
        );
        return { inviteCode: classItem.inviteCode };
    },

    /** Deletes a class with all its memberships, posts, reactions — and the stored images. */
    async delete(classId: number): Promise<void> {
        const imageKeys = await prisma.$transaction(async (tx) => {
            const locked = await classRepository.lockForUpdate(tx, classId);
            if (!locked) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
            const keys = await classRepository.listImageKeys(classId, tx);
            await classRepository.delete(classId, tx);
            return keys;
        });
        await deleteStoredImages(imageKeys);
    },
};

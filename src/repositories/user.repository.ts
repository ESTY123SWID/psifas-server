import type { GlobalRole } from "../generated/prisma/enums.js";
import { type DbClient, prisma } from "../lib/prisma.js";

/** Never select passwordHash unless a function explicitly needs it for verification. */
const publicUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    sessionVersion: true,
    createdAt: true,
} as const;

export const userRepository = {
    findById(id: number, db: DbClient = prisma) {
        return db.user.findUnique({ where: { id }, select: publicUserSelect });
    },

    findByEmailWithPasswordHash(email: string) {
        return prisma.user.findUnique({
            where: { email },
            select: { ...publicUserSelect, passwordHash: true },
        });
    },

    create(data: { name: string; email: string; passwordHash: string; role?: GlobalRole }) {
        return prisma.user.create({ data, select: publicUserSelect });
    },

    updateProfile(id: number, data: { name: string; email: string }) {
        return prisma.user.update({ where: { id }, data, select: publicUserSelect });
    },

    findPasswordHash(id: number) {
        return prisma.user.findUnique({ where: { id }, select: { passwordHash: true } });
    },

    /** Stores the new hash and revokes all existing sessions; returns the new session version. */
    async updatePassword(id: number, passwordHash: string): Promise<number> {
        const user = await prisma.user.update({
            where: { id },
            data: { passwordHash, sessionVersion: { increment: 1 } },
            select: { sessionVersion: true },
        });
        return user.sessionVersion;
    },

    updateRole(id: number, role: GlobalRole, db: DbClient = prisma) {
        return db.user.update({ where: { id }, data: { role }, select: publicUserSelect });
    },

    delete(id: number, db: DbClient = prisma) {
        return db.user.delete({ where: { id } });
    },

    countSystemAdmins(db: DbClient = prisma) {
        return db.user.count({ where: { role: "SystemAdmin" } });
    },
};

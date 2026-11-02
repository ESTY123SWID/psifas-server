import type { ClassRole } from "../generated/prisma/enums.js";
import { type DbClient, prisma } from "../lib/prisma.js";

const memberWithUser = {
    role: true,
    joinedAt: true,
    user: { select: { id: true, name: true, email: true } },
} as const;

export const membershipRepository = {
    find(userId: number, classId: number, db: DbClient = prisma) {
        return db.classMember.findUnique({ where: { userId_classId: { userId, classId } } });
    },

    listClassesOfUser(userId: number) {
        return prisma.classMember.findMany({
            where: { userId },
            include: { class: { select: { id: true, name: true, createdAt: true } } },
            orderBy: [{ joinedAt: "asc" }, { classId: "asc" }],
        });
    },

    /** Managers first, then by join date. */
    listMembers(classId: number, skip: number, take: number) {
        return prisma.classMember.findMany({
            where: { classId },
            select: memberWithUser,
            orderBy: [{ role: "desc" }, { joinedAt: "asc" }, { userId: "asc" }],
            skip,
            take,
        });
    },

    listManagers(classId: number) {
        return prisma.classMember.findMany({
            where: { classId, role: "ClassManager" },
            select: memberWithUser,
            orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        });
    },

    count(classId: number) {
        return prisma.classMember.count({ where: { classId } });
    },

    countManagers(classId: number, db: DbClient = prisma) {
        return db.classMember.count({ where: { classId, role: "ClassManager" } });
    },

    create(userId: number, classId: number, role: ClassRole, db: DbClient = prisma) {
        return db.classMember.create({ data: { userId, classId, role } });
    },

    updateRole(userId: number, classId: number, role: ClassRole, db: DbClient = prisma) {
        return db.classMember.update({
            where: { userId_classId: { userId, classId } },
            data: { role },
        });
    },

    delete(userId: number, classId: number, db: DbClient = prisma) {
        return db.classMember.delete({ where: { userId_classId: { userId, classId } } });
    },

    /** True if the user already belongs to a class with this name (case-insensitive). */
    async userHasClassNamed(userId: number, name: string): Promise<boolean> {
        const found = await prisma.classMember.findFirst({
            where: { userId, class: { name: { equals: name, mode: "insensitive" } } },
            select: { classId: true },
        });
        return found !== null;
    },
};

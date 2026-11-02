import type { ClassRole, GlobalRole } from "../generated/prisma/enums.js";
import { type TransactionClient, prisma } from "../lib/prisma.js";
import { type AdminClassRow, type AdminUserRow, adminRepository } from "../repositories/admin.repository.js";
import { classRepository } from "../repositories/class.repository.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import type { AdminClassesQuery, AdminUsersQuery } from "../schemas/admin.schema.js";
import { conflict, forbidden, notFound } from "../utils/httpError.js";
import { type PageRequest, buildPage, toSkipTake } from "../utils/pagination.js";
import { classService } from "./class.service.js";
import { memberService } from "./member.service.js";

type ManagerStats = { managed: number; lastManager: number };

function toAdminUser(row: AdminUserRow, stats: ManagerStats, systemAdminCount: number, viewerId: number) {
    const isSelf = row.id === viewerId;
    const isLastSystemAdmin = row.role === "SystemAdmin" && systemAdminCount <= 1;
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        registeredAt: row.createdAt.toISOString(),
        classCount: row._count.memberships,
        systemAdminCount,
        managedClassCount: stats.managed,
        lastManagerClassCount: stats.lastManager,
        canChangeRole: !isSelf,
        canDelete: !isSelf && !isLastSystemAdmin && stats.lastManager === 0,
    };
}

function toAdminClass(row: AdminClassRow) {
    return {
        id: row.id,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        inviteCode: row.inviteCode,
        memberCount: row._count.members,
        postCount: row._count.posts,
        managerName: row.members[0]?.user.name ?? null,
    };
}

/** Serializes every change that could remove the last system admin. */
async function lockSystemAdmins(tx: TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "role" = 'SystemAdmin' FOR UPDATE`;
}

async function loadAdminUser(userId: number, viewerId: number, db: TransactionClient | typeof prisma = prisma) {
    const row = await adminRepository.findUser(userId, db);
    if (!row) throw notFound("המשתמשת לא נמצאה.", "USER_NOT_FOUND");
    const [stats, systemAdminCount] = await Promise.all([
        adminRepository.managerStats([userId], db),
        userRepository.countSystemAdmins(db),
    ]);
    return toAdminUser(row, stats.get(userId)!, systemAdminCount, viewerId);
}

export const adminService = {
    async dashboard() {
        const data = await adminRepository.dashboard();
        return {
            totalUsers: data.totalUsers,
            totalClasses: data.totalClasses,
            totalPosts: data.totalPosts,
            systemAdminCount: data.systemAdminCount,
            newUsersThisWeek: data.newUsersThisWeek,
            newPostsThisWeek: data.newPostsThisWeek,
            imagePostCount: data.imagePostCount,
            recentUsers: data.recentUsers.map((user) => ({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                registeredAt: user.createdAt.toISOString(),
            })),
            recentClasses: data.recentClasses.map((classItem) => ({
                id: classItem.id,
                name: classItem.name,
                createdAt: classItem.createdAt.toISOString(),
            })),
        };
    },

    async listUsers(query: AdminUsersQuery, viewerId: number) {
        const request = { page: query.page, pageSize: query.pageSize };
        const { skip, take } = toSkipTake(request);
        const { items, total } = await adminRepository.listUsers(query, skip, take);
        const [stats, systemAdminCount] = await Promise.all([
            adminRepository.managerStats(items.map((user) => user.id)),
            userRepository.countSystemAdmins(),
        ]);
        return buildPage(
            items.map((user) => toAdminUser(user, stats.get(user.id)!, systemAdminCount, viewerId)),
            total,
            request
        );
    },

    getUser(userId: number, viewerId: number) {
        return loadAdminUser(userId, viewerId);
    },

    async updateUserRole(userId: number, role: GlobalRole, viewerId: number) {
        if (userId === viewerId) {
            throw forbidden("לא ניתן לשנות את התפקיד של עצמך.", "CANNOT_CHANGE_OWN_ROLE");
        }
        return prisma.$transaction(async (tx) => {
            await lockSystemAdmins(tx);
            const target = await userRepository.findById(userId, tx);
            if (!target) throw notFound("המשתמשת לא נמצאה.", "USER_NOT_FOUND");

            if (target.role === "SystemAdmin" && role === "User" && (await userRepository.countSystemAdmins(tx)) <= 1) {
                throw conflict("LAST_SYSTEM_ADMIN", "לא ניתן להסיר את הרשאת מנהלת המערכת האחרונה.");
            }
            if (target.role !== role) await userRepository.updateRole(userId, role, tx);
            return loadAdminUser(userId, viewerId, tx);
        });
    },

    /**
     * Deletes an account. Memberships and reactions are removed; the user's posts are kept with
     * the author cleared (anonymised), as the client's confirmation dialog promises.
     */
    async deleteUser(userId: number, viewerId: number): Promise<void> {
        if (userId === viewerId) {
            throw forbidden("לא ניתן למחוק את החשבון שלך מתוך מסך הניהול.", "CANNOT_DELETE_SELF");
        }
        await prisma.$transaction(async (tx) => {
            await lockSystemAdmins(tx);
            // Lock every class this user manages, so no other manager can be removed meanwhile.
            await tx.$queryRaw`
                SELECT c."id" FROM "Class" c
                JOIN "ClassMember" m ON m."classId" = c."id"
                WHERE m."userId" = ${userId} AND m."role" = 'ClassManager'
                FOR UPDATE OF c`;

            const target = await userRepository.findById(userId, tx);
            if (!target) throw notFound("המשתמשת לא נמצאה.", "USER_NOT_FOUND");

            if (target.role === "SystemAdmin" && (await userRepository.countSystemAdmins(tx)) <= 1) {
                throw conflict("LAST_SYSTEM_ADMIN", "לא ניתן למחוק את מנהלת המערכת האחרונה.");
            }
            const stats = (await adminRepository.managerStats([userId], tx)).get(userId)!;
            if (stats.lastManager > 0) {
                throw conflict(
                    "LAST_MANAGER",
                    "המשתמשת היא המנהלת האחרונה בכיתה אחת או יותר. יש להעביר קודם את הניהול."
                );
            }
            await userRepository.delete(userId, tx);
        });
    },

    async listClasses(query: AdminClassesQuery) {
        const request = { page: query.page, pageSize: query.pageSize };
        const { skip, take } = toSkipTake(request);
        const { items, total } = await adminRepository.listClasses(query, skip, take);
        return buildPage(items.map(toAdminClass), total, request);
    },

    async getClass(classId: number) {
        const row = await adminRepository.findClass(classId);
        if (!row) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
        const managers = await membershipRepository.listManagers(classId);
        return {
            ...toAdminClass(row),
            managerCount: managers.length,
            managers: managers.map((member) => ({
                id: member.user.id,
                name: member.user.name,
                email: member.user.email,
                role: member.role,
            })),
        };
    },

    async listClassMembers(classId: number, request: PageRequest) {
        const row = await adminRepository.findClass(classId);
        if (!row) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
        const { skip, take } = toSkipTake(request);
        const members = await membershipRepository.listMembers(classId, skip, take);
        return buildPage(
            members.map((member) => ({
                id: member.user.id,
                name: member.user.name,
                email: member.user.email,
                role: member.role,
            })),
            row._count.members,
            request
        );
    },

    async renameClass(classId: number, name: string) {
        const row = await adminRepository.findClass(classId);
        if (!row) throw notFound("הכיתה לא נמצאה.", "CLASS_NOT_FOUND");
        await classRepository.updateName(classId, name);
        return this.getClass(classId);
    },

    /** Same "at least one manager" rule as in the class itself, without requiring a class role. */
    async updateClassMemberRole(classId: number, userId: number, role: ClassRole) {
        return memberService.updateRole(classId, null, userId, role);
    },

    removeClassMember(classId: number, userId: number) {
        return memberService.remove(classId, null, userId);
    },

    deleteClass(classId: number) {
        return classService.delete(classId);
    },
};

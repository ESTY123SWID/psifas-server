import type { Prisma } from "../generated/prisma/client.js";
import { type DbClient, prisma } from "../lib/prisma.js";
import type { AdminClassesQuery, AdminUsersQuery } from "../schemas/admin.schema.js";

const adminUserSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    createdAt: true,
    _count: { select: { memberships: true } },
} as const satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

const adminClassSelect = {
    id: true,
    name: true,
    inviteCode: true,
    createdAt: true,
    _count: { select: { members: true, posts: true } },
    members: {
        where: { role: "ClassManager" },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
        take: 1,
        select: { user: { select: { name: true } } },
    },
} as const satisfies Prisma.ClassSelect;

export type AdminClassRow = Prisma.ClassGetPayload<{ select: typeof adminClassSelect }>;

export const adminRepository = {
    async dashboard() {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const [
            totalUsers, totalClasses, totalPosts, systemAdminCount, newUsersThisWeek, newPostsThisWeek, imagePostCount,
            recentUsers, recentClasses,
        ] = await prisma.$transaction([
            prisma.user.count(),
            prisma.class.count(),
            prisma.post.count(),
            prisma.user.count({ where: { role: "SystemAdmin" } }),
            prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
            prisma.post.count({ where: { createdAt: { gte: weekAgo } } }),
            prisma.post.count({ where: { type: "image" } }),
            prisma.user.findMany({
                select: { id: true, name: true, email: true, role: true, createdAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 5,
            }),
            prisma.class.findMany({
                select: { id: true, name: true, createdAt: true },
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                take: 5,
            }),
        ]);
        return {
            totalUsers, totalClasses, totalPosts, systemAdminCount, newUsersThisWeek, newPostsThisWeek, imagePostCount,
            recentUsers, recentClasses,
        };
    },

    async listUsers(query: AdminUsersQuery, skip: number, take: number) {
        const where: Prisma.UserWhereInput = {
            ...(query.role ? { role: query.role } : {}),
            ...(query.search
                ? {
                    OR: [
                        { name: { contains: query.search, mode: "insensitive" } },
                        { email: { contains: query.search, mode: "insensitive" } },
                    ],
                }
                : {}),
        };
        const orderBy: Prisma.UserOrderByWithRelationInput[] = query.sort === "registeredAt"
            ? [{ createdAt: query.order }, { id: query.order }]
            : [{ name: query.order }, { id: query.order }];

        const [items, total] = await prisma.$transaction([
            prisma.user.findMany({ where, select: adminUserSelect, orderBy, skip, take }),
            prisma.user.count({ where }),
        ]);
        return { items, total };
    },

    findUser(id: number, db: DbClient = prisma) {
        return db.user.findUnique({ where: { id }, select: adminUserSelect });
    },

    /**
     * For each user: in how many classes they are a manager, and in how many of those they are
     * the ONLY manager (which blocks deleting the account).
     */
    async managerStats(userIds: number[], db: DbClient = prisma) {
        const stats = new Map<number, { managed: number; lastManager: number }>();
        for (const id of userIds) stats.set(id, { managed: 0, lastManager: 0 });
        if (userIds.length === 0) return stats;

        const managed = await db.classMember.findMany({
            where: { userId: { in: userIds }, role: "ClassManager" },
            select: { userId: true, classId: true },
        });
        const classIds = [...new Set(managed.map((row) => row.classId))];
        const managerCounts = classIds.length === 0 ? [] : await db.classMember.groupBy({
            by: ["classId"],
            where: { classId: { in: classIds }, role: "ClassManager" },
            _count: { _all: true },
        });
        const countByClass = new Map(managerCounts.map((row) => [row.classId, row._count._all]));

        for (const row of managed) {
            const entry = stats.get(row.userId);
            if (!entry) continue;
            entry.managed += 1;
            if ((countByClass.get(row.classId) ?? 0) <= 1) entry.lastManager += 1;
        }
        return stats;
    },

    async listClasses(query: AdminClassesQuery, skip: number, take: number) {
        const where: Prisma.ClassWhereInput = query.search
            ? {
                OR: [
                    { name: { contains: query.search, mode: "insensitive" } },
                    { inviteCode: { contains: query.search.toUpperCase() } },
                ],
            }
            : {};
        const orderBy: Prisma.ClassOrderByWithRelationInput[] = query.sort === "createdAt"
            ? [{ createdAt: query.order }, { id: query.order }]
            : [{ name: query.order }, { id: query.order }];

        const [items, total] = await prisma.$transaction([
            prisma.class.findMany({ where, select: adminClassSelect, orderBy, skip, take }),
            prisma.class.count({ where }),
        ]);
        return { items, total };
    },

    findClass(id: number) {
        return prisma.class.findUnique({ where: { id }, select: adminClassSelect });
    },
};

import { type DbClient, type TransactionClient, prisma } from "../lib/prisma.js";

export const classRepository = {
    async exists(id: number): Promise<boolean> {
        const found = await prisma.class.findUnique({ where: { id }, select: { id: true } });
        return found !== null;
    },

    findById(id: number, db: DbClient = prisma) {
        return db.class.findUnique({ where: { id } });
    },

    findByInviteCode(inviteCode: string) {
        return prisma.class.findUnique({ where: { inviteCode } });
    },

    inviteCodeExists(inviteCode: string, db: DbClient = prisma) {
        return db.class.findUnique({ where: { inviteCode }, select: { id: true } }).then(Boolean);
    },

    /** Creates the class and makes its creator the first ClassManager, atomically. */
    createWithManager(tx: TransactionClient, data: { name: string; inviteCode: string; managerId: number }) {
        return tx.class.create({
            data: {
                name: data.name,
                inviteCode: data.inviteCode,
                members: { create: { userId: data.managerId, role: "ClassManager" } },
            },
        });
    },

    updateName(id: number, name: string) {
        return prisma.class.update({ where: { id }, data: { name } });
    },

    updateInviteCode(id: number, inviteCode: string) {
        return prisma.class.update({ where: { id }, data: { inviteCode } });
    },

    /** Deletes the class; memberships, posts and reactions cascade in the database. */
    delete(id: number, db: DbClient = prisma) {
        return db.class.delete({ where: { id } });
    },

    /**
     * Row-locks the class for the rest of the transaction. All membership changes that must keep
     * "at least one manager" true take this lock first, so concurrent requests are serialized.
     */
    async lockForUpdate(tx: TransactionClient, id: number): Promise<boolean> {
        const rows = await tx.$queryRaw<{ id: number }[]>`SELECT "id" FROM "Class" WHERE "id" = ${id} FOR UPDATE`;
        return rows.length > 0;
    },

    async listImageKeys(id: number, db: DbClient = prisma): Promise<string[]> {
        const posts = await db.post.findMany({
            where: { classId: id, imageKey: { not: null } },
            select: { imageKey: true },
        });
        return posts.flatMap((post) => (post.imageKey ? [post.imageKey] : []));
    },
};

import type { ReactionType } from "../generated/prisma/enums.js";
import { type TransactionClient, prisma } from "../lib/prisma.js";

export const reactionRepository = {
    find(postId: number, userId: number, db: TransactionClient | typeof prisma = prisma) {
        return db.reaction.findUnique({ where: { postId_userId: { postId, userId } } });
    },

    create(postId: number, userId: number, type: ReactionType, db: TransactionClient) {
        return db.reaction.create({ data: { postId, userId, type } });
    },

    updateType(postId: number, userId: number, type: ReactionType, db: TransactionClient) {
        return db.reaction.update({ where: { postId_userId: { postId, userId } }, data: { type } });
    },

    delete(postId: number, userId: number, db: TransactionClient) {
        return db.reaction.delete({ where: { postId_userId: { postId, userId } } });
    },

    countsByPost(postIds: number[]) {
        if (postIds.length === 0) return Promise.resolve([]);
        return prisma.reaction.groupBy({
            by: ["postId", "type"],
            where: { postId: { in: postIds } },
            _count: { _all: true },
        });
    },

    reactionsOfUser(postIds: number[], userId: number) {
        if (postIds.length === 0) return Promise.resolve([]);
        return prisma.reaction.findMany({
            where: { postId: { in: postIds }, userId },
            select: { postId: true, type: true },
        });
    },
};

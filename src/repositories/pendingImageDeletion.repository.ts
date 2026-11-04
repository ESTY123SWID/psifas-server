import { prisma } from "../lib/prisma.js";

export const pendingImageDeletionRepository = {
    /** Records keys before their files are deleted (already-recorded keys are kept as they are). */
    add(keys: string[]) {
        return prisma.pendingImageDeletion.createMany({
            data: keys.map((key) => ({ key })),
            skipDuplicates: true,
        });
    },

    /** Least recently tried first: a key that keeps failing moves to the back and never blocks the others. */
    listOldest(take: number) {
        return prisma.pendingImageDeletion.findMany({ orderBy: { updatedAt: "asc" }, take, select: { key: true } });
    },

    remove(keys: string[]) {
        return prisma.pendingImageDeletion.deleteMany({ where: { key: { in: keys } } });
    },

    recordFailure(key: string, error: string) {
        return prisma.pendingImageDeletion.update({
            where: { key },
            data: { attempts: { increment: 1 }, lastError: error.slice(0, 500) },
        });
    },
};

import { Prisma } from "../generated/prisma/client.js";
import type { ReactionType } from "../generated/prisma/enums.js";
import { prisma } from "../lib/prisma.js";
import { membershipRepository } from "../repositories/membership.repository.js";
import { postRepository } from "../repositories/post.repository.js";
import { reactionRepository } from "../repositories/reaction.repository.js";
import { forbidden, notFound } from "../utils/httpError.js";

/**
 * One reaction per user per post (enforced by the (postId, userId) primary key):
 *  - no reaction yet       → add it
 *  - same reaction again   → remove it (toggle off)
 *  - different reaction    → switch to the new one
 */
async function applyToggle(postId: number, userId: number, reaction: ReactionType): Promise<ReactionType | null> {
    return prisma.$transaction(async (tx) => {
        const existing = await reactionRepository.find(postId, userId, tx);
        if (!existing) {
            await reactionRepository.create(postId, userId, reaction, tx);
            return reaction;
        }
        if (existing.type === reaction) {
            await reactionRepository.delete(postId, userId, tx);
            return null;
        }
        await reactionRepository.updateType(postId, userId, reaction, tx);
        return reaction;
    });
}

function isRetryableConflict(error: unknown): boolean {
    // P2002: a concurrent request inserted the row first. P2025: it deleted the row first.
    return error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2025");
}

export const reactionService = {
    async toggle(postId: number, userId: number, reaction: ReactionType) {
        const post = await postRepository.findById(postId);
        if (!post) throw notFound("הפרסום לא נמצא.", "POST_NOT_FOUND");

        // Reactions are scoped by the post's class — the caller must be a member of it.
        const membership = await membershipRepository.find(userId, post.classId);
        if (!membership) throw forbidden("אינך חברה בכיתה של הפרסום.", "NOT_A_MEMBER");

        let myReaction: ReactionType | null;
        try {
            myReaction = await applyToggle(postId, userId, reaction);
        } catch (error) {
            if (!isRetryableConflict(error)) throw error;
            myReaction = await applyToggle(postId, userId, reaction);
        }

        return { postId, classId: post.classId, myReaction };
    },
};

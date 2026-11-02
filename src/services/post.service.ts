import { createHash } from "node:crypto";

import type { ClassRole, ReactionType } from "../generated/prisma/enums.js";
import { type PostWithAuthor, postRepository } from "../repositories/post.repository.js";
import { reactionRepository } from "../repositories/reaction.repository.js";
import type { CreatePostBody, PostsQuery, UpdatePostBody } from "../schemas/post.schema.js";
import { REACTION_TYPES } from "../schemas/post.schema.js";
import { deleteStoredImages, storage } from "../storage/index.js";
import type { UploadedImage } from "../middleware/upload.js";
import type { FeaturedItemDto, PostDto, ReactionCountsDto, RecentPostDto } from "../types/api.types.js";
import { badRequest, forbidden, notFound } from "../utils/httpError.js";
import { buildPage, toSkipTake } from "../utils/pagination.js";

function emptyReactionCounts(): ReactionCountsDto {
    return Object.fromEntries(REACTION_TYPES.map((type) => [type, 0])) as ReactionCountsDto;
}

/** Adds reaction counts, the viewer's own reaction and a (signed) image URL to each post. */
async function toPostDtos(posts: PostWithAuthor[], viewerId: number): Promise<PostDto[]> {
    const postIds = posts.map((post) => post.id);
    const [counts, mine] = await Promise.all([
        reactionRepository.countsByPost(postIds),
        reactionRepository.reactionsOfUser(postIds, viewerId),
    ]);

    const countsByPost = new Map<number, ReactionCountsDto>();
    for (const row of counts) {
        const entry = countsByPost.get(row.postId) ?? emptyReactionCounts();
        entry[row.type] = row._count._all;
        countsByPost.set(row.postId, entry);
    }
    const myReactionByPost = new Map<number, ReactionType>(mine.map((row) => [row.postId, row.type]));

    return posts.map((post) => ({
        id: post.id,
        authorId: post.authorId,
        type: post.type,
        title: post.title,
        authorName: post.author?.name ?? null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        content: post.content,
        imageUrl: post.imageKey ? storage.getReadUrl(post.imageKey) : null,
        reactions: countsByPost.get(post.id) ?? emptyReactionCounts(),
        myReaction: myReactionByPost.get(post.id) ?? null,
    }));
}

async function toPostDto(post: PostWithAuthor, viewerId: number): Promise<PostDto> {
    const [dto] = await toPostDtos([post], viewerId);
    return dto!;
}

async function findPostOrThrow(classId: number, postId: number): Promise<PostWithAuthor> {
    const post = await postRepository.findInClass(classId, postId);
    if (!post) throw notFound("הפרסום לא נמצא.", "POST_NOT_FOUND");
    return post;
}

/** Authors may edit/delete their own posts; class managers may edit/delete any post in their class. */
function assertCanManagePost(post: PostWithAuthor, userId: number, role: ClassRole): void {
    if (post.authorId !== userId && role !== "ClassManager") {
        throw forbidden("רק מי שפרסמה את הפרסום או מנהלת הכיתה יכולות לשנות אותו.", "NOT_POST_OWNER");
    }
}

function imagePrefix(classId: number): string {
    return `classes/${classId}`;
}

/** Same post for a whole (UTC) day, different per class — stable across refetches. */
function dailyOffset(classId: number, count: number, now = new Date()): number {
    const seed = `${classId}:${now.toISOString().slice(0, 10)}`;
    const hash = createHash("sha256").update(seed).digest();
    return hash.readUInt32BE(0) % count;
}

export const postService = {
    async list(classId: number, viewerId: number, query: PostsQuery) {
        const request = { page: query.page, pageSize: query.pageSize };
        const { skip, take } = toSkipTake(request);
        const { items, total } = await postRepository.list(classId, query, skip, take);
        return buildPage(await toPostDtos(items, viewerId), total, request);
    },

    async recent(classId: number, limit: number): Promise<RecentPostDto[]> {
        const posts = await postRepository.listRecent(classId, limit);
        return posts.map((post) => ({
            id: post.id,
            title: post.title,
            authorName: post.author?.name ?? "משתמשת שנמחקה",
            createdAt: post.createdAt.toISOString(),
        }));
    },

    async get(classId: number, postId: number, viewerId: number): Promise<PostDto> {
        return toPostDto(await findPostOrThrow(classId, postId), viewerId);
    },

    async featured(classId: number, viewerId: number): Promise<FeaturedItemDto | null> {
        const count = await postRepository.countFeaturedCandidates(classId);
        if (count === 0) return null;
        const post = await postRepository.findFeaturedCandidateAt(classId, dailyOffset(classId, count));
        if (!post) return null;
        const dto = await toPostDto(post, viewerId);
        return {
            id: dto.id,
            type: dto.type,
            text: dto.content,
            imageUrl: dto.imageUrl,
            reactions: dto.reactions,
            myReaction: dto.myReaction,
        };
    },

    async create(classId: number, authorId: number, body: CreatePostBody, image: UploadedImage | null): Promise<PostDto> {
        if (body.type === "quote") {
            if (!body.content) throw badRequest("VALIDATION_ERROR", "יש להזין את תוכן המשפט.");
            if (image) throw badRequest("VALIDATION_ERROR", "לפרסום מסוג משפט לא ניתן לצרף תמונה.");
        }
        if (body.type === "image" && !image) {
            throw badRequest("VALIDATION_ERROR", "יש לבחור תמונה.");
        }

        const imageKey = image
            ? await storage.save({ ...image, prefix: imagePrefix(classId) })
            : null;

        try {
            const post = await postRepository.create({
                classId,
                authorId,
                type: body.type,
                title: body.title,
                content: body.content ?? null,
                imageKey,
            });
            return toPostDto(post, authorId);
        } catch (error) {
            if (imageKey) await deleteStoredImages([imageKey]);
            throw error;
        }
    },

    async update(
        classId: number,
        postId: number,
        user: { id: number; role: ClassRole },
        body: UpdatePostBody,
        image: UploadedImage | null
    ): Promise<PostDto> {
        const post = await findPostOrThrow(classId, postId);
        assertCanManagePost(post, user.id, user.role);

        if (body.type && body.type !== post.type) {
            throw badRequest("VALIDATION_ERROR", "לא ניתן לשנות את סוג הפרסום.");
        }
        const content = body.content === undefined ? post.content : body.content || null;
        if (post.type === "quote") {
            if (!content) throw badRequest("VALIDATION_ERROR", "יש להזין את תוכן המשפט.");
            if (image || body.removeImage) throw badRequest("VALIDATION_ERROR", "לפרסום מסוג משפט אין תמונה.");
        }

        const newImageKey = image ? await storage.save({ ...image, prefix: imagePrefix(classId) }) : null;
        const replacesImage = newImageKey !== null || body.removeImage;

        let updated: PostWithAuthor;
        try {
            updated = await postRepository.update(postId, {
                title: body.title,
                content,
                ...(replacesImage ? { imageKey: newImageKey } : {}),
            });
        } catch (error) {
            if (newImageKey) await deleteStoredImages([newImageKey]);
            throw error;
        }

        if (replacesImage && post.imageKey) await deleteStoredImages([post.imageKey]);
        return toPostDto(updated, user.id);
    },

    async delete(classId: number, postId: number, user: { id: number; role: ClassRole }): Promise<void> {
        const post = await findPostOrThrow(classId, postId);
        assertCanManagePost(post, user.id, user.role);
        await postRepository.delete(postId);
        if (post.imageKey) await deleteStoredImages([post.imageKey]);
    },
};

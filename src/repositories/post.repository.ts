import type { Prisma } from "../generated/prisma/client.js";
import type { PostType } from "../generated/prisma/enums.js";
import { type DbClient, prisma } from "../lib/prisma.js";
import type { PostsQuery } from "../schemas/post.schema.js";

export const postWithAuthorSelect = {
    id: true,
    classId: true,
    authorId: true,
    type: true,
    title: true,
    content: true,
    imageKey: true,
    createdAt: true,
    updatedAt: true,
    author: { select: { name: true } },
} as const satisfies Prisma.PostSelect;

export type PostWithAuthor = Prisma.PostGetPayload<{ select: typeof postWithAuthorSelect }>;

function buildWhere(classId: number, query: Pick<PostsQuery, "type" | "authorId" | "search">): Prisma.PostWhereInput {
    return {
        classId,
        ...(query.type ? { type: query.type } : {}),
        ...(query.authorId ? { authorId: query.authorId } : {}),
        ...(query.search
            ? {
                OR: [
                    { title: { contains: query.search, mode: "insensitive" } },
                    { content: { contains: query.search, mode: "insensitive" } },
                ],
            }
            : {}),
    };
}

function buildOrderBy(sort: PostsQuery["sort"]): Prisma.PostOrderByWithRelationInput[] {
    switch (sort) {
        case "oldest":
            return [{ createdAt: "asc" }, { id: "asc" }];
        case "popular":
            return [{ reactions: { _count: "desc" } }, { createdAt: "desc" }, { id: "desc" }];
        case "newest":
            return [{ createdAt: "desc" }, { id: "desc" }];
    }
}

export const postRepository = {
    async list(classId: number, query: PostsQuery, skip: number, take: number) {
        const where = buildWhere(classId, query);
        const [items, total] = await prisma.$transaction([
            prisma.post.findMany({
                where,
                select: postWithAuthorSelect,
                orderBy: buildOrderBy(query.sort),
                skip,
                take,
            }),
            prisma.post.count({ where }),
        ]);
        return { items, total };
    },

    listRecent(classId: number, limit: number) {
        return prisma.post.findMany({
            where: { classId },
            select: { id: true, title: true, createdAt: true, author: { select: { name: true } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: limit,
        });
    },

    findInClass(classId: number, postId: number) {
        return prisma.post.findFirst({ where: { id: postId, classId }, select: postWithAuthorSelect });
    },

    findById(postId: number) {
        return prisma.post.findUnique({ where: { id: postId }, select: { id: true, classId: true } });
    },

    create(data: {
        classId: number;
        authorId: number;
        type: PostType;
        title: string;
        content: string | null;
        imageKey: string | null;
    }) {
        return prisma.post.create({ data, select: postWithAuthorSelect });
    },

    update(postId: number, data: { title: string; content: string | null; imageKey?: string | null }) {
        return prisma.post.update({ where: { id: postId }, data, select: postWithAuthorSelect });
    },

    delete(postId: number, db: DbClient = prisma) {
        return db.post.delete({ where: { id: postId } });
    },

    /** Posts eligible for the home-page "featured" slot: quotes, and image posts that still have an image. */
    featuredCandidatesWhere(classId: number): Prisma.PostWhereInput {
        return {
            classId,
            OR: [{ type: "quote" }, { type: "image", imageKey: { not: null } }],
        };
    },

    countFeaturedCandidates(classId: number) {
        return prisma.post.count({ where: this.featuredCandidatesWhere(classId) });
    },

    findFeaturedCandidateAt(classId: number, offset: number) {
        return prisma.post.findFirst({
            where: this.featuredCandidatesWhere(classId),
            select: postWithAuthorSelect,
            orderBy: { id: "asc" },
            skip: offset,
        });
    },

    countAll() {
        return prisma.post.count();
    },
};

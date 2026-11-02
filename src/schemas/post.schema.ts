import { z } from "zod";

import { idSchema, optionalSearchSchema, pageSchema, pageSizeSchema } from "./common.schema.js";

export const POST_TYPES = ["quote", "image"] as const;
export const REACTION_TYPES = [
    "like", "love", "laugh", "adore", "touched", "wow", "applause", "fire",
] as const;

export const postTypeSchema = z.enum(POST_TYPES, { error: "סוג הפרסום חייב להיות quote או image." });

const titleSchema = z
    .string({ error: "יש להזין כותרת." })
    .trim()
    .min(1, "יש להזין כותרת.")
    .max(150, "הכותרת לא יכולה לעלות על 150 תווים.");

const contentSchema = z
    .string()
    .trim()
    .max(2000, "התוכן לא יכול לעלות על 2000 תווים.")
    .optional()
    .transform((value) => value || undefined);

/** multipart/form-data body of POST /classes/:classId/posts (image arrives separately via multer). */
export const createPostBodySchema = z.object({
    type: postTypeSchema,
    title: titleSchema,
    content: contentSchema,
});

/** multipart/form-data body of PATCH /classes/:classId/posts/:postId. */
export const updatePostBodySchema = z.object({
    type: postTypeSchema.optional(),
    title: titleSchema,
    content: z
        .string()
        .trim()
        .max(2000, "התוכן לא יכול לעלות על 2000 תווים.")
        .optional(),
    removeImage: z
        .enum(["true", "false"], { error: "removeImage חייב להיות true או false." })
        .optional()
        .transform((value) => value === "true"),
});

export const postParamsSchema = z.object({
    classId: idSchema,
    postId: idSchema,
});

export const postsQuerySchema = z.object({
    type: postTypeSchema.optional(),
    authorId: idSchema.optional(),
    search: optionalSearchSchema,
    sort: z.enum(["newest", "oldest", "popular"]).default("newest"),
    page: pageSchema,
    pageSize: pageSizeSchema(10, 50),
});

export const recentPostsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const reactionParamsSchema = z.object({ postId: idSchema });

export const toggleReactionSchema = z.object({
    reaction: z.enum(REACTION_TYPES, { error: "סוג התגובה אינו נתמך." }),
});

export type CreatePostBody = z.infer<typeof createPostBodySchema>;
export type UpdatePostBody = z.infer<typeof updatePostBodySchema>;
export type PostsQuery = z.infer<typeof postsQuerySchema>;

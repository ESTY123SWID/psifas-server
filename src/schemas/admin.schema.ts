import { z } from "zod";

import { idSchema, optionalSearchSchema, pageSchema, pageSizeSchema, sortOrderSchema } from "./common.schema.js";

export const adminUsersQuerySchema = z.object({
    page: pageSchema,
    pageSize: pageSizeSchema(20),
    search: optionalSearchSchema,
    sort: z.enum(["name", "registeredAt"]).default("name"),
    role: z.enum(["User", "SystemAdmin"]).optional(),
    order: sortOrderSchema,
});

export const adminClassesQuerySchema = z.object({
    page: pageSchema,
    pageSize: pageSizeSchema(20),
    search: optionalSearchSchema,
    sort: z.enum(["name", "createdAt"]).default("name"),
    order: sortOrderSchema,
});

export const adminClassMembersQuerySchema = z.object({
    page: pageSchema,
    pageSize: pageSizeSchema(20),
});

export const userIdParamsSchema = z.object({ userId: idSchema });

export const updateGlobalRoleSchema = z.object({
    role: z.enum(["User", "SystemAdmin"], { error: "התפקיד חייב להיות User או SystemAdmin." }),
});

export const adminMemberParamsSchema = z.object({ classId: idSchema, userId: idSchema });

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminClassesQuery = z.infer<typeof adminClassesQuerySchema>;

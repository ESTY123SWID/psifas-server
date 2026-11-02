import { z } from "zod";

import { idSchema, pageSchema, pageSizeSchema } from "./common.schema.js";

export const classNameSchema = z
    .string({ error: "יש להזין שם לכיתה." })
    .trim()
    .min(1, "יש להזין שם לכיתה.")
    .max(100, "שם הכיתה לא יכול לעלות על 100 תווים.");

export const createClassSchema = z.object({ name: classNameSchema });

export const updateClassSchema = z.object({ name: classNameSchema });

export const joinClassSchema = z.object({
    inviteCode: z
        .string({ error: "יש להזין קוד הצטרפות." })
        .trim()
        .min(1, "יש להזין קוד הצטרפות.")
        .max(32, "קוד ההצטרפות שגוי או לא תקף."),
});

export const classRoleSchema = z.enum(["Member", "ClassManager"], {
    error: "התפקיד חייב להיות Member או ClassManager.",
});

export const updateMemberRoleSchema = z.object({ role: classRoleSchema });

export const memberParamsSchema = z.object({
    classId: idSchema,
    memberId: idSchema,
});

export const membersQuerySchema = z.object({
    page: pageSchema,
    pageSize: pageSizeSchema(20),
});

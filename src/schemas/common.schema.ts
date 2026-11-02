import { z } from "zod";

export const idSchema = z.coerce
    .number({ error: "מזהה לא תקין." })
    .int("מזהה לא תקין.")
    .positive("מזהה לא תקין.")
    .max(2_147_483_647, "מזהה לא תקין.");

export const classIdParamsSchema = z.object({ classId: idSchema });

export const pageSchema = z.coerce.number().int().min(1).max(100_000).default(1);

export const pageSizeSchema = (defaultSize: number, maxSize = 100) =>
    z.coerce.number().int().min(1).max(maxSize).default(defaultSize);

/** Trims, and turns an empty string into undefined. */
export const optionalSearchSchema = z
    .string()
    .max(100, "מחרוזת החיפוש ארוכה מדי.")
    .optional()
    .transform((value) => value?.trim() || undefined);

export const sortOrderSchema = z.enum(["asc", "desc"]).default("asc");

export const nameSchema = z
    .string({ error: "יש להזין שם." })
    .trim()
    .min(2, "השם חייב להכיל לפחות 2 תווים.")
    .max(100, "השם לא יכול לעלות על 100 תווים.");

export const emailSchema = z
    .string({ error: "יש להזין כתובת אימייל." })
    .trim()
    .toLowerCase()
    .max(254, "כתובת האימייל ארוכה מדי.")
    .pipe(z.email("כתובת האימייל אינה תקינה."));

import { z } from "zod";

import { emailSchema, nameSchema } from "./common.schema.js";

// Same rule as the registration form in LoginRegisterPage.tsx.
const STRONG_PASSWORD = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const passwordPolicySchema = z
    .string({ error: "יש להזין סיסמה." })
    .max(128, "הסיסמה ארוכה מדי.")
    .regex(STRONG_PASSWORD, "הסיסמה חייבת להכיל לפחות 8 תווים, אות גדולה, אות קטנה, מספר ותו מיוחד.");

export const registerSchema = z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordPolicySchema,
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string({ error: "יש להזין סיסמה." }).min(1, "יש להזין סיסמה.").max(128),
});

export const updateProfileSchema = z.object({
    name: nameSchema,
    email: emailSchema,
});

export const changePasswordSchema = z
    .object({
        currentPassword: z.string({ error: "יש להזין את הסיסמה הנוכחית." }).min(1, "יש להזין את הסיסמה הנוכחית.").max(128),
        newPassword: passwordPolicySchema,
        confirmPassword: z.string().max(128).optional(),
    })
    .refine((data) => data.confirmPassword === undefined || data.confirmPassword === data.newPassword, {
        path: ["confirmPassword"],
        message: "אימות הסיסמה אינו תואם לסיסמה החדשה.",
    })
    .refine((data) => data.newPassword !== data.currentPassword, {
        path: ["newPassword"],
        message: "הסיסמה החדשה חייבת להיות שונה מהסיסמה הנוכחית.",
    });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

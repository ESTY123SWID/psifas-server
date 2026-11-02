import { Prisma } from "../generated/prisma/client.js";
import { userRepository } from "../repositories/user.repository.js";
import type { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput } from "../schemas/auth.schema.js";
import type { UserDto } from "../types/api.types.js";
import { HttpError, conflict, unauthorized } from "../utils/httpError.js";
import { toUserDto } from "../utils/mappers.js";
import { hashPassword, verifyAgainstDummyHash, verifyPassword } from "../utils/password.js";

const EMAIL_TAKEN = () => conflict("EMAIL_TAKEN", "כתובת האימייל כבר רשומה במערכת.");

function isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** What the controller needs to answer and to issue the session cookie. */
export interface AuthenticatedSession {
    user: UserDto;
    sessionVersion: number;
}

export const authService = {
    async register(input: RegisterInput): Promise<AuthenticatedSession> {
        const passwordHash = await hashPassword(input.password);
        try {
            const user = await userRepository.create({ name: input.name, email: input.email, passwordHash });
            return { user: toUserDto(user), sessionVersion: user.sessionVersion };
        } catch (error) {
            // The unique index on email is the source of truth (handles concurrent registrations).
            if (isUniqueViolation(error)) throw EMAIL_TAKEN();
            throw error;
        }
    },

    async login(input: LoginInput): Promise<AuthenticatedSession> {
        const user = await userRepository.findByEmailWithPasswordHash(input.email);
        if (!user) {
            await verifyAgainstDummyHash(input.password);
            throw new HttpError(401, "INVALID_CREDENTIALS", "האימייל או הסיסמה שגויים.");
        }
        const valid = await verifyPassword(user.passwordHash, input.password);
        if (!valid) throw new HttpError(401, "INVALID_CREDENTIALS", "האימייל או הסיסמה שגויים.");
        return { user: toUserDto(user), sessionVersion: user.sessionVersion };
    },

    async getCurrentUser(userId: number): Promise<UserDto> {
        const user = await userRepository.findById(userId);
        if (!user) throw unauthorized();
        return toUserDto(user);
    },

    async updateProfile(userId: number, input: UpdateProfileInput): Promise<UserDto> {
        try {
            const user = await userRepository.updateProfile(userId, input);
            return toUserDto(user);
        } catch (error) {
            if (isUniqueViolation(error)) throw conflict("EMAIL_TAKEN", "כתובת המייל כבר משויכת לחשבון אחר.");
            throw error;
        }
    },

    /**
     * Verifies the current password, stores the new one and revokes every other session.
     * A wrong current password is a 400 (not 401): the client treats 401 as "session expired".
     */
    async changePassword(userId: number, input: ChangePasswordInput): Promise<number> {
        const stored = await userRepository.findPasswordHash(userId);
        if (!stored) throw unauthorized();

        if (!(await verifyPassword(stored.passwordHash, input.currentPassword))) {
            throw new HttpError(400, "INVALID_CURRENT_PASSWORD", "הסיסמה הנוכחית שגויה.", [
                { field: "currentPassword", message: "הסיסמה הנוכחית שגויה." },
            ]);
        }

        return userRepository.updatePassword(userId, await hashPassword(input.newPassword));
    },
};

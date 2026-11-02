import type { Request, Response } from "express";

import { clearSessionCookie, currentUser, setSessionCookie } from "../middleware/auth.js";
import { parseInput } from "../middleware/validate.js";
import { changePasswordSchema, loginSchema, registerSchema, updateProfileSchema } from "../schemas/auth.schema.js";
import { authService } from "../services/auth.service.js";

export const authController = {
    async register(req: Request, res: Response) {
        const input = parseInput(registerSchema, req.body);
        const { user, sessionVersion } = await authService.register(input);
        setSessionCookie(res, user.id, sessionVersion);
        res.status(201).json({ user });
    },

    async login(req: Request, res: Response) {
        const input = parseInput(loginSchema, req.body);
        const { user, sessionVersion } = await authService.login(input);
        setSessionCookie(res, user.id, sessionVersion);
        res.json({ user });
    },

    /** Idempotent: always clears the cookie, even if the session was already invalid. */
    logout(_req: Request, res: Response) {
        clearSessionCookie(res);
        res.status(204).end();
    },

    async me(req: Request, res: Response) {
        const user = await authService.getCurrentUser(currentUser(req).id);
        res.json({ user });
    },

    async updateMe(req: Request, res: Response) {
        const input = parseInput(updateProfileSchema, req.body);
        const user = await authService.updateProfile(currentUser(req).id, input);
        res.json({ user });
    },

    /** Other devices are signed out; this browser gets a fresh cookie and stays signed in. */
    async changePassword(req: Request, res: Response) {
        const input = parseInput(changePasswordSchema, req.body);
        const userId = currentUser(req).id;
        const sessionVersion = await authService.changePassword(userId, input);
        setSessionCookie(res, userId, sessionVersion);
        res.status(204).end();
    },
};

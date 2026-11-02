import { Router } from "express";

import { authController } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/rateLimit.js";

export const authRouter = Router();

authRouter.post("/register", authRateLimiter, authController.register);
authRouter.post("/login", authRateLimiter, authController.login);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", requireAuth, authController.me);
authRouter.patch("/me", requireAuth, authController.updateMe);
// Rate-limited like login: failed attempts at guessing the current password count.
authRouter.post("/me/password", requireAuth, authRateLimiter, authController.changePassword);

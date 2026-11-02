import { Router } from "express";

import { postController } from "../controllers/post.controller.js";
import { requireAuth } from "../middleware/auth.js";

export const postsRouter = Router();

// Membership in the post's class is verified inside the reaction service.
postsRouter.post("/:postId/reactions", requireAuth, postController.toggleReaction);

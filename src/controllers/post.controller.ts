import type { Request, Response } from "express";

import { currentUser } from "../middleware/auth.js";
import { currentMembership } from "../middleware/classAccess.js";
import { uploadedImage } from "../middleware/upload.js";
import { parseInput } from "../middleware/validate.js";
import {
    createPostBodySchema,
    postParamsSchema,
    postsQuerySchema,
    reactionParamsSchema,
    recentPostsQuerySchema,
    toggleReactionSchema,
    updatePostBodySchema,
} from "../schemas/post.schema.js";
import { postService } from "../services/post.service.js";
import { reactionService } from "../services/reaction.service.js";

export const postController = {
    async list(req: Request, res: Response) {
        const query = parseInput(postsQuerySchema, req.query);
        res.json(await postService.list(currentMembership(req).classId, currentUser(req).id, query));
    },

    async recent(req: Request, res: Response) {
        const { limit } = parseInput(recentPostsQuerySchema, req.query);
        res.json(await postService.recent(currentMembership(req).classId, limit));
    },

    async featured(req: Request, res: Response) {
        res.json(await postService.featured(currentMembership(req).classId, currentUser(req).id));
    },

    async get(req: Request, res: Response) {
        const { classId, postId } = parseInput(postParamsSchema, req.params);
        res.json(await postService.get(classId, postId, currentUser(req).id));
    },

    async create(req: Request, res: Response) {
        const body = parseInput(createPostBodySchema, req.body);
        const post = await postService.create(
            currentMembership(req).classId,
            currentUser(req).id,
            body,
            uploadedImage(req)
        );
        res.status(201).json(post);
    },

    async update(req: Request, res: Response) {
        const { classId, postId } = parseInput(postParamsSchema, req.params);
        const body = parseInput(updatePostBodySchema, req.body);
        const user = { id: currentUser(req).id, role: currentMembership(req).role };
        res.json(await postService.update(classId, postId, user, body, uploadedImage(req)));
    },

    async remove(req: Request, res: Response) {
        const { classId, postId } = parseInput(postParamsSchema, req.params);
        const user = { id: currentUser(req).id, role: currentMembership(req).role };
        await postService.delete(classId, postId, user);
        res.status(204).end();
    },

    async toggleReaction(req: Request, res: Response) {
        const { postId } = parseInput(reactionParamsSchema, req.params);
        const { reaction } = parseInput(toggleReactionSchema, req.body);
        res.json(await reactionService.toggle(postId, currentUser(req).id, reaction));
    },
};

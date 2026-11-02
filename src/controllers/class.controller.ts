import type { Request, Response } from "express";

import { currentUser } from "../middleware/auth.js";
import { currentMembership } from "../middleware/classAccess.js";
import { parseInput } from "../middleware/validate.js";
import { createClassSchema, joinClassSchema, updateClassSchema } from "../schemas/class.schema.js";
import { classService } from "../services/class.service.js";

export const classController = {
    async listMine(req: Request, res: Response) {
        res.json(await classService.listMine(currentUser(req).id));
    },

    async create(req: Request, res: Response) {
        const { name } = parseInput(createClassSchema, req.body);
        res.status(201).json(await classService.create(currentUser(req).id, name));
    },

    async join(req: Request, res: Response) {
        const { inviteCode } = parseInput(joinClassSchema, req.body);
        res.status(201).json(await classService.join(currentUser(req).id, inviteCode));
    },

    async details(req: Request, res: Response) {
        const { classId, role } = currentMembership(req);
        res.json(await classService.getDetails(classId, role));
    },

    async rename(req: Request, res: Response) {
        const { classId, role } = currentMembership(req);
        const { name } = parseInput(updateClassSchema, req.body);
        res.json(await classService.rename(classId, name, role));
    },

    async remove(req: Request, res: Response) {
        await classService.delete(currentMembership(req).classId);
        res.status(204).end();
    },

    async inviteCode(req: Request, res: Response) {
        res.json(await classService.getInviteCode(currentMembership(req).classId));
    },

    async regenerateInviteCode(req: Request, res: Response) {
        res.json(await classService.regenerateInviteCode(currentMembership(req).classId));
    },
};

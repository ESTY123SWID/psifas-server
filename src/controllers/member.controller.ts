import type { Request, Response } from "express";

import { currentUser } from "../middleware/auth.js";
import { currentMembership } from "../middleware/classAccess.js";
import { parseInput } from "../middleware/validate.js";
import { memberParamsSchema, membersQuerySchema, updateMemberRoleSchema } from "../schemas/class.schema.js";
import { memberService } from "../services/member.service.js";

export const memberController = {
    async list(req: Request, res: Response) {
        const query = parseInput(membersQuerySchema, req.query);
        res.json(await memberService.list(currentMembership(req).classId, query));
    },

    async updateRole(req: Request, res: Response) {
        const { classId, memberId } = parseInput(memberParamsSchema, req.params);
        const { role } = parseInput(updateMemberRoleSchema, req.body);
        res.json(await memberService.updateRole(classId, currentUser(req).id, memberId, role));
    },

    async remove(req: Request, res: Response) {
        const { classId, memberId } = parseInput(memberParamsSchema, req.params);
        await memberService.remove(classId, currentUser(req).id, memberId);
        res.status(204).end();
    },

    async leave(req: Request, res: Response) {
        await memberService.leave(currentMembership(req).classId, currentUser(req).id);
        res.status(204).end();
    },
};

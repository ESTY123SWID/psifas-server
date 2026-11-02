import type { Request, Response } from "express";

import { currentUser } from "../middleware/auth.js";
import { parseInput } from "../middleware/validate.js";
import {
    adminClassMembersQuerySchema,
    adminMemberParamsSchema,
    adminClassesQuerySchema,
    adminUsersQuerySchema,
    updateGlobalRoleSchema,
    userIdParamsSchema,
} from "../schemas/admin.schema.js";
import { classIdParamsSchema } from "../schemas/common.schema.js";
import { updateClassSchema, updateMemberRoleSchema } from "../schemas/class.schema.js";
import { adminService } from "../services/admin.service.js";

export const adminController = {
    async dashboard(_req: Request, res: Response) {
        res.json(await adminService.dashboard());
    },

    async listUsers(req: Request, res: Response) {
        const query = parseInput(adminUsersQuerySchema, req.query);
        res.json(await adminService.listUsers(query, currentUser(req).id));
    },

    async getUser(req: Request, res: Response) {
        const { userId } = parseInput(userIdParamsSchema, req.params);
        res.json(await adminService.getUser(userId, currentUser(req).id));
    },

    async updateUserRole(req: Request, res: Response) {
        const { userId } = parseInput(userIdParamsSchema, req.params);
        const { role } = parseInput(updateGlobalRoleSchema, req.body);
        res.json(await adminService.updateUserRole(userId, role, currentUser(req).id));
    },

    async deleteUser(req: Request, res: Response) {
        const { userId } = parseInput(userIdParamsSchema, req.params);
        await adminService.deleteUser(userId, currentUser(req).id);
        res.status(204).end();
    },

    async listClasses(req: Request, res: Response) {
        const query = parseInput(adminClassesQuerySchema, req.query);
        res.json(await adminService.listClasses(query));
    },

    async getClass(req: Request, res: Response) {
        const { classId } = parseInput(classIdParamsSchema, req.params);
        res.json(await adminService.getClass(classId));
    },

    async listClassMembers(req: Request, res: Response) {
        const { classId } = parseInput(classIdParamsSchema, req.params);
        const query = parseInput(adminClassMembersQuerySchema, req.query);
        res.json(await adminService.listClassMembers(classId, query));
    },

    async renameClass(req: Request, res: Response) {
        const { classId } = parseInput(classIdParamsSchema, req.params);
        const { name } = parseInput(updateClassSchema, req.body);
        res.json(await adminService.renameClass(classId, name));
    },

    async updateClassMemberRole(req: Request, res: Response) {
        const { classId, userId } = parseInput(adminMemberParamsSchema, req.params);
        const { role } = parseInput(updateMemberRoleSchema, req.body);
        res.json(await adminService.updateClassMemberRole(classId, userId, role));
    },

    async removeClassMember(req: Request, res: Response) {
        const { classId, userId } = parseInput(adminMemberParamsSchema, req.params);
        await adminService.removeClassMember(classId, userId);
        res.status(204).end();
    },

    async deleteClass(req: Request, res: Response) {
        const { classId } = parseInput(classIdParamsSchema, req.params);
        await adminService.deleteClass(classId);
        res.status(204).end();
    },
};

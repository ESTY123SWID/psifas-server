import { Router } from "express";

import { adminController } from "../controllers/admin.controller.js";
import { requireAuth, requireSystemAdmin } from "../middleware/auth.js";

export const adminRouter = Router();

// 401 without a session, 403 for a logged-in user who is not a SystemAdmin.
adminRouter.use(requireAuth, requireSystemAdmin);

adminRouter.get("/dashboard", adminController.dashboard);

adminRouter.get("/users", adminController.listUsers);
adminRouter.get("/users/:userId", adminController.getUser);
adminRouter.patch("/users/:userId", adminController.updateUserRole);
adminRouter.delete("/users/:userId", adminController.deleteUser);

adminRouter.get("/classes", adminController.listClasses);
adminRouter.get("/classes/:classId", adminController.getClass);
adminRouter.get("/classes/:classId/members", adminController.listClassMembers);
adminRouter.patch("/classes/:classId", adminController.renameClass);
adminRouter.patch("/classes/:classId/members/:userId", adminController.updateClassMemberRole);
adminRouter.delete("/classes/:classId/members/:userId", adminController.removeClassMember);
adminRouter.delete("/classes/:classId", adminController.deleteClass);

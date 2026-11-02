import { Router } from "express";

import { classController } from "../controllers/class.controller.js";
import { memberController } from "../controllers/member.controller.js";
import { postController } from "../controllers/post.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { requireClassManager, requireClassMember } from "../middleware/classAccess.js";
import { imageUpload } from "../middleware/upload.js";

export const classesRouter = Router();

classesRouter.use(requireAuth);

// Not class-scoped
classesRouter.get("/my", classController.listMine);
classesRouter.post("/", classController.create);
classesRouter.post("/join", classController.join);

// Everything below requires membership in :classId (checked against the DB on every request).
const member = requireClassMember;
const manager = [requireClassMember, requireClassManager];

classesRouter.get("/:classId", member, classController.details);
classesRouter.patch("/:classId", manager, classController.rename);
classesRouter.delete("/:classId", manager, classController.remove);

classesRouter.get("/:classId/invite-code", manager, classController.inviteCode);
classesRouter.post("/:classId/invite-code/regenerate", manager, classController.regenerateInviteCode);

classesRouter.get("/:classId/members", member, memberController.list);
classesRouter.delete("/:classId/members/me", member, memberController.leave);
classesRouter.patch("/:classId/members/:memberId", manager, memberController.updateRole);
classesRouter.delete("/:classId/members/:memberId", manager, memberController.remove);

classesRouter.get("/:classId/featured", member, postController.featured);

classesRouter.get("/:classId/posts", member, postController.list);
classesRouter.get("/:classId/posts/recent", member, postController.recent);
classesRouter.get("/:classId/posts/:postId", member, postController.get);
classesRouter.post("/:classId/posts", member, imageUpload, postController.create);
classesRouter.patch("/:classId/posts/:postId", member, imageUpload, postController.update);
classesRouter.delete("/:classId/posts/:postId", member, postController.remove);

import { Router } from "express";

import { mediaController } from "../controllers/media.controller.js";
import { prisma } from "../lib/prisma.js";
import { adminRouter } from "./admin.routes.js";
import { authRouter } from "./auth.routes.js";
import { classesRouter } from "./classes.routes.js";
import { postsRouter } from "./posts.routes.js";

export const apiRouter = Router();

apiRouter.get("/health", async (_req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.json({ status: "ok", database: "ok" });
    } catch {
        res.status(503).json({ status: "degraded", database: "unavailable" });
    }
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/classes", classesRouter);
apiRouter.use("/posts", postsRouter);
apiRouter.use("/admin", adminRouter);
apiRouter.get("/media/*key", mediaController.serve);

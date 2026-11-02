import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { CSRF_HEADER, csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp() {
    const app = express();

    app.disable("x-powered-by");
    app.set("trust proxy", env.trustProxy);

    app.use(helmet());
    app.use(
        cors({
            // Only the configured client origins may send credentialed requests.
            origin: (origin, callback) => callback(null, origin ? env.clientOrigins.includes(origin) : false),
            credentials: true,
            methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allowedHeaders: ["Content-Type", CSRF_HEADER],
            maxAge: 600,
        })
    );
    app.use(express.json({ limit: "100kb" }));
    app.use(cookieParser());
    app.use(csrfProtection);

    app.get("/health", (_req, res) => {
        res.json({ status: "ok" });
    });
    app.use("/api", apiRouter);

    app.use(notFoundHandler);
    app.use(errorHandler);

    return app;
}

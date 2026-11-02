import type { Request, Response } from "express";

import { CONTENT_TYPES_BY_EXTENSION, STORAGE_KEY_PATTERN } from "../storage/localDiskStorage.js";
import { getLocalDiskStorage } from "../storage/index.js";
import { forbidden, notFound } from "../utils/httpError.js";
import { verifyMediaSignature } from "../utils/mediaSignature.js";

export const mediaController = {
    /**
     * Serves images stored by the DEVELOPMENT local-disk driver. Access is granted only through
     * signed, expiring URLs that the API hands out to class members together with the post.
     */
    async serve(req: Request, res: Response) {
        const localStorage = getLocalDiskStorage();
        const key = (req.params.key as string[] | undefined)?.join("/") ?? "";
        if (!localStorage || !STORAGE_KEY_PATTERN.test(key)) throw notFound("התמונה לא נמצאה.");

        if (!verifyMediaSignature(key, req.query.exp, req.query.sig)) {
            throw forbidden("קישור התמונה אינו תקף או שפג תוקפו.", "INVALID_MEDIA_SIGNATURE");
        }

        const extension = key.slice(key.lastIndexOf(".") + 1);
        res.set({
            "Content-Type": CONTENT_TYPES_BY_EXTENSION[extension] ?? "application/octet-stream",
            "Cache-Control": "private, max-age=3600",
            // The <img> lives on the client's origin, which differs from the API's.
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        });

        await new Promise<void>((resolve, reject) => {
            // resolvePath() validates the key and keeps it inside the uploads folder. The file is then
            // sent relative to that root, so `dotfiles` only applies to the key itself — not to the
            // folders above it (an uploads dir such as /srv/.data/uploads would otherwise be refused).
            localStorage.resolvePath(key);
            res.sendFile(key, { root: localStorage.rootDir, dotfiles: "deny" }, (error) => {
                if (!error) return resolve();
                if ((error as NodeJS.ErrnoException).code === "ENOENT") return reject(notFound("התמונה לא נמצאה."));
                reject(error);
            });
        });
    },
};

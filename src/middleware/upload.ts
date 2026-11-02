import type { NextFunction, Request, Response } from "express";
import multer from "multer";

import type { ImageMimeType } from "../storage/storage.types.js";
import { HttpError, badRequest } from "../utils/httpError.js";
import { ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, detectImageType } from "../utils/imageValidation.js";

const multerUpload = multer({
    // Kept in memory (max 5MB) and handed to the storage service — never written with the
    // client-supplied file name.
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_BYTES,
        files: 1,
        fields: 10,
        fieldSize: 16 * 1024,
        parts: 12,
    },
    fileFilter: (_req, file, callback) => {
        if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.mimetype)) {
            callback(badRequest("INVALID_FILE_TYPE", "יש לבחור תמונה מסוג JPG, PNG או WebP."));
            return;
        }
        callback(null, true);
    },
}).single("image");

export interface UploadedImage {
    buffer: Buffer;
    contentType: ImageMimeType;
}

/** Parses an optional `image` field from multipart/form-data and verifies its real content type. */
export function imageUpload(req: Request, res: Response, next: NextFunction): void {
    multerUpload(req, res, (error: unknown) => {
        if (error instanceof multer.MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                next(new HttpError(413, "FILE_TOO_LARGE", "גודל התמונה לא יכול לעלות על 5MB."));
                return;
            }
            next(badRequest("INVALID_UPLOAD", "קובץ ההעלאה אינו תקין."));
            return;
        }
        if (error) {
            next(error);
            return;
        }
        if (req.file) {
            const detected = detectImageType(req.file.buffer);
            if (!detected) {
                next(badRequest("INVALID_FILE_TYPE", "תוכן הקובץ אינו תמונת JPG, PNG או WebP תקינה."));
                return;
            }
            // From here on, only the type detected from the bytes is used.
            req.file.mimetype = detected;
        }
        next();
    });
}

export function uploadedImage(req: Request): UploadedImage | null {
    if (!req.file) return null;
    return { buffer: req.file.buffer, contentType: req.file.mimetype as ImageMimeType };
}

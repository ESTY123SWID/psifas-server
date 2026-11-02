import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { createMediaSignature } from "../utils/mediaSignature.js";
import type { ImageMimeType, SaveImageInput, StorageService } from "./storage.types.js";

const EXTENSIONS: Record<ImageMimeType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

export const CONTENT_TYPES_BY_EXTENSION: Record<string, ImageMimeType> = {
    jpg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
};

/** Only keys this driver itself generates are ever accepted. */
export const STORAGE_KEY_PATTERN =
    /^classes\/\d{1,10}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/**
 * DEVELOPMENT-ONLY storage: writes images to a folder on the local disk.
 * Hosts such as Render wipe the disk on every deploy/restart, so do not use this in production.
 */
export class LocalDiskStorage implements StorageService {
    constructor(
        readonly rootDir: string,
        private readonly publicApiUrl: string
    ) {}

    async save({ buffer, contentType, prefix }: SaveImageInput): Promise<string> {
        const key = `${prefix}/${randomUUID()}.${EXTENSIONS[contentType]}`;
        const filePath = this.resolvePath(key);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, buffer, { flag: "wx" });
        return key;
    }

    async delete(key: string): Promise<void> {
        try {
            await fs.unlink(this.resolvePath(key));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }

    getReadUrl(key: string): string {
        const { exp, sig } = createMediaSignature(key);
        return `${this.publicApiUrl}/media/${key}?exp=${exp}&sig=${encodeURIComponent(sig)}`;
    }

    /** Absolute path of a key, guaranteed to stay inside rootDir. */
    resolvePath(key: string): string {
        if (!STORAGE_KEY_PATTERN.test(key)) {
            throw new Error("Invalid storage key");
        }
        const resolved = path.resolve(this.rootDir, key);
        if (!resolved.startsWith(this.rootDir + path.sep)) {
            throw new Error("Storage key escapes the uploads directory");
        }
        return resolved;
    }
}

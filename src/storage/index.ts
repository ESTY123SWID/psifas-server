import { env } from "../config/env.js";
import { CloudinaryStorage } from "./cloudinaryStorage.js";
import { LocalDiskStorage } from "./localDiskStorage.js";
import type { StorageService } from "./storage.types.js";

function createStorage(): StorageService {
    switch (env.storage.driver) {
        case "cloudinary":
            // env.ts guarantees CLOUDINARY_URL is present and well-formed for this driver.
            return new CloudinaryStorage(env.storage.cloudinaryUrl!);
        case "local":
            if (env.isProduction) {
                console.warn(
                    "[storage] WARNING: STORAGE_DRIVER=local in production. Uploaded images will be lost " +
                    "whenever the host's disk is reset. Configure an external object store before going live."
                );
            }
            return new LocalDiskStorage(env.storage.uploadsDir, env.apiPublicUrl);
    }
}

export const storage = createStorage();

/** Best-effort removal of stored images after their database rows are already gone. */
export async function deleteStoredImages(keys: string[]): Promise<void> {
    const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
    for (const result of results) {
        if (result.status === "rejected") {
            console.error("[storage] Failed to delete image:", result.reason);
        }
    }
}

export function getLocalDiskStorage(): LocalDiskStorage | null {
    return storage instanceof LocalDiskStorage ? storage : null;
}

export type { StorageService, ImageMimeType } from "./storage.types.js";

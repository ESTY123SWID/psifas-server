import { env } from "../config/env.js";
import { pendingImageDeletionRepository } from "../repositories/pendingImageDeletion.repository.js";
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

/** Immediate attempts per file, and the pause before each retry (temporary network / storage errors). */
const DELETE_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [300, 1000];
/** How many pending deletions one background run handles. */
const PENDING_BATCH_SIZE = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function deleteWithRetry(key: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await storage.delete(key);
            return;
        } catch (error) {
            if (attempt >= DELETE_ATTEMPTS) throw error;
            await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000);
        }
    }
}

/**
 * Deletes files whose keys are already recorded as pending. A key's record is removed only after
 * the storage confirms the deletion; failures stay recorded for the next background run.
 * Never throws: callers run this after their database change has been committed.
 */
async function deleteRecordedImages(keys: string[]): Promise<{ deleted: number; failed: number }> {
    const results = await Promise.allSettled(keys.map((key) => deleteWithRetry(key)));
    const deleted = keys.filter((_, index) => results[index]!.status === "fulfilled");

    const bookkeeping: Promise<unknown>[] = [];
    if (deleted.length > 0) bookkeeping.push(pendingImageDeletionRepository.remove(deleted));
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            const key = keys[index]!;
            console.error(`[storage] Failed to delete image ${key} — will retry later:`, errorMessage(result.reason));
            bookkeeping.push(pendingImageDeletionRepository.recordFailure(key, errorMessage(result.reason)));
        }
    });
    for (const outcome of await Promise.allSettled(bookkeeping)) {
        if (outcome.status === "rejected") {
            console.error("[storage] Could not update pending image deletions:", errorMessage(outcome.reason));
        }
    }
    return { deleted: deleted.length, failed: keys.length - deleted.length };
}

/**
 * Removes stored images after their database rows are gone. The keys are recorded first, so a file
 * that cannot be deleted right now (network / storage outage, server restart) is retried later by
 * retryPendingImageDeletions() instead of being left in the storage forever.
 */
export async function deleteStoredImages(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
        await pendingImageDeletionRepository.add(keys);
    } catch (error) {
        // Still try to delete the files now; only the later retry is lost.
        console.error("[storage] Could not record pending image deletions:", errorMessage(error));
    }
    await deleteRecordedImages(keys);
}

/** Retries the oldest pending image deletions. Run at startup and periodically by the server. */
export async function retryPendingImageDeletions(): Promise<{ deleted: number; failed: number }> {
    const pending = await pendingImageDeletionRepository.listOldest(PENDING_BATCH_SIZE);
    if (pending.length === 0) return { deleted: 0, failed: 0 };
    return deleteRecordedImages(pending.map((row) => row.key));
}

export function getLocalDiskStorage(): LocalDiskStorage | null {
    return storage instanceof LocalDiskStorage ? storage : null;
}

export type { StorageService, ImageMimeType } from "./storage.types.js";

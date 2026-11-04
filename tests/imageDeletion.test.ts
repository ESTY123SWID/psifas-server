import { afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { retryPendingImageDeletions, storage } from "../src/storage/index.js";
import {
    PNG_BYTES,
    createClass,
    createImagePost,
    fileExists,
    registerUser,
    storedImageKeys,
} from "./helpers.js";

const networkError = () => new Error("Cloudinary delete failed: read ECONNRESET");

afterEach(() => {
    vi.restoreAllMocks();
});

describe("stored image deletion survives storage failures", () => {
    it("retries a temporary failure right away, so deleting a class leaves no file behind", async () => {
        const { client: manager } = await registerUser();
        const classItem = await createClass(manager);
        await createImagePost(manager, classItem.id);
        const [imageKey] = await storedImageKeys();

        const realDelete = storage.delete.bind(storage);
        const deleteSpy = vi.spyOn(storage, "delete").mockRejectedValueOnce(networkError()).mockImplementation(realDelete);

        expect((await manager.delete(`/classes/${classItem.id}`)).status).toBe(204);

        expect(deleteSpy).toHaveBeenCalledTimes(2);
        expect(await fileExists(imageKey!)).toBe(false);
        expect(await prisma.pendingImageDeletion.count()).toBe(0);
    });

    it("keeps a lasting failure as pending and deletes the file on the next retry run", async () => {
        const { client: manager } = await registerUser();
        const classItem = await createClass(manager);
        await createImagePost(manager, classItem.id);
        await createImagePost(manager, classItem.id, "עוד תמונה");
        const keys = await storedImageKeys();

        vi.spyOn(storage, "delete").mockRejectedValue(networkError());
        vi.spyOn(console, "error").mockImplementation(() => {}); // expected failures — keep the output clean

        // The class is still deleted for the user; only the file removal is postponed.
        expect((await manager.delete(`/classes/${classItem.id}`)).status).toBe(204);
        expect(await prisma.class.count()).toBe(0);
        for (const key of keys) expect(await fileExists(key)).toBe(true);

        const pending = await prisma.pendingImageDeletion.findMany({ orderBy: { key: "asc" } });
        expect(pending.map((row) => row.key)).toEqual([...keys].sort());
        for (const row of pending) {
            expect(row.attempts).toBe(1);
            expect(row.lastError).toContain("ECONNRESET");
        }

        // A run while the storage is still down changes nothing but the attempt count.
        expect(await retryPendingImageDeletions()).toEqual({ deleted: 0, failed: 2 });
        expect((await prisma.pendingImageDeletion.findMany()).every((row) => row.attempts === 2)).toBe(true);

        // Storage is back: the next run removes the files and clears the queue.
        vi.mocked(storage.delete).mockRestore();
        expect(await retryPendingImageDeletions()).toEqual({ deleted: 2, failed: 0 });
        for (const key of keys) expect(await fileExists(key)).toBe(false);
        expect(await prisma.pendingImageDeletion.count()).toBe(0);
        expect(await retryPendingImageDeletions()).toEqual({ deleted: 0, failed: 0 });
    });

    it("also protects deleting a post and replacing its image", async () => {
        const { client: manager } = await registerUser();
        const classItem = await createClass(manager);
        const toDelete = await createImagePost(manager, classItem.id, "למחיקה");
        const toEdit = await createImagePost(manager, classItem.id, "לעריכה");
        const keys = await storedImageKeys();

        vi.spyOn(storage, "delete").mockRejectedValue(networkError());
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect((await manager.delete(`/classes/${classItem.id}/posts/${toDelete.id}`)).status).toBe(204);
        const replaced = await manager
            .patch(`/classes/${classItem.id}/posts/${toEdit.id}`)
            .field("type", "image")
            .field("title", "לעריכה")
            .attach("image", PNG_BYTES, { filename: "new.png", contentType: "image/png" });
        expect(replaced.status).toBe(200);

        // Both old files are queued (the new image is in use and is not).
        const pending = (await prisma.pendingImageDeletion.findMany()).map((row) => row.key).sort();
        expect(pending).toEqual([...keys].sort());
        const [currentKey] = await storedImageKeys();
        expect(pending).not.toContain(currentKey);

        vi.mocked(storage.delete).mockRestore();
        expect(await retryPendingImageDeletions()).toEqual({ deleted: 2, failed: 0 });
        for (const key of keys) expect(await fileExists(key)).toBe(false);
        expect(await fileExists(currentKey!)).toBe(true);
    });
});

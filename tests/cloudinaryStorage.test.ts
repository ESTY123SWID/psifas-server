import { describe, expect, it } from "vitest";

import { CloudinaryStorage, parseCloudinaryUrl } from "../src/storage/cloudinaryStorage.js";

// Fake, offline credentials — no request is sent by anything tested here.
const FAKE_URL = "cloudinary://123456789012345:fake-secret-for-tests@demo-cloud";
const KEY = "psifas/classes/12/0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg";

describe("Cloudinary storage driver (offline)", () => {
    it("parses the CLOUDINARY_URL format and rejects anything else", () => {
        expect(parseCloudinaryUrl(FAKE_URL)).toEqual({
            apiKey: "123456789012345",
            apiSecret: "fake-secret-for-tests",
            cloudName: "demo-cloud",
        });
        expect(parseCloudinaryUrl("https://demo-cloud.example.com")).toBeNull();
        expect(parseCloudinaryUrl("cloudinary://missing-secret@demo")).toBeNull();
        expect(() => new CloudinaryStorage("not-a-url")).toThrow();
    });

    it("builds signed, private (authenticated) delivery URLs for its own keys", () => {
        const storage = new CloudinaryStorage(FAKE_URL);
        const url = storage.getReadUrl(KEY);

        expect(url).toMatch(/^https:\/\/res\.cloudinary\.com\/demo-cloud\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\//);
        expect(url).toContain("psifas/classes/12/0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg");
        // Same key → same URL, so the browser can cache the image.
        expect(storage.getReadUrl(KEY)).toBe(url);
    });

    it("refuses keys it did not create (cannot be used to reach other assets)", async () => {
        const storage = new CloudinaryStorage(FAKE_URL);
        for (const key of ["../etc/passwd", "other-app/photo.jpg", "psifas/classes/x/y.jpg", "psifas/classes/1/not-a-uuid.png"]) {
            expect(() => storage.getReadUrl(key)).toThrow("Invalid storage key");
            await expect(storage.delete(key)).rejects.toThrow("Invalid storage key");
        }
    });
});

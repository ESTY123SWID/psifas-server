export type ImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface SaveImageInput {
    buffer: Buffer;
    contentType: ImageMimeType;
    /** Logical folder, e.g. `classes/12`. Never derived from user input. */
    prefix: string;
}

/**
 * Persistent image storage used by the business logic.
 *
 * Implementations:
 *  - LocalDiskStorage — DEVELOPMENT ONLY (files on the server's disk, served by /api/media).
 *  - An external object store (S3 / Cloudflare R2 / Supabase Storage, etc.) must be added for
 *    production hosts with ephemeral disks such as Render. Implement this interface and register
 *    it in storage/index.ts; nothing else in the code base needs to change.
 */
export interface StorageService {
    /** Stores the image and returns its opaque storage key. */
    save(input: SaveImageInput): Promise<string>;
    /** Deletes an object. Must not throw when the object is already gone. */
    delete(key: string): Promise<void>;
    /** Returns a URL the browser can load in an <img> tag. May be short-lived / signed. */
    getReadUrl(key: string): string;
}

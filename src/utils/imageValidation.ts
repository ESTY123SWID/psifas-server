import type { ImageMimeType } from "../storage/storage.types.js";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES: readonly ImageMimeType[] = ["image/jpeg", "image/png", "image/webp"];

/**
 * Detects the real image type from the file's magic bytes. The browser-supplied MIME type and
 * file name are never trusted on their own.
 */
export function detectImageType(buffer: Buffer): ImageMimeType | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return "image/jpeg";
    }
    if (
        buffer.length >= 8 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
        return "image/png";
    }
    if (
        buffer.length >= 12 &&
        buffer.toString("ascii", 0, 4) === "RIFF" &&
        buffer.toString("ascii", 8, 12) === "WEBP"
    ) {
        return "image/webp";
    }
    return null;
}

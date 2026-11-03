import { randomUUID } from "node:crypto";
import cloudinaryPackage from "cloudinary";

import type { ImageMimeType, SaveImageInput, StorageService } from "./storage.types.js";

const { v2: cloudinary } = cloudinaryPackage;

const EXTENSIONS: Record<ImageMimeType, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
};

/** All Psifas assets live under this folder of the Cloudinary account. */
const ROOT_FOLDER = "psifas";

/** Only keys this driver itself generates are accepted (prevents touching any other asset). */
export const CLOUDINARY_KEY_PATTERN =
    /^psifas\/classes\/\d{1,10}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** Parses `cloudinary://<api_key>:<api_secret>@<cloud_name>` (the "API environment variable"). */
export function parseCloudinaryUrl(url: string) {
    const match = /^cloudinary:\/\/([^:@/\s]+):([^@/\s]+)@([^/\s?]+)\/?$/.exec(url.trim());
    if (!match) return null;
    const [, apiKey, apiSecret, cloudName] = match;
    return { apiKey: apiKey!, apiSecret: apiSecret!, cloudName: cloudName! };
}

function splitKey(key: string) {
    if (!CLOUDINARY_KEY_PATTERN.test(key)) throw new Error("Invalid storage key");
    const dot = key.lastIndexOf(".");
    return { publicId: key.slice(0, dot), format: key.slice(dot + 1) };
}

/**
 * Permanent image storage on Cloudinary (free plan, no card).
 * Images are uploaded as `authenticated` (private) assets: they can only be delivered through a URL
 * signed with the account secret, which the API hands out only to members of the post's class.
 */
export class CloudinaryStorage implements StorageService {
    constructor(cloudinaryUrl: string) {
        const credentials = parseCloudinaryUrl(cloudinaryUrl);
        if (!credentials) throw new Error("CLOUDINARY_URL is not a valid cloudinary:// URL");
        cloudinary.config({
            cloud_name: credentials.cloudName,
            api_key: credentials.apiKey,
            api_secret: credentials.apiSecret,
            secure: true,
        });
    }

    async save({ buffer, contentType, prefix }: SaveImageInput): Promise<string> {
        const format = EXTENSIONS[contentType];
        const key = `${ROOT_FOLDER}/${prefix}/${randomUUID()}.${format}`;
        const { publicId } = splitKey(key);

        await new Promise<void>((resolve, reject) => {
            const upload = cloudinary.uploader.upload_stream(
                {
                    public_id: publicId,
                    type: "authenticated",
                    resource_type: "image",
                    overwrite: false,
                    unique_filename: false,
                    use_filename: false,
                },
                (error) => (error ? reject(new Error(`Cloudinary upload failed: ${error.message}`)) : resolve())
            );
            upload.end(buffer);
        });

        return key;
    }

    async delete(key: string): Promise<void> {
        const { publicId } = splitKey(key);
        const result = (await cloudinary.uploader.destroy(publicId, {
            type: "authenticated",
            resource_type: "image",
            invalidate: true,
        })) as { result?: string };
        // "not found" means it is already gone — that is fine for a delete.
        if (result.result !== "ok" && result.result !== "not found") {
            throw new Error(`Cloudinary delete failed: ${result.result ?? "unknown error"}`);
        }
    }

    getReadUrl(key: string): string {
        const { publicId, format } = splitKey(key);
        return cloudinary.url(publicId, {
            type: "authenticated",
            resource_type: "image",
            sign_url: true,
            secure: true,
            format,
        });
    }
}

import fs from "node:fs/promises";
import path from "node:path";
import request from "supertest";
import type { Test } from "supertest";

import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";

export const app = createApp();
export const CLIENT_ORIGIN = "http://localhost:5173";
export const VALID_PASSWORD = "Str0ng!Pass";

let ipCounter = 0;

/**
 * A browser-like API client: keeps its cookies, sends the Origin + X-Requested-With headers the
 * React client sends, and gets its own IP so rate limiting doesn't leak between tests.
 */
export function createClient(options: { ip?: string } = {}) {
    const agent = request.agent(app);
    ipCounter += 1;
    const ip = options.ip ?? `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
    const browser = (test: Test) =>
        test.set("Origin", CLIENT_ORIGIN).set("X-Requested-With", "XMLHttpRequest").set("X-Forwarded-For", ip);

    return {
        agent,
        get: (url: string) => browser(agent.get(`/api${url}`)),
        post: (url: string) => browser(agent.post(`/api${url}`)),
        patch: (url: string) => browser(agent.patch(`/api${url}`)),
        delete: (url: string) => browser(agent.delete(`/api${url}`)),
    };
}

export type Client = ReturnType<typeof createClient>;

let userCounter = 0;

export async function registerUser(overrides: { name?: string; email?: string } = {}) {
    userCounter += 1;
    const client = createClient();
    const response = await client.post("/auth/register").send({
        name: overrides.name ?? `משתמשת ${userCounter}`,
        email: overrides.email ?? `user${userCounter}-${Date.now()}@example.com`,
        password: VALID_PASSWORD,
    });
    if (response.status !== 201) {
        throw new Error(`registerUser failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return { client, user: response.body.user as { id: number; name: string; email: string; role: string } };
}

export async function registerAdmin() {
    const result = await registerUser({ name: "מנהלת מערכת" });
    await prisma.user.update({ where: { id: result.user.id }, data: { role: "SystemAdmin" } });
    return result;
}

/** Creates a class managed by `manager`, and joins every user in `members` as a regular member. */
export async function createClass(manager: Client, name = "כיתה ח׳1", members: Client[] = []) {
    const created = await manager.post("/classes").send({ name });
    if (created.status !== 201) {
        throw new Error(`createClass failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    for (const member of members) {
        const joined = await member.post("/classes/join").send({ inviteCode: created.body.inviteCode });
        if (joined.status !== 201) throw new Error(`join failed: ${joined.status}`);
    }
    return created.body as { id: number; name: string; inviteCode: string };
}

export async function createQuote(client: Client, classId: number, title = "כותרת", content = "משפט מהכיתה") {
    const response = await client
        .post(`/classes/${classId}/posts`)
        .field("type", "quote")
        .field("title", title)
        .field("content", content);
    if (response.status !== 201) {
        throw new Error(`createQuote failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body as { id: number; imageUrl: string | null };
}

// A real 1×1 PNG.
export const PNG_BYTES = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64"
);
export const JPEG_BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

export async function createImagePost(client: Client, classId: number, title = "תמונה מהטיול") {
    const response = await client
        .post(`/classes/${classId}/posts`)
        .field("type", "image")
        .field("title", title)
        .attach("image", PNG_BYTES, { filename: "photo.png", contentType: "image/png" });
    if (response.status !== 201) {
        throw new Error(`createImagePost failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body as { id: number; imageUrl: string };
}

export async function storedImageKeys(): Promise<string[]> {
    const posts = await prisma.post.findMany({ where: { imageKey: { not: null } }, select: { imageKey: true } });
    return posts.map((post) => post.imageKey!);
}

export async function fileExists(key: string): Promise<boolean> {
    try {
        await fs.access(path.join(env.storage.uploadsDir, key));
        return true;
    } catch {
        return false;
    }
}

/** Turns an absolute signed image URL into a path the test app can request. */
export function mediaPath(imageUrl: string): string {
    return imageUrl.replace(env.apiPublicUrl, "");
}

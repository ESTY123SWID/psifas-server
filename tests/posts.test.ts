import request from "supertest";
import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import {
    JPEG_BYTES,
    PNG_BYTES,
    app,
    createClass,
    createImagePost,
    createQuote,
    fileExists,
    mediaPath,
    registerUser,
    storedImageKeys,
} from "./helpers.js";

const ALL_REACTIONS_ZERO = { like: 0, love: 0, laugh: 0, adore: 0, touched: 0, wow: 0, applause: 0, fire: 0 };

async function setupClass() {
    const manager = await registerUser({ name: "מנהלת" });
    const author = await registerUser({ name: "כותבת" });
    const other = await registerUser({ name: "חברה" });
    const classItem = await createClass(manager.client, "כיתה", [author.client, other.client]);
    return { manager, author, other, classId: classItem.id };
}

describe("creating posts", () => {
    it("creates a quote post and returns it in the client's Post shape", async () => {
        const { author, classId } = await setupClass();
        const response = await author.client
            .post(`/classes/${classId}/posts`)
            .field("type", "quote")
            .field("title", "  משפט היום  ")
            .field("content", "  ביחד זה הכי טוב  ");

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            id: expect.any(Number),
            authorId: author.user.id,
            authorName: "כותבת",
            type: "quote",
            title: "משפט היום",
            content: "ביחד זה הכי טוב",
            imageUrl: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
            reactions: ALL_REACTIONS_ZERO,
            myReaction: null,
        });
    });

    it("creates an image post, stores the file under a generated name and serves it via a signed URL", async () => {
        const { author, other, classId } = await setupClass();
        const post = await createImagePost(author.client, classId);

        expect(post.imageUrl).toMatch(/^http:\/\/localhost:4000\/api\/media\/classes\/\d+\/[0-9a-f-]{36}\.png\?exp=\d+&sig=/);
        const [key] = await storedImageKeys();
        expect(key).not.toContain("photo");
        expect(await fileExists(key!)).toBe(true);

        // The browser loads the image without cookies — the signature is the access grant.
        const image = await request(app).get(`/api${mediaPath(post.imageUrl)}`);
        expect(image.status).toBe(200);
        expect(image.headers["content-type"]).toBe("image/png");
        expect(image.headers["x-content-type-options"]).toBe("nosniff");
        expect(Buffer.compare(image.body as Buffer, PNG_BYTES)).toBe(0);

        const tampered = mediaPath(post.imageUrl).replace(/sig=[^&]+/, "sig=forged");
        expect((await request(app).get(`/api${tampered}`)).status).toBe(403);
        const unsigned = mediaPath(post.imageUrl).split("?")[0];
        expect((await request(app).get(`/api${unsigned}`)).status).toBe(403);
        expect((await request(app).get("/api/media/../../.env")).status).toBe(404);

        // Other members see the same post with an image URL.
        const seen = await other.client.get(`/classes/${classId}/posts/${post.id}`);
        expect(seen.body.imageUrl).toMatch(/\/api\/media\//);
    });

    it.each([
        ["quote without content", (c: ReturnType<typeof base>) => c.field("type", "quote").field("title", "כותרת"), 400],
        ["image post without a file", (c: ReturnType<typeof base>) => c.field("type", "image").field("title", "כותרת"), 400],
        ["missing title", (c: ReturnType<typeof base>) => c.field("type", "quote").field("content", "תוכן"), 400],
        ["title over 150 chars", (c: ReturnType<typeof base>) => c.field("type", "quote").field("title", "א".repeat(151)).field("content", "x"), 400],
        ["content over 2000 chars", (c: ReturnType<typeof base>) => c.field("type", "quote").field("title", "t").field("content", "א".repeat(2001)), 400],
        ["unknown post type", (c: ReturnType<typeof base>) => c.field("type", "video").field("title", "t").field("content", "x"), 400],
    ])("rejects %s", async (_label, build, status) => {
        const { author, classId } = await setupClass();
        const response = await build(base(author.client, classId));
        expect(response.status).toBe(status);
        expect(await prisma.post.count()).toBe(0);
    });

    it("rejects dangerous or disguised files and files over 5MB", async () => {
        const { author, classId } = await setupClass();
        const send = (buffer: Buffer, filename: string, contentType: string) =>
            author.client
                .post(`/classes/${classId}/posts`)
                .field("type", "image")
                .field("title", "t")
                .attach("image", buffer, { filename, contentType });

        const svg = await send(Buffer.from("<svg onload=alert(1)>"), "x.svg", "image/svg+xml");
        expect(svg.status).toBe(400);
        expect(svg.body.code).toBe("INVALID_FILE_TYPE");

        const disguised = await send(Buffer.from("<?php system($_GET['c']); ?>"), "x.png", "image/png");
        expect(disguised.status).toBe(400);
        expect(disguised.body.code).toBe("INVALID_FILE_TYPE");

        const tooBig = await send(Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024)]), "big.png", "image/png");
        expect(tooBig.status).toBe(413);

        expect(await prisma.post.count()).toBe(0);
        expect(await storedImageKeys()).toEqual([]);
    });

    it("blocks non-members from creating posts", async () => {
        const { classId } = await setupClass();
        const outsider = await registerUser();
        expect((await createQuoteRaw(outsider.client, classId)).status).toBe(403);
    });
});

describe("listing, searching, filtering, sorting and paging", () => {
    it("filters by type and author, searches title and content, sorts and paginates", async () => {
        const { manager, author, other, classId } = await setupClass();
        const first = await createQuote(author.client, classId, "טיול שנתי", "היה מדהים");
        const second = await createImagePost(other.client, classId, "תמונה מהטקס");
        const third = await createQuote(author.client, classId, "יום הולדת", "הפתעה לנועה בטיול");

        // `second` gets two reactions, `first` one → popular order: second, first, third
        await manager.client.post(`/posts/${second.id}/reactions`).send({ reaction: "love" });
        await author.client.post(`/posts/${second.id}/reactions`).send({ reaction: "fire" });
        await other.client.post(`/posts/${first.id}/reactions`).send({ reaction: "like" });

        const list = (query: string) => manager.client.get(`/classes/${classId}/posts?${query}`);
        const ids = (response: { body: { items: { id: number }[] } }) => response.body.items.map((p) => p.id);

        const newest = await list("sort=newest&page=1&pageSize=10");
        expect(newest.status).toBe(200);
        expect(ids(newest)).toEqual([third.id, second.id, first.id]);
        expect(newest.body).toMatchObject({ total: 3, page: 1, pageSize: 10, totalPages: 1 });

        expect(ids(await list("sort=oldest"))).toEqual([first.id, second.id, third.id]);
        expect(ids(await list("sort=popular"))).toEqual([second.id, first.id, third.id]);

        expect(ids(await list("type=image"))).toEqual([second.id]);
        expect(ids(await list(`authorId=${author.user.id}`))).toEqual([third.id, first.id]);

        // "טיול" appears in one title and in another post's content.
        expect(ids(await list(`search=${encodeURIComponent("טיול")}`)).sort()).toEqual([first.id, third.id].sort());
        expect((await list(`search=${encodeURIComponent("לא קיים")}`)).body).toMatchObject({ items: [], total: 0, totalPages: 0 });

        const page2 = await list("sort=newest&page=2&pageSize=2");
        expect(ids(page2)).toEqual([first.id]);
        expect(page2.body).toMatchObject({ total: 3, page: 2, pageSize: 2, totalPages: 2 });

        expect((await list("sort=random")).status).toBe(400);
        expect((await list("page=0")).status).toBe(400);
        expect((await list("type=video")).status).toBe(400);
    });

    it("returns recent posts and a single post, and 404 for a post from another class", async () => {
        const { author, classId } = await setupClass();
        const post = await createQuote(author.client, classId, "אחרון");
        const otherClass = await createClass(author.client, "כיתה אחרת");
        const foreign = await createQuote(author.client, otherClass.id);

        const recent = await author.client.get(`/classes/${classId}/posts/recent?limit=10`);
        expect(recent.body).toEqual([{ id: post.id, title: "אחרון", authorName: "כותבת", createdAt: expect.any(String) }]);

        expect((await author.client.get(`/classes/${classId}/posts/${post.id}`)).body.id).toBe(post.id);
        expect((await author.client.get(`/classes/${classId}/posts/${foreign.id}`)).status).toBe(404);
        expect((await author.client.get(`/classes/${classId}/posts/999999`)).status).toBe(404);
    });

    it("returns a featured item (null when empty) that stays the same between requests", async () => {
        const { author, classId } = await setupClass();
        const empty = await author.client.get(`/classes/${classId}/featured`);
        expect(empty.status).toBe(200);
        expect(empty.body).toBeNull();

        await createQuote(author.client, classId, "א", "משפט א");
        await createQuote(author.client, classId, "ב", "משפט ב");
        await createImagePost(author.client, classId);

        const first = await author.client.get(`/classes/${classId}/featured`);
        expect(first.body).toEqual({
            id: expect.any(Number),
            type: expect.stringMatching(/^(quote|image)$/),
            text: first.body.type === "quote" ? expect.any(String) : null,
            imageUrl: first.body.type === "image" ? expect.any(String) : null,
            reactions: ALL_REACTIONS_ZERO,
            myReaction: null,
        });
        await author.client.post(`/posts/${first.body.id}/reactions`).send({ reaction: "wow" });
        const second = await author.client.get(`/classes/${classId}/featured`);
        expect(second.body.id).toBe(first.body.id);
        expect(second.body.myReaction).toBe("wow");
    });
});

describe("editing and deleting posts", () => {
    it("lets the author and the class manager edit, but not other members", async () => {
        const { manager, author, other, classId } = await setupClass();
        const post = await createQuote(author.client, classId);
        const edit = (client: typeof author.client, title: string) =>
            client.patch(`/classes/${classId}/posts/${post.id}`).field("type", "quote").field("title", title).field("content", "תוכן מעודכן");

        const byAuthor = await edit(author.client, "עריכת כותבת");
        expect(byAuthor.status).toBe(200);
        expect(byAuthor.body).toMatchObject({ id: post.id, title: "עריכת כותבת", content: "תוכן מעודכן" });

        expect((await edit(manager.client, "עריכת מנהלת")).status).toBe(200);

        const byOther = await edit(other.client, "פריצה");
        expect(byOther.status).toBe(403);
        expect(byOther.body.code).toBe("NOT_POST_OWNER");

        expect((await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).title).toBe("עריכת מנהלת");
    });

    it("validates edits: no type change, quote keeps content", async () => {
        const { author, classId } = await setupClass();
        const post = await createQuote(author.client, classId);
        const url = `/classes/${classId}/posts/${post.id}`;

        expect((await author.client.patch(url).field("type", "image").field("title", "t").field("content", "x")).status).toBe(400);
        expect((await author.client.patch(url).field("type", "quote").field("title", "t").field("content", " ")).status).toBe(400);
        expect((await author.client.patch(url).field("type", "quote").field("title", "").field("content", "x")).status).toBe(400);
    });

    it("replaces and removes images, deleting the old files from storage", async () => {
        const { author, classId } = await setupClass();
        const post = await createImagePost(author.client, classId);
        const [originalKey] = await storedImageKeys();
        const url = `/classes/${classId}/posts/${post.id}`;

        const replaced = await author.client
            .patch(url)
            .field("type", "image")
            .field("title", "תמונה חדשה")
            .field("content", "")
            .attach("image", JPEG_BYTES, { filename: "new.jpg", contentType: "image/jpeg" });
        expect(replaced.status).toBe(200);
        expect(replaced.body.imageUrl).toMatch(/\.jpg\?/);
        const [newKey] = await storedImageKeys();
        expect(newKey).not.toBe(originalKey);
        expect(await fileExists(originalKey!)).toBe(false);
        expect(await fileExists(newKey!)).toBe(true);

        const removed = await author.client
            .patch(url)
            .field("type", "image")
            .field("title", "בלי תמונה")
            .field("content", "")
            .field("removeImage", "true");
        expect(removed.status).toBe(200);
        expect(removed.body.imageUrl).toBeNull();
        expect(await fileExists(newKey!)).toBe(false);
    });

    it("deletes posts (author or manager only) together with their image and reactions", async () => {
        const { manager, author, other, classId } = await setupClass();
        const imagePost = await createImagePost(author.client, classId);
        const quote = await createQuote(other.client, classId);
        const [key] = await storedImageKeys();
        await other.client.post(`/posts/${imagePost.id}/reactions`).send({ reaction: "like" });

        expect((await other.client.delete(`/classes/${classId}/posts/${imagePost.id}`)).status).toBe(403);
        expect((await author.client.delete(`/classes/${classId}/posts/${imagePost.id}`)).status).toBe(204);
        expect(await fileExists(key!)).toBe(false);
        expect(await prisma.reaction.count()).toBe(0);

        expect((await manager.client.delete(`/classes/${classId}/posts/${quote.id}`)).status).toBe(204);
        expect((await manager.client.delete(`/classes/${classId}/posts/${quote.id}`)).status).toBe(404);
        expect(await prisma.post.count()).toBe(0);
    });
});

function base(client: Awaited<ReturnType<typeof registerUser>>["client"], classId: number) {
    return client.post(`/classes/${classId}/posts`);
}

function createQuoteRaw(client: Awaited<ReturnType<typeof registerUser>>["client"], classId: number) {
    return client.post(`/classes/${classId}/posts`).field("type", "quote").field("title", "t").field("content", "x");
}

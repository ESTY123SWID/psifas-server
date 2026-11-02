import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { createClass, createClient, createQuote, registerUser } from "./helpers.js";

async function setup() {
    const manager = await registerUser();
    const member = await registerUser();
    const classItem = await createClass(manager.client, "כיתה", [member.client]);
    const post = await createQuote(manager.client, classItem.id);
    const getPost = (client = member.client) => client.get(`/classes/${classItem.id}/posts/${post.id}`);
    return { manager, member, classId: classItem.id, post, getPost };
}

describe("reactions", () => {
    it("adds, removes (same reaction again) and switches a reaction", async () => {
        const { member, post, getPost } = await setup();
        const react = (reaction: string) => member.client.post(`/posts/${post.id}/reactions`).send({ reaction });

        const added = await react("love");
        expect(added.status).toBe(200);
        expect(added.body.myReaction).toBe("love");
        expect((await getPost()).body).toMatchObject({ myReaction: "love", reactions: { love: 1 } });

        const switched = await react("laugh");
        expect(switched.body.myReaction).toBe("laugh");
        expect((await getPost()).body).toMatchObject({ myReaction: "laugh", reactions: { love: 0, laugh: 1 } });

        const removed = await react("laugh");
        expect(removed.body.myReaction).toBeNull();
        expect((await getPost()).body).toMatchObject({ myReaction: null, reactions: { laugh: 0 } });
    });

    it("counts reactions from several users and shows each user only their own reaction", async () => {
        const { manager, member, post, getPost } = await setup();
        await manager.client.post(`/posts/${post.id}/reactions`).send({ reaction: "fire" });
        await member.client.post(`/posts/${post.id}/reactions`).send({ reaction: "fire" });

        const asMember = await getPost(member.client);
        expect(asMember.body.reactions.fire).toBe(2);
        expect(asMember.body.myReaction).toBe("fire");

        const outsiderView = await registerUser();
        expect((await getPost(outsiderView.client)).status).toBe(403);
    });

    it("never stores duplicate reactions, even for concurrent clicks", async () => {
        const { member, post } = await setup();
        const results = await Promise.all(
            Array.from({ length: 4 }, () => member.client.post(`/posts/${post.id}/reactions`).send({ reaction: "like" }))
        );
        expect(results.every((r) => r.status === 200)).toBe(true);
        expect(await prisma.reaction.count({ where: { postId: post.id } })).toBeLessThanOrEqual(1);
    });

    it("validates reaction type, post existence, membership and authentication", async () => {
        const { post } = await setup();
        const outsider = await registerUser();
        const { member } = await setup();

        expect((await member.client.post(`/posts/${post.id}/reactions`).send({ reaction: "angry" })).status).toBe(400);
        expect((await member.client.post("/posts/999999/reactions").send({ reaction: "like" })).status).toBe(404);
        expect((await outsider.client.post(`/posts/${post.id}/reactions`).send({ reaction: "like" })).status).toBe(403);
        expect((await createClient().post(`/posts/${post.id}/reactions`).send({ reaction: "like" })).status).toBe(401);
    });
});

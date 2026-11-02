import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import {
    createClass,
    createClient,
    createImagePost,
    createQuote,
    fileExists,
    registerUser,
    storedImageKeys,
} from "./helpers.js";

describe("creating and joining classes", () => {
    it("creates a class with the creator as ClassManager and an invite code", async () => {
        const { client } = await registerUser();
        const response = await client.post("/classes").send({ name: "  כיתה ח׳1  " });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({ id: expect.any(Number), name: "כיתה ח׳1", role: "ClassManager" });
        expect(response.body.inviteCode).toMatch(/^[A-Z2-9]{8}$/);

        const mine = await client.get("/classes/my");
        expect(mine.status).toBe(200);
        expect(mine.body).toEqual([
            { id: response.body.id, name: "כיתה ח׳1", role: "ClassManager", createdAt: expect.any(String) },
        ]);
    });

    it("returns 409 when the user already has a class with the same name, 400 for an empty name", async () => {
        const { client } = await registerUser();
        await createClass(client, "כיתה א");
        expect((await client.post("/classes").send({ name: "כיתה א" })).status).toBe(409);
        expect((await client.post("/classes").send({ name: "   " })).status).toBe(400);
    });

    it("joins with an invite code (case/space-insensitive) as Member", async () => {
        const { client: manager } = await registerUser();
        const { client: student } = await registerUser();
        const classItem = await createClass(manager);

        const joined = await student.post("/classes/join").send({ inviteCode: ` ${classItem.inviteCode.toLowerCase()} ` });
        expect(joined.status).toBe(201);
        expect(joined.body).toMatchObject({ classId: classItem.id, role: "Member" });

        const mine = await student.get("/classes/my");
        expect(mine.body).toEqual([expect.objectContaining({ id: classItem.id, role: "Member" })]);
    });

    it("rejects a wrong code (404 INVITE_INVALID) and a double join (409 ALREADY_MEMBER)", async () => {
        const { client: manager } = await registerUser();
        const classItem = await createClass(manager);

        const wrong = await manager.post("/classes/join").send({ inviteCode: "NOPE2345" });
        expect(wrong.status).toBe(404);
        expect(wrong.body.code).toBe("INVITE_INVALID");

        const twice = await manager.post("/classes/join").send({ inviteCode: classItem.inviteCode });
        expect(twice.status).toBe(409);
        expect(twice.body.code).toBe("ALREADY_MEMBER");

        expect(await prisma.classMember.count()).toBe(1);
    });

    it("handles concurrent double-joins without creating duplicate memberships", async () => {
        const { client: manager } = await registerUser();
        const { client: student } = await registerUser();
        const classItem = await createClass(manager);

        const results = await Promise.all([
            student.post("/classes/join").send({ inviteCode: classItem.inviteCode }),
            student.post("/classes/join").send({ inviteCode: classItem.inviteCode }),
        ]);
        expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
        expect(await prisma.classMember.count({ where: { classId: classItem.id } })).toBe(2);
    });
});

describe("class access: 401 vs 403 vs 404", () => {
    it("distinguishes unauthenticated, non-member and missing class", async () => {
        const { client: manager } = await registerUser();
        const { client: outsider } = await registerUser();
        const classItem = await createClass(manager);

        expect((await createClient().get(`/classes/${classItem.id}`)).status).toBe(401);
        expect((await createClient().get("/classes/my")).status).toBe(401);

        const forbidden = await outsider.get(`/classes/${classItem.id}`);
        expect(forbidden.status).toBe(403);
        expect(forbidden.body.code).toBe("NOT_A_MEMBER");

        for (const path of ["/members", "/posts", "/posts/recent", "/featured"]) {
            expect((await outsider.get(`/classes/${classItem.id}${path}`)).status).toBe(403);
        }

        expect((await outsider.get("/classes/999999")).status).toBe(404);
        expect((await outsider.get("/classes/not-a-number")).status).toBe(400);
    });

    it("gives class-manager rights only in the class where the user is a manager", async () => {
        const { client: alice } = await registerUser();
        const { client: bob } = await registerUser();
        const classA = await createClass(alice, "A", [bob]); // Alice manages A, Bob is a member
        const classB = await createClass(bob, "B", [alice]); // Bob manages B, Alice is a member

        expect((await alice.patch(`/classes/${classA.id}`).send({ name: "A2" })).status).toBe(200);
        expect((await alice.patch(`/classes/${classB.id}`).send({ name: "B2" })).status).toBe(403);
        expect((await alice.get(`/classes/${classB.id}/invite-code`)).status).toBe(403);
        expect((await alice.delete(`/classes/${classB.id}`)).status).toBe(403);
        expect((await bob.get(`/classes/${classB.id}/invite-code`)).status).toBe(200);
    });
});

describe("managing a class", () => {
    it("returns details, renames, and manages the invite code", async () => {
        const { client: manager } = await registerUser();
        const { client: student } = await registerUser();
        const classItem = await createClass(manager, "ישן", [student]);

        const details = await student.get(`/classes/${classItem.id}`);
        expect(details.body).toMatchObject({ id: classItem.id, name: "ישן", role: "Member" });

        const renamed = await manager.patch(`/classes/${classItem.id}`).send({ name: "חדש" });
        expect(renamed.status).toBe(200);
        expect(renamed.body).toMatchObject({ id: classItem.id, name: "חדש", role: "ClassManager" });
        expect((await student.patch(`/classes/${classItem.id}`).send({ name: "x" })).status).toBe(403);

        expect((await manager.get(`/classes/${classItem.id}/invite-code`)).body).toEqual({ inviteCode: classItem.inviteCode });
        expect((await student.get(`/classes/${classItem.id}/invite-code`)).status).toBe(403);

        const regenerated = await manager.post(`/classes/${classItem.id}/invite-code/regenerate`);
        expect(regenerated.status).toBe(200);
        expect(regenerated.body.inviteCode).not.toBe(classItem.inviteCode);

        const { client: late } = await registerUser();
        expect((await late.post("/classes/join").send({ inviteCode: classItem.inviteCode })).status).toBe(404);
        expect((await late.post("/classes/join").send({ inviteCode: regenerated.body.inviteCode })).status).toBe(201);
    });

    it("deletes a class with all related data and stored images (manager only)", async () => {
        const { client: manager } = await registerUser();
        const { client: student } = await registerUser();
        const classItem = await createClass(manager, "למחיקה", [student]);
        const quote = await createQuote(student, classItem.id);
        await createImagePost(student, classItem.id);
        await student.post(`/posts/${quote.id}/reactions`).send({ reaction: "love" });
        const [imageKey] = await storedImageKeys();
        expect(await fileExists(imageKey!)).toBe(true);

        expect((await student.delete(`/classes/${classItem.id}`)).status).toBe(403);
        expect((await manager.delete(`/classes/${classItem.id}`)).status).toBe(204);

        expect(await prisma.class.count()).toBe(0);
        expect(await prisma.classMember.count()).toBe(0);
        expect(await prisma.post.count()).toBe(0);
        expect(await prisma.reaction.count()).toBe(0);
        expect(await fileExists(imageKey!)).toBe(false);
        expect((await student.get("/classes/my")).body).toEqual([]);
    });
});

describe("members and roles", () => {
    it("lists members with paging, totalCount and managerCount (managers first)", async () => {
        const { client: manager, user: managerUser } = await registerUser({ name: "מנהלת" });
        const students = await Promise.all([registerUser(), registerUser(), registerUser()]);
        const classItem = await createClass(manager, "כיתה", students.map((s) => s.client));

        const page1 = await students[0]!.client.get(`/classes/${classItem.id}/members?page=1&pageSize=2`);
        expect(page1.status).toBe(200);
        expect(page1.body).toMatchObject({ totalCount: 4, managerCount: 1, page: 1, pageSize: 2, totalPages: 2 });
        expect(page1.body.members).toHaveLength(2);
        expect(page1.body.members[0]).toEqual({
            id: managerUser.id,
            name: "מנהלת",
            email: managerUser.email,
            role: "ClassManager",
            joinedAt: expect.any(String),
        });

        expect((await manager.get(`/classes/${classItem.id}/members?pageSize=1000`)).status).toBe(400);
    });

    it("lets a manager promote/demote members, but never demote the last manager", async () => {
        const { client: manager, user: managerUser } = await registerUser();
        const { client: student, user: studentUser } = await registerUser();
        const classItem = await createClass(manager, "כיתה", [student]);
        const base = `/classes/${classItem.id}/members`;

        const lastManager = await manager.patch(`${base}/${managerUser.id}`).send({ role: "Member" });
        expect(lastManager.status).toBe(409);
        expect(lastManager.body.code).toBe("LAST_MANAGER");

        expect((await student.patch(`${base}/${managerUser.id}`).send({ role: "Member" })).status).toBe(403);
        expect((await manager.patch(`${base}/${studentUser.id}`).send({ role: "Boss" })).status).toBe(400);

        expect((await manager.patch(`${base}/${studentUser.id}`).send({ role: "ClassManager" })).status).toBe(200);
        expect((await manager.get(base)).body.managerCount).toBe(2);

        // Now there are two managers, so the original manager may step down.
        expect((await manager.patch(`${base}/${managerUser.id}`).send({ role: "Member" })).status).toBe(200);
        expect((await manager.get(`/classes/${classItem.id}`)).body.role).toBe("Member");
        expect((await manager.get(`/classes/${classItem.id}/invite-code`)).status).toBe(403);

        expect((await student.patch(`${base}/999999`).send({ role: "Member" })).status).toBe(404);
    });

    it("never lets two concurrent demotions leave a class without a manager", async () => {
        const { client: a, user: userA } = await registerUser();
        const { client: b, user: userB } = await registerUser();
        const classItem = await createClass(a, "כיתה", [b]);
        const base = `/classes/${classItem.id}/members`;
        await a.patch(`${base}/${userB.id}`).send({ role: "ClassManager" });

        const results = await Promise.all([
            a.patch(`${base}/${userB.id}`).send({ role: "Member" }),
            b.patch(`${base}/${userA.id}`).send({ role: "Member" }),
        ]);
        const statuses = results.map((r) => r.status).sort();
        expect(statuses[0]).toBe(200);
        expect([403, 409]).toContain(statuses[1]);
        expect(await prisma.classMember.count({ where: { classId: classItem.id, role: "ClassManager" } })).toBe(1);
    });

    it("removes members, but not the last manager", async () => {
        const { client: manager, user: managerUser } = await registerUser();
        const { client: student, user: studentUser } = await registerUser();
        const classItem = await createClass(manager, "כיתה", [student]);
        const base = `/classes/${classItem.id}/members`;

        expect((await student.delete(`${base}/${managerUser.id}`)).status).toBe(403);
        expect((await manager.delete(`${base}/${managerUser.id}`)).status).toBe(409);
        expect((await manager.delete(`${base}/${studentUser.id}`)).status).toBe(204);
        expect((await student.get(`/classes/${classItem.id}`)).status).toBe(403);
        expect((await manager.delete(`${base}/${studentUser.id}`)).status).toBe(404);
    });

    it("lets members leave, but blocks the last manager from leaving", async () => {
        const { client: manager } = await registerUser();
        const { client: student } = await registerUser();
        const classItem = await createClass(manager, "כיתה", [student]);

        const blocked = await manager.delete(`/classes/${classItem.id}/members/me`);
        expect(blocked.status).toBe(409);
        expect(blocked.body.code).toBe("LAST_MANAGER");

        expect((await student.delete(`/classes/${classItem.id}/members/me`)).status).toBe(204);
        expect((await student.get("/classes/my")).body).toEqual([]);
        expect((await student.delete(`/classes/${classItem.id}/members/me`)).status).toBe(403);
    });
});

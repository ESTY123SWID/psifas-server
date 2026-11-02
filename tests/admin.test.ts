import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { createClass, createClient, createImagePost, createQuote, fileExists, registerAdmin, registerUser, storedImageKeys } from "./helpers.js";

describe("admin access control", () => {
    it("returns 401 without a session and 403 for a regular user", async () => {
        const { client: regular } = await registerUser();
        for (const path of ["/admin/dashboard", "/admin/users", "/admin/classes"]) {
            expect((await createClient().get(path)).status).toBe(401);
            const forbidden = await regular.get(path);
            expect(forbidden.status).toBe(403);
        }
        expect((await regular.patch("/admin/users/1").send({ role: "SystemAdmin" })).status).toBe(403);
    });

    it("takes role changes into account immediately (no stale token roles)", async () => {
        const { client, user } = await registerUser();
        expect((await client.get("/admin/dashboard")).status).toBe(403);
        await prisma.user.update({ where: { id: user.id }, data: { role: "SystemAdmin" } });
        expect((await client.get("/admin/dashboard")).status).toBe(200);
    });
});

describe("admin dashboard and users", () => {
    it("returns dashboard totals and recent items", async () => {
        const { client: admin } = await registerAdmin();
        const { client: user } = await registerUser({ name: "רותם" });
        const classItem = await createClass(user, "כיתה ט");
        await createQuote(user, classItem.id);

        const response = await admin.get("/admin/dashboard");
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ totalUsers: 2, totalClasses: 1, totalPosts: 1 });
        expect(response.body.recentUsers[0]).toEqual({
            id: expect.any(Number),
            name: "רותם",
            email: expect.any(String),
            role: "User",
            registeredAt: expect.any(String),
        });
        expect(response.body.recentClasses[0]).toEqual({ id: classItem.id, name: "כיתה ט", createdAt: expect.any(String) });
    });

    it("lists users with search, sort, order and pagination", async () => {
        const { client: admin } = await registerAdmin();
        await registerUser({ name: "אביגיל", email: "avigail@example.com" });
        await registerUser({ name: "בתיה", email: "batya@example.com" });
        await registerUser({ name: "גילה", email: "gila@school.org" });

        const byName = await admin.get("/admin/users?page=1&pageSize=2&sort=name&order=asc");
        expect(byName.status).toBe(200);
        expect(byName.body).toMatchObject({ total: 4, page: 1, pageSize: 2, totalPages: 2 });
        expect(byName.body.items.map((u: { name: string }) => u.name)).toEqual(["אביגיל", "בתיה"]);

        const search = await admin.get("/admin/users?page=1&pageSize=20&sort=name&order=asc&search=SCHOOL");
        expect(search.body.items.map((u: { name: string }) => u.name)).toEqual(["גילה"]);

        const newestFirst = await admin.get("/admin/users?page=1&pageSize=20&sort=registeredAt&order=desc");
        expect(newestFirst.body.items[0].name).toBe("גילה");

        expect((await admin.get("/admin/users?sort=password")).status).toBe(400);
        expect(JSON.stringify(byName.body)).not.toContain("passwordHash");
    });

    it("returns user details with management counters and permission flags", async () => {
        const { client: admin, user: adminUser } = await registerAdmin();
        const { client: manager, user: managerUser } = await registerUser();
        await createClass(manager, "כיתה");

        const details = await admin.get(`/admin/users/${managerUser.id}`);
        expect(details.body).toMatchObject({
            id: managerUser.id,
            role: "User",
            classCount: 1,
            managedClassCount: 1,
            lastManagerClassCount: 1,
            systemAdminCount: 1,
            canChangeRole: true,
            canDelete: false,
        });

        const self = await admin.get(`/admin/users/${adminUser.id}`);
        expect(self.body).toMatchObject({ canChangeRole: false, canDelete: false });
        expect((await admin.get("/admin/users/999999")).status).toBe(404);
    });

    it("changes global roles, but not your own", async () => {
        const { client: admin, user: adminUser } = await registerAdmin();
        const { client: user, user: target } = await registerUser();

        const promoted = await admin.patch(`/admin/users/${target.id}`).send({ role: "SystemAdmin" });
        expect(promoted.status).toBe(200);
        expect(promoted.body).toMatchObject({ id: target.id, role: "SystemAdmin", systemAdminCount: 2 });
        expect((await user.get("/admin/dashboard")).status).toBe(200);

        expect((await admin.patch(`/admin/users/${adminUser.id}`).send({ role: "User" })).status).toBe(403);
        expect((await admin.patch(`/admin/users/${target.id}`).send({ role: "ClassManager" })).status).toBe(400);

        expect((await admin.patch(`/admin/users/${target.id}`).send({ role: "User" })).status).toBe(200);
        expect((await user.get("/admin/dashboard")).status).toBe(403);
    });

    it("deletes a user, keeping their posts anonymised; blocks deleting self and last class managers", async () => {
        const { client: admin, user: adminUser } = await registerAdmin();
        const { client: manager, user: managerUser } = await registerUser();
        const { client: member, user: memberUser } = await registerUser();
        const classItem = await createClass(manager, "כיתה", [member]);
        const post = await createQuote(member, classItem.id);

        expect((await admin.delete(`/admin/users/${adminUser.id}`)).status).toBe(403);

        const lastManager = await admin.delete(`/admin/users/${managerUser.id}`);
        expect(lastManager.status).toBe(409);
        expect(lastManager.body.code).toBe("LAST_MANAGER");

        expect((await admin.delete(`/admin/users/${memberUser.id}`)).status).toBe(204);
        expect((await member.get("/auth/me")).status).toBe(401);

        const kept = await manager.get(`/classes/${classItem.id}/posts/${post.id}`);
        expect(kept.status).toBe(200);
        expect(kept.body).toMatchObject({ authorId: null, authorName: null });
        expect((await admin.delete(`/admin/users/${memberUser.id}`)).status).toBe(404);
    });
});

describe("admin classes", () => {
    it("lists classes with counts, shows details, members, and deletes classes", async () => {
        const { client: admin } = await registerAdmin();
        const { client: manager, user: managerUser } = await registerUser({ name: "המנהלת" });
        const { client: member } = await registerUser();
        const classA = await createClass(manager, "אלף", [member]);
        await createClass(manager, "בית");
        await createImagePost(member, classA.id);
        const [imageKey] = await storedImageKeys();

        const list = await admin.get("/admin/classes?page=1&pageSize=20&sort=name&order=asc");
        expect(list.status).toBe(200);
        expect(list.body.total).toBe(2);
        expect(list.body.items[0]).toEqual({
            id: classA.id,
            name: "אלף",
            createdAt: expect.any(String),
            inviteCode: classA.inviteCode,
            memberCount: 2,
            postCount: 1,
            managerName: "המנהלת",
        });
        expect((await admin.get(`/admin/classes?search=${classA.inviteCode.toLowerCase()}`)).body.total).toBe(1);

        const details = await admin.get(`/admin/classes/${classA.id}`);
        expect(details.body).toMatchObject({
            id: classA.id,
            managerCount: 1,
            managers: [{ id: managerUser.id, name: "המנהלת", email: managerUser.email, role: "ClassManager" }],
        });

        const members = await admin.get(`/admin/classes/${classA.id}/members?page=1&pageSize=1`);
        expect(members.body).toMatchObject({ total: 2, page: 1, pageSize: 1, totalPages: 2 });
        expect(members.body.items[0]).toMatchObject({ id: managerUser.id, role: "ClassManager" });

        expect((await admin.delete(`/admin/classes/${classA.id}`)).status).toBe(204);
        expect((await admin.get(`/admin/classes/${classA.id}`)).status).toBe(404);
        expect(await fileExists(imageKey!)).toBe(false);
        expect(await prisma.post.count()).toBe(0);
    });
});

describe("admin class management and filters", () => {
    it("renames classes and manages memberships with the last-manager rule", async () => {
        const { client: admin } = await registerAdmin();
        const { client: manager, user: managerUser } = await registerUser({ name: "מנהלת" });
        const { client: member, user: memberUser } = await registerUser({ name: "חברה" });
        const classItem = await createClass(manager, "ישן", [member]);
        const base = `/admin/classes/${classItem.id}`;

        const renamed = await admin.patch(base).send({ name: "שם חדש" });
        expect(renamed.status).toBe(200);
        expect(renamed.body).toMatchObject({ id: classItem.id, name: "שם חדש", managerCount: 1 });
        expect((await admin.patch(base).send({ name: " " })).status).toBe(400);
        expect((await manager.patch(base).send({ name: "x" })).status).toBe(403);

        const lastManager = await admin.patch(`${base}/members/${managerUser.id}`).send({ role: "Member" });
        expect(lastManager.status).toBe(409);
        expect((await admin.delete(`${base}/members/${managerUser.id}`)).status).toBe(409);

        expect((await admin.patch(`${base}/members/${memberUser.id}`).send({ role: "ClassManager" })).status).toBe(200);
        expect((await admin.patch(`${base}/members/${managerUser.id}`).send({ role: "Member" })).status).toBe(200);
        expect((await member.get(`/classes/${classItem.id}/invite-code`)).status).toBe(200);

        expect((await admin.delete(`${base}/members/${managerUser.id}`)).status).toBe(204);
        expect((await manager.get(`/classes/${classItem.id}`)).status).toBe(403);
        expect((await admin.delete(`${base}/members/999999`)).status).toBe(404);
        expect((await admin.patch("/admin/classes/999999").send({ name: "x" })).status).toBe(404);
    });

    it("filters users by role and reports weekly dashboard numbers", async () => {
        const { client: admin } = await registerAdmin();
        await registerUser();
        await registerUser();

        const admins = await admin.get("/admin/users?role=SystemAdmin");
        expect(admins.body.total).toBe(1);
        expect(admins.body.items[0].role).toBe("SystemAdmin");
        expect((await admin.get("/admin/users?role=User")).body.total).toBe(2);
        expect((await admin.get("/admin/users?role=Boss")).status).toBe(400);

        const dashboard = await admin.get("/admin/dashboard");
        expect(dashboard.body).toMatchObject({ totalUsers: 3, systemAdminCount: 1, newUsersThisWeek: 3, newPostsThisWeek: 0, imagePostCount: 0 });
    });
});

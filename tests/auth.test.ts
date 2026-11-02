import request from "supertest";
import { describe, expect, it } from "vitest";

import { prisma } from "../src/lib/prisma.js";
import { CLIENT_ORIGIN, VALID_PASSWORD, app, createClient, registerUser } from "./helpers.js";

describe("registration", () => {
    it("creates a user, returns { user } without secrets and sets an HttpOnly session cookie", async () => {
        const client = createClient();
        const response = await client.post("/auth/register").send({
            name: "  נועה כהן  ",
            email: "  Noa@Example.COM ",
            password: VALID_PASSWORD,
        });

        expect(response.status).toBe(201);
        expect(response.body).toEqual({
            user: { id: expect.any(Number), name: "נועה כהן", email: "noa@example.com", role: "User" },
        });
        expect(JSON.stringify(response.body)).not.toContain("passwordHash");

        const cookie = response.headers["set-cookie"]?.[0] ?? "";
        expect(cookie).toMatch(/^psifas_session=/);
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("SameSite=Lax");

        const stored = await prisma.user.findUniqueOrThrow({ where: { email: "noa@example.com" } });
        expect(stored.passwordHash).not.toContain(VALID_PASSWORD);
        expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it("returns 409 for an email that is already registered (case-insensitive)", async () => {
        await registerUser({ email: "dup@example.com" });
        const response = await createClient().post("/auth/register").send({
            name: "שם אחר",
            email: "DUP@example.com",
            password: VALID_PASSWORD,
        });
        expect(response.status).toBe(409);
        expect(response.body.code).toBe("EMAIL_TAKEN");
    });

    it.each([
        [{ name: "א", email: "a@example.com", password: VALID_PASSWORD }, "name"],
        [{ name: "שם תקין", email: "not-an-email", password: VALID_PASSWORD }, "email"],
        [{ name: "שם תקין", email: "a@example.com", password: "weakpass" }, "password"],
        [{ name: "שם תקין", email: "a@example.com" }, "password"],
    ])("rejects invalid input with 400 and a field-level message (%#)", async (body, field) => {
        const response = await createClient().post("/auth/register").send(body);
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("VALIDATION_ERROR");
        expect(response.body.details.some((detail: { field: string }) => detail.field === field)).toBe(true);
    });

    it("returns 400 for malformed JSON without leaking parser internals", async () => {
        const response = await createClient().post("/auth/register").set("Content-Type", "application/json").send("{bad json");
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("MALFORMED_REQUEST");
    });
});

describe("login, session restore and logout", () => {
    it("logs in, restores the session with GET /auth/me, and logs out", async () => {
        const { user } = await registerUser({ email: "login@example.com" });
        const client = createClient();

        const login = await client.post("/auth/login").send({ email: "LOGIN@example.com", password: VALID_PASSWORD });
        expect(login.status).toBe(200);
        expect(login.body.user).toEqual(user);

        const me = await client.get("/auth/me");
        expect(me.status).toBe(200);
        expect(me.body).toEqual({ user });

        const logout = await client.post("/auth/logout");
        expect(logout.status).toBe(204);
        expect(logout.headers["set-cookie"]?.[0]).toMatch(/psifas_session=;.*Expires=Thu, 01 Jan 1970/);

        expect((await client.get("/auth/me")).status).toBe(401);
    });

    it("returns the same 401 for a wrong password and an unknown email", async () => {
        await registerUser({ email: "known@example.com" });
        const wrongPassword = await createClient().post("/auth/login").send({ email: "known@example.com", password: "Wr0ng!Pass" });
        const unknownEmail = await createClient().post("/auth/login").send({ email: "nobody@example.com", password: VALID_PASSWORD });

        expect(wrongPassword.status).toBe(401);
        expect(unknownEmail.status).toBe(401);
        expect(wrongPassword.body).toEqual(unknownEmail.body);
    });

    it("rejects missing, tampered and orphaned session cookies with 401", async () => {
        expect((await createClient().get("/auth/me")).status).toBe(401);

        const tampered = await request(app).get("/api/auth/me").set("Cookie", "psifas_session=eyJhbGciOiJub25lIn0.e30.");
        expect(tampered.status).toBe(401);

        const { client, user } = await registerUser();
        await prisma.user.delete({ where: { id: user.id } });
        expect((await client.get("/auth/me")).status).toBe(401);
    });
});

describe("PATCH /auth/me", () => {
    it("updates name and email and returns { user }", async () => {
        const { client, user } = await registerUser();
        const response = await client.patch("/auth/me").send({ name: "שם חדש", email: "New@Example.com" });
        expect(response.status).toBe(200);
        expect(response.body.user).toEqual({ ...user, name: "שם חדש", email: "new@example.com" });
    });

    it("returns 409 when the email belongs to someone else, 400 for invalid input, 401 without session", async () => {
        await registerUser({ email: "taken@example.com" });
        const { client } = await registerUser();

        expect((await client.patch("/auth/me").send({ name: "שם", email: "taken@example.com" })).status).toBe(409);
        expect((await client.patch("/auth/me").send({ name: "", email: "x@example.com" })).status).toBe(400);
        expect((await createClient().patch("/auth/me").send({ name: "שם", email: "x@example.com" })).status).toBe(401);
    });
});

describe("CSRF protection", () => {
    it("blocks state-changing requests from foreign or missing origins and without the custom header", async () => {
        const body = { name: "שם תקין", email: "csrf@example.com", password: VALID_PASSWORD };

        const noOrigin = await request(app).post("/api/auth/register").set("X-Requested-With", "XMLHttpRequest").send(body);
        expect(noOrigin.status).toBe(403);
        expect(noOrigin.body.code).toBe("CSRF_ORIGIN_REJECTED");

        const evilOrigin = await request(app)
            .post("/api/auth/register")
            .set("Origin", "https://evil.example")
            .set("X-Requested-With", "XMLHttpRequest")
            .send(body);
        expect(evilOrigin.status).toBe(403);

        const noHeader = await request(app).post("/api/auth/register").set("Origin", CLIENT_ORIGIN).send(body);
        expect(noHeader.status).toBe(403);
        expect(noHeader.body.code).toBe("CSRF_HEADER_MISSING");

        expect(await prisma.user.count()).toBe(0);
    });

    it("answers CORS preflights only for allowed origins, with credentials", async () => {
        const allowed = await request(app)
            .options("/api/auth/login")
            .set("Origin", CLIENT_ORIGIN)
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "content-type,x-requested-with");
        expect(allowed.headers["access-control-allow-origin"]).toBe(CLIENT_ORIGIN);
        expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

        const denied = await request(app)
            .options("/api/auth/login")
            .set("Origin", "https://evil.example")
            .set("Access-Control-Request-Method", "POST");
        expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    });
});

describe("rate limiting", () => {
    it("returns 429 after too many failed login attempts from one IP", async () => {
        const client = createClient({ ip: "203.0.113.7" });
        const statuses: number[] = [];
        for (let i = 0; i < 6; i++) {
            const response = await client.post("/auth/login").send({ email: "x@example.com", password: "Wr0ng!Pass" });
            statuses.push(response.status);
        }
        expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
        expect(statuses[5]).toBe(429);
    });
});

describe("POST /auth/me/password", () => {
    const NEW_PASSWORD = "N3w!Password";

    it("changes the password, keeps this session, and signs out other sessions", async () => {
        const { client, user } = await registerUser({ email: "pw@example.com" });
        const otherDevice = createClient();
        expect((await otherDevice.post("/auth/login").send({ email: "pw@example.com", password: VALID_PASSWORD })).status).toBe(200);

        const response = await client
            .post("/auth/me/password")
            .send({ currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });
        expect(response.status).toBe(204);
        expect(response.headers["set-cookie"]?.[0]).toMatch(/^psifas_session=ey/);

        expect((await client.get("/auth/me")).body.user).toEqual(user);
        expect((await otherDevice.get("/auth/me")).status).toBe(401);

        expect((await createClient().post("/auth/login").send({ email: "pw@example.com", password: VALID_PASSWORD })).status).toBe(401);
        expect((await createClient().post("/auth/login").send({ email: "pw@example.com", password: NEW_PASSWORD })).status).toBe(200);
    });

    it("rejects a wrong current password with 400 (never 401, which would log the client out)", async () => {
        const { client } = await registerUser();
        const response = await client.post("/auth/me/password").send({ currentPassword: "Wr0ng!Pass", newPassword: NEW_PASSWORD });
        expect(response.status).toBe(400);
        expect(response.body.code).toBe("INVALID_CURRENT_PASSWORD");
        expect((await client.get("/auth/me")).status).toBe(200);
    });

    it("validates the new password: policy, confirmation and difference from the current one", async () => {
        const { client } = await registerUser();
        const send = (body: object) => client.post("/auth/me/password").send(body);

        expect((await send({ currentPassword: VALID_PASSWORD, newPassword: "weak" })).status).toBe(400);
        const mismatch = await send({ currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: "Other!Pass1" });
        expect(mismatch.status).toBe(400);
        expect(mismatch.body.details[0].field).toBe("confirmPassword");
        expect((await send({ currentPassword: VALID_PASSWORD, newPassword: VALID_PASSWORD })).status).toBe(400);
        expect((await createClient().post("/auth/me/password").send({ currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD })).status).toBe(401);
    });
});

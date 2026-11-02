import argon2 from "argon2";

// argon2id with OWASP-recommended parameters (19 MiB, 2 iterations).
const HASH_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
    return argon2.hash(password, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
        return await argon2.verify(hash, password);
    } catch {
        return false;
    }
}

// Used when the email does not exist, so a failed login costs the same time either way.
let dummyHashPromise: Promise<string> | null = null;

export async function verifyAgainstDummyHash(password: string): Promise<void> {
    dummyHashPromise ??= hashPassword("dummy-password-for-timing-safety");
    await verifyPassword(await dummyHashPromise, password);
}

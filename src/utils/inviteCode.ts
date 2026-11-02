import { randomInt } from "node:crypto";

// No 0/O/1/I/L — easy to read aloud and type.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;

export function generateInviteCode(): string {
    let code = "";
    for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
        code += ALPHABET[randomInt(ALPHABET.length)];
    }
    return code;
}

export function normalizeInviteCode(code: string): string {
    return code.trim().toUpperCase().replace(/[\s-]/g, "");
}

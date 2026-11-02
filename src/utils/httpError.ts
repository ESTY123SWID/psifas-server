/**
 * Every API error response has the shape:
 *   { code: string, message: string, details?: unknown }
 * The client reads `status` and, in some flows (join class), `data.code`.
 */
export class HttpError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly details?: unknown
    ) {
        super(message);
        this.name = "HttpError";
    }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
    new HttpError(400, code, message, details);

export const unauthorized = (message = "נדרשת התחברות.") =>
    new HttpError(401, "UNAUTHENTICATED", message);

export const forbidden = (message = "אין לך הרשאה לבצע פעולה זו.", code = "FORBIDDEN") =>
    new HttpError(403, code, message);

export const notFound = (message = "המשאב לא נמצא.", code = "NOT_FOUND") =>
    new HttpError(404, code, message);

export const conflict = (code: string, message: string) =>
    new HttpError(409, code, message);

import type { z } from "zod";

/**
 * Parses request input with a Zod schema. A ZodError thrown here is turned into a
 * 400 VALIDATION_ERROR response by the central error handler.
 */
export function parseInput<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.output<TSchema> {
    return schema.parse(input ?? {});
}

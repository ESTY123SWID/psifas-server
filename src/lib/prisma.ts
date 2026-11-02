import { PrismaPg } from "@prisma/adapter-pg";

import { env } from "../config/env.js";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });

export type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
export type DbClient = typeof prisma | TransactionClient;

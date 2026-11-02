import type { ClassRole, GlobalRole } from "../generated/prisma/enums.js";

export interface AuthenticatedUser {
    id: number;
    name: string;
    email: string;
    role: GlobalRole;
}

export interface ClassMembershipContext {
    classId: number;
    role: ClassRole;
}

declare global {
    namespace Express {
        interface Request {
            /** Set by requireAuth — always loaded fresh from the database. */
            user?: AuthenticatedUser;
            /** Set by requireClassMember — the caller's membership in :classId. */
            membership?: ClassMembershipContext;
        }
    }
}

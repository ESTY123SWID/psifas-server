import type { ClassRole, GlobalRole } from "../generated/prisma/enums.js";
import type { ClassMemberDto, ClassOptionDto, UserDto } from "../types/api.types.js";

export function toUserDto(user: { id: number; name: string; email: string; role: GlobalRole }): UserDto {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export function toClassOptionDto(
    classItem: { id: number; name: string; createdAt: Date },
    role: ClassRole
): ClassOptionDto {
    return {
        id: classItem.id,
        name: classItem.name,
        role,
        createdAt: classItem.createdAt.toISOString(),
    };
}

export function toClassMemberDto(member: {
    role: ClassRole;
    joinedAt: Date;
    user: { id: number; name: string; email: string };
}): ClassMemberDto {
    return {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        joinedAt: member.joinedAt.toISOString(),
    };
}

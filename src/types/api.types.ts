// Response shapes — these mirror the client's types in REACT/src/types/*.types.tsx.
import type { ClassRole, GlobalRole, PostType, ReactionType } from "../generated/prisma/enums.js";

export interface UserDto {
    id: number;
    name: string;
    email: string;
    role: GlobalRole;
}

export interface ClassOptionDto {
    id: number;
    name: string;
    role: ClassRole;
    createdAt: string;
}

export interface ClassMemberDto {
    id: number;
    name: string | null;
    email: string | null;
    role: ClassRole;
    joinedAt: string;
}

export type ReactionCountsDto = Record<ReactionType, number>;

export interface PostDto {
    id: number;
    authorId: number | null;
    type: PostType;
    title: string;
    authorName: string | null;
    createdAt: string;
    updatedAt: string;
    content: string | null;
    imageUrl: string | null;
    reactions: ReactionCountsDto;
    myReaction: ReactionType | null;
}

export interface RecentPostDto {
    id: number;
    title: string;
    authorName: string;
    createdAt: string;
}

export interface FeaturedItemDto {
    id: number;
    type: PostType;
    text: string | null;
    imageUrl: string | null;
    reactions: ReactionCountsDto;
    myReaction: ReactionType | null;
}

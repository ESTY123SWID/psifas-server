-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('User', 'SystemAdmin');

-- CreateEnum
CREATE TYPE "ClassRole" AS ENUM ('Member', 'ClassManager');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('quote', 'image');

-- CreateEnum
CREATE TYPE "ReactionType" AS ENUM ('like', 'love', 'laugh', 'adore', 'touched', 'wow', 'applause', 'fire');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "GlobalRole" NOT NULL DEFAULT 'User',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "inviteCode" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMember" (
    "userId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "role" "ClassRole" NOT NULL DEFAULT 'Member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassMember_pkey" PRIMARY KEY ("userId","classId")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "classId" INTEGER NOT NULL,
    "authorId" INTEGER,
    "type" "PostType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "content" VARCHAR(2000),
    "imageKey" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "postId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("postId","userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Class_inviteCode_key" ON "Class"("inviteCode");

-- CreateIndex
CREATE INDEX "Class_createdAt_idx" ON "Class"("createdAt");

-- CreateIndex
CREATE INDEX "Class_name_idx" ON "Class"("name");

-- CreateIndex
CREATE INDEX "ClassMember_classId_role_idx" ON "ClassMember"("classId", "role");

-- CreateIndex
CREATE INDEX "Post_classId_createdAt_idx" ON "Post"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_classId_type_idx" ON "Post"("classId", "type");

-- CreateIndex
CREATE INDEX "Post_authorId_idx" ON "Post"("authorId");

-- CreateIndex
CREATE INDEX "Reaction_postId_type_idx" ON "Reaction"("postId", "type");

-- CreateIndex
CREATE INDEX "Reaction_userId_idx" ON "Reaction"("userId");

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMember" ADD CONSTRAINT "ClassMember_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data integrity rules enforced by the database itself (Prisma does not model CHECK constraints).
ALTER TABLE "User" ADD CONSTRAINT "User_name_not_blank" CHECK (char_length(btrim("name")) >= 2);
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "Class" ADD CONSTRAINT "Class_name_not_blank" CHECK (char_length(btrim("name")) >= 1);
ALTER TABLE "Post" ADD CONSTRAINT "Post_title_not_blank" CHECK (char_length(btrim("title")) >= 1);
ALTER TABLE "Post" ADD CONSTRAINT "Post_quote_has_content"
    CHECK ("type" <> 'quote' OR char_length(btrim(coalesce("content", ''))) >= 1);

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "delistedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PlayerHierarchyChange" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fromLevel" TEXT,
    "toLevel" TEXT,
    "source" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerHierarchyChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerHierarchyChange_playerId_idx" ON "PlayerHierarchyChange"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerHierarchyChange" ADD CONSTRAINT "PlayerHierarchyChange_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

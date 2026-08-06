-- DropIndex
DROP INDEX "AuctionEntry_auctionId_playerId_key";

-- AlterTable
ALTER TABLE "AuctionEntry" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- CreateIndex
-- Unicità solo tra gli inserimenti ATTIVI (revokedAt IS NULL): un giocatore non può essere
-- venduto due volte contemporaneamente, ma può essere riassegnato dopo un "Annulla ultima
-- azione" (sez. 11). Indice parziale, non esprimibile con @@unique in Prisma schema language.
CREATE UNIQUE INDEX "AuctionEntry_auctionId_playerId_active_key"
  ON "AuctionEntry" ("auctionId", "playerId")
  WHERE "revokedAt" IS NULL;

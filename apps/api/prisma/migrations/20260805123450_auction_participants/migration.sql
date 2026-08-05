-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isMe" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Participant_leagueId_idx" ON "Participant"("leagueId");

-- CreateIndex
CREATE INDEX "Auction_leagueId_idx" ON "Auction"("leagueId");

-- CreateIndex
CREATE INDEX "AuctionEntry_buyerId_idx" ON "AuctionEntry"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "AuctionEntry_auctionId_playerId_key" ON "AuctionEntry"("auctionId", "playerId");

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Auction" ADD CONSTRAINT "Auction_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionEntry" ADD CONSTRAINT "AuctionEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionEntry" ADD CONSTRAINT "AuctionEntry_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "Participant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


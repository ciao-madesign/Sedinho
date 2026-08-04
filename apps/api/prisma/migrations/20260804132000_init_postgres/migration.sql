-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "participants" INTEGER NOT NULL,
    "initialBudget" INTEGER NOT NULL,
    "rosterComposition" TEXT NOT NULL,
    "allowedModules" TEXT NOT NULL,
    "auctionMode" TEXT NOT NULL,
    "callOrder" TEXT NOT NULL,
    "rulesText" TEXT NOT NULL,
    "parsedRules" TEXT NOT NULL,
    "entryFee" TEXT,
    "prizePool" TEXT,
    "cupFormat" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "nationality" TEXT,
    "foot" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'available',
    "estimatedRecoveryDate" TIMESTAMP(3),
    "initialQuotation" INTEGER,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonStats" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "fantasyAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "xG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "xA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shotsOnTarget" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "penaltiesScored" INTEGER NOT NULL DEFAULT 0,
    "penaltiesTaken" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "expectedBonus" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "SeasonStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerHierarchy" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "reliability" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerHierarchy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SetPieceRole" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SetPieceRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamRotationProfile" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "numberOfCompetitions" INTEGER NOT NULL,
    "turnoverFrequency" DOUBLE PRECISION NOT NULL,
    "coachReliability" DOUBLE PRECISION NOT NULL,
    "turnoverProbabilityByRole" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamRotationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "fromTeam" TEXT,
    "toTeam" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startingRoleImpact" DOUBLE PRECISION NOT NULL,
    "minutesImpact" DOUBLE PRECISION NOT NULL,
    "bonusImpact" DOUBLE PRECISION NOT NULL,
    "riskDelta" DOUBLE PRECISION NOT NULL,
    "fantasyValueDelta" DOUBLE PRECISION NOT NULL,
    "newStarterProbability" DOUBLE PRECISION NOT NULL,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerEvaluation" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reliability" TEXT NOT NULL,
    "production" TEXT NOT NULL,
    "bonus" TEXT NOT NULL,
    "stability" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "PlayerEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Auction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuctionEntry" (
    "id" TEXT NOT NULL,
    "auctionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpponentProfile" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "aggressiveness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topPlayerPreference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "youngPlayerPreference" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "teamPreferences" TEXT NOT NULL DEFAULT '{}',
    "spendConcentration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overpayIndex" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpponentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_team_idx" ON "Player"("team");

-- CreateIndex
CREATE INDEX "Player_role_idx" ON "Player"("role");

-- CreateIndex
CREATE INDEX "SeasonStats_season_idx" ON "SeasonStats"("season");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonStats_playerId_season_competition_key" ON "SeasonStats"("playerId", "season", "competition");

-- CreateIndex
CREATE INDEX "PlayerHierarchy_playerId_idx" ON "PlayerHierarchy"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SetPieceRole_playerId_type_key" ON "SetPieceRole"("playerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "TeamRotationProfile_team_key" ON "TeamRotationProfile"("team");

-- CreateIndex
CREATE INDEX "Transfer_playerId_idx" ON "Transfer"("playerId");

-- CreateIndex
CREATE INDEX "PlayerEvaluation_playerId_idx" ON "PlayerEvaluation"("playerId");

-- CreateIndex
CREATE INDEX "AuctionEntry_auctionId_idx" ON "AuctionEntry"("auctionId");

-- CreateIndex
CREATE INDEX "AuctionEntry_playerId_idx" ON "AuctionEntry"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "OpponentProfile_participantId_key" ON "OpponentProfile"("participantId");

-- AddForeignKey
ALTER TABLE "SeasonStats" ADD CONSTRAINT "SeasonStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerHierarchy" ADD CONSTRAINT "PlayerHierarchy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SetPieceRole" ADD CONSTRAINT "SetPieceRole_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerEvaluation" ADD CONSTRAINT "PlayerEvaluation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuctionEntry" ADD CONSTRAINT "AuctionEntry_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;


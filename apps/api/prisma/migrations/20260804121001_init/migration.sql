-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "participants" INTEGER NOT NULL,
    "initialBudget" INTEGER NOT NULL,
    "rosterComposition" TEXT NOT NULL,
    "allowedModules" TEXT NOT NULL,
    "auctionMode" TEXT NOT NULL,
    "callOrder" TEXT NOT NULL,
    "rulesText" TEXT NOT NULL,
    "parsedRules" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "birthDate" DATETIME,
    "nationality" TEXT,
    "foot" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'available',
    "estimatedRecoveryDate" DATETIME,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "reliability" REAL NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SeasonStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "appearances" INTEGER NOT NULL DEFAULT 0,
    "minutes" INTEGER NOT NULL DEFAULT 0,
    "fantasyAvg" REAL NOT NULL DEFAULT 0,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "goals" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "xG" REAL NOT NULL DEFAULT 0,
    "xA" REAL NOT NULL DEFAULT 0,
    "shots" INTEGER NOT NULL DEFAULT 0,
    "shotsOnTarget" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "penaltiesScored" INTEGER NOT NULL DEFAULT 0,
    "penaltiesTaken" INTEGER NOT NULL DEFAULT 0,
    "cleanSheets" INTEGER NOT NULL DEFAULT 0,
    "expectedBonus" REAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "reliability" REAL NOT NULL DEFAULT 1,
    CONSTRAINT "SeasonStats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerHierarchy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "reliability" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerHierarchy_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SetPieceRole" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "probability" REAL NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SetPieceRole_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamRotationProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "team" TEXT NOT NULL,
    "numberOfCompetitions" INTEGER NOT NULL,
    "turnoverFrequency" REAL NOT NULL,
    "coachReliability" REAL NOT NULL,
    "turnoverProbabilityByRole" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "fromTeam" TEXT,
    "toTeam" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "startingRoleImpact" REAL NOT NULL,
    "minutesImpact" REAL NOT NULL,
    "bonusImpact" REAL NOT NULL,
    "riskDelta" REAL NOT NULL,
    "fantasyValueDelta" REAL NOT NULL,
    "newStarterProbability" REAL NOT NULL,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transfer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerEvaluation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "computedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reliability" TEXT NOT NULL,
    "production" TEXT NOT NULL,
    "bonus" TEXT NOT NULL,
    "stability" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    CONSTRAINT "PlayerEvaluation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Auction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leagueId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME
);

-- CreateTable
CREATE TABLE "AuctionEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuctionEntry_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OpponentProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "participantId" TEXT NOT NULL,
    "aggressiveness" REAL NOT NULL DEFAULT 0,
    "averageSpend" REAL NOT NULL DEFAULT 0,
    "topPlayerPreference" REAL NOT NULL DEFAULT 0,
    "youngPlayerPreference" REAL NOT NULL DEFAULT 0,
    "teamPreferences" TEXT NOT NULL DEFAULT '{}',
    "spendConcentration" REAL NOT NULL DEFAULT 0,
    "remainingBudget" REAL NOT NULL DEFAULT 0,
    "overpayIndex" REAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
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

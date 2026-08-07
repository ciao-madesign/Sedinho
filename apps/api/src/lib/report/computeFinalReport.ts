import type {
  FinalReport,
  FinalReportOperation,
  FinalReportRoleBalance,
  HierarchyLevel,
  PlayerAvailability,
  PlayerRole,
  SetPieceType,
} from "@sedinho/shared";

export interface FinalReportPlayerInput {
  playerId: string;
  name: string;
  role: PlayerRole;
  team: string;
  price: number;
  hierarchyLevel: HierarchyLevel | null;
  availability: PlayerAvailability;
  valueScore: number | null;
  expectedAuctionPrice: number | null;
  expectedFantasyPoints: number | null;
  rotationRisk: number | null;
  setPieceTypes: SetPieceType[];
}

export interface ComputeFinalReportInput {
  participantId: string;
  auctionEndedAt: string | null;
  players: FinalReportPlayerInput[];
  budgetInitial: number;
}

const PENALTY_TYPES: SetPieceType[] = ["penalty-1", "penalty-2", "penalty-3"];
const SET_PIECE_TYPES: SetPieceType[] = ["direct-free-kick-1", "direct-free-kick-2", "corner", "side-free-kick"];

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** 0..100, più alto = più rischioso: media di indisponibilità attuale e "quanto è riserva"
 * (gerarchia). Stessa euristica dichiarata del Decision Engine (sez. 14) e del Radar di rosa,
 * qui applicata per-giocatore invece che aggregata sulla rosa intera — `null` se non c'è
 * nessuno dei due dati (mai un rischio inventato). */
function playerRiskScore(player: FinalReportPlayerInput): number | null {
  const unavailable = player.availability !== "available" ? 1 : 0;
  const hierarchyRisk =
    player.hierarchyLevel === "starter"
      ? 0
      : player.hierarchyLevel === "first-alternate"
        ? 0.5
        : player.hierarchyLevel === "second-alternate"
          ? 1
          : null;
  if (hierarchyRisk === null) return unavailable ? 100 : null;
  return Math.round((0.5 * unavailable + 0.5 * hierarchyRisk) * 100);
}

function buildOperation(player: FinalReportPlayerInput): FinalReportOperation {
  const expectedPrice = player.expectedAuctionPrice;
  const deltaPercent =
    expectedPrice !== null && expectedPrice > 0
      ? Number(((player.price - expectedPrice) / expectedPrice).toFixed(2))
      : null;
  return {
    playerId: player.playerId,
    name: player.name,
    role: player.role,
    team: player.team,
    price: player.price,
    expectedPrice,
    deltaPercent,
  };
}

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

/** Report finale (sez. 16), motore puro: stesso pattern di Market/Opponent/Decision/Simulator
 * Engine, nessuna dipendenza da Prisma/HTTP. Calcolato on-demand dalla rotta, mai persistito —
 * la rosa dell'utente non cambia dopo la fine dell'asta, non serve uno storico separato. */
export function computeFinalReport(input: ComputeFinalReportInput): FinalReport {
  const { participantId, auctionEndedAt, players, budgetInitial } = input;
  const rosterSize = players.length;
  const totalSpent = players.reduce((sum, p) => sum + p.price, 0);

  const withExpectedPrice = players.filter((p) => p.expectedAuctionPrice !== null);
  const theoreticalValue =
    withExpectedPrice.length > 0
      ? withExpectedPrice.reduce((sum, p) => sum + p.expectedAuctionPrice!, 0)
      : null;
  const theoreticalValueCoverage = rosterSize > 0 ? withExpectedPrice.length / rosterSize : 0;

  const withFantasyPoints = players.filter((p) => p.expectedFantasyPoints !== null);
  const expectedFantasyPoints =
    withFantasyPoints.length > 0
      ? Number(withFantasyPoints.reduce((sum, p) => sum + p.expectedFantasyPoints!, 0).toFixed(1))
      : null;
  const expectedFantasyPointsCoverage = rosterSize > 0 ? withFantasyPoints.length / rosterSize : 0;

  const riskDistribution = { low: 0, medium: 0, high: 0, unknown: 0 };
  for (const player of players) {
    const risk = playerRiskScore(player);
    if (risk === null) riskDistribution.unknown += 1;
    else if (risk < 33) riskDistribution.low += 1;
    else if (risk < 66) riskDistribution.medium += 1;
    else riskDistribution.high += 1;
  }

  const roleBalance: FinalReportRoleBalance[] = ROLES.map((role) => {
    const roleScores = players.filter((p) => p.role === role && p.valueScore !== null).map((p) => p.valueScore!);
    return {
      role,
      count: players.filter((p) => p.role === role).length,
      averageValueScore: average(roleScores),
    };
  });

  let teamDependency: FinalReport["teamDependency"] = null;
  if (rosterSize > 0) {
    const teamCounts = new Map<string, number>();
    for (const p of players) teamCounts.set(p.team, (teamCounts.get(p.team) ?? 0) + 1);
    const [topTeam, topCount] = [...teamCounts.entries()].sort((a, b) => b[1] - a[1])[0]!;
    teamDependency = { team: topTeam, share: Number((topCount / rosterSize).toFixed(2)) };
  }

  const penaltyPlayers = players.filter((p) => p.setPieceTypes.some((t) => PENALTY_TYPES.includes(t)));
  const setPiecePlayers = players.filter((p) => p.setPieceTypes.some((t) => SET_PIECE_TYPES.includes(t)));

  const withRotationRisk = players.filter((p) => p.rotationRisk !== null);
  const turnoverExposure =
    withRotationRisk.length > 0
      ? Number(average(withRotationRisk.map((p) => p.rotationRisk!))!.toFixed(2))
      : null;
  const turnoverExposureCoverage = rosterSize > 0 ? withRotationRisk.length / rosterSize : 0;

  const operations = withExpectedPrice.map(buildOperation).sort((a, b) => a.deltaPercent! - b.deltaPercent!);
  const bestOperations = operations.slice(0, 3);
  const worstOperations = [...operations].reverse().slice(0, 3);

  // Confronta la spesa SOLO sui giocatori con prezzo atteso noto, non il totale della rosa:
  // altrimenti con una copertura parziale il confronto sarebbe sbilanciato (spesa su tutti,
  // valore teorico solo su alcuni).
  const spentOnKnownPlayers = withExpectedPrice.reduce((sum, p) => sum + p.price, 0);
  const overallDelta =
    theoreticalValue !== null && theoreticalValue > 0
      ? Number((((spentOnKnownPlayers - theoreticalValue) / theoreticalValue) * 100).toFixed(1))
      : null;

  const explanation = {
    factors: [
      {
        label: "Copertura dati",
        direction: "neutral" as const,
        weight: 0,
        detail: `Prezzo atteso disponibile per ${withExpectedPrice.length}/${rosterSize} giocatori, punti attesi per ${withFantasyPoints.length}/${rosterSize}, esposizione turnover per ${withRotationRisk.length}/${rosterSize} (Rotation Engine, sez. 7, non ancora implementato — quasi sempre 0).`,
      },
      {
        label: "Costo vs valore",
        direction: overallDelta === null ? "neutral" as const : overallDelta > 10 ? "unfavorable" as const : overallDelta < -10 ? "favorable" as const : "neutral" as const,
        weight: 0.3,
        detail:
          overallDelta !== null
            ? `Sui ${withExpectedPrice.length} giocatori con prezzo atteso noto: speso ${spentOnKnownPlayers} crediti contro un valore teorico stimato di ${theoreticalValue} (${overallDelta > 0 ? "+" : ""}${overallDelta}%). Speso totale di rosa (tutti i ${rosterSize} giocatori): ${totalSpent} crediti.`
            : "Nessun prezzo atteso disponibile per calcolare il confronto complessivo.",
      },
    ],
    confidence: Number(((theoreticalValueCoverage + expectedFantasyPointsCoverage) / 2).toFixed(2)),
    summary:
      rosterSize > 0
        ? `Rosa di ${rosterSize} giocatori, ${totalSpent} crediti spesi su ${budgetInitial} disponibili.`
        : "Nessun giocatore ancora acquistato in questa asta.",
  };

  return {
    participantId,
    auctionEndedAt,
    rosterSize,
    totalSpent,
    budgetInitial,
    theoreticalValue,
    theoreticalValueCoverage: Number(theoreticalValueCoverage.toFixed(2)),
    expectedFantasyPoints,
    expectedFantasyPointsCoverage: Number(expectedFantasyPointsCoverage.toFixed(2)),
    riskDistribution,
    roleBalance,
    teamDependency,
    penaltyCoverage: { covered: penaltyPlayers.length > 0, players: penaltyPlayers.map((p) => p.name) },
    setPieceCoverage: { covered: setPiecePlayers.length > 0, players: setPiecePlayers.map((p) => p.name) },
    turnoverExposure,
    turnoverExposureCoverage: Number(turnoverExposureCoverage.toFixed(2)),
    bestOperations,
    worstOperations,
    explanation,
  };
}

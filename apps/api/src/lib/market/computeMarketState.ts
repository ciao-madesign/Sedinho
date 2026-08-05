import type { MarketState, PlayerRole } from "@sedinho/shared";

const ROLES: PlayerRole[] = ["P", "D", "C", "A"];

export interface MarketEntryInput {
  role: PlayerRole;
  price: number;
  quotation: number | null;
  timestamp: string;
}

export interface MarketStarterInput {
  role: PlayerRole;
  sold: boolean;
}

export interface ComputeMarketStateInput {
  auctionId: string;
  entries: MarketEntryInput[];
  remainingBudgetTotal: number;
  /** Un elemento per ogni giocatore con `hierarchyLevel === "starter"` nel database centrale
   * (non solo quelli comparsi in asta), per sapere quanti titolari mancano ancora sul mercato. */
  starters: MarketStarterInput[];
}

/** Motore di mercato puro (sez. 13), stesso pattern del Player Evaluation Engine
 * (apps/api/src/lib/evaluation/): nessuna dipendenza da Prisma/HTTP, solo dati già estratti dal
 * DB in ingresso. Calcola i 6 parametri della spec esclusivamente dagli `AuctionEntry` già
 * registrati — nessuna proiezione sugli inserimenti futuri, nessun dato inventato. */
export function computeMarketState(input: ComputeMarketStateInput): MarketState {
  const withQuotation = input.entries.filter(
    (e): e is MarketEntryInput & { quotation: number } => e.quotation !== null && e.quotation > 0,
  );

  const priceInflation = overpayRatio(withQuotation);

  const roleDeflation: Partial<Record<PlayerRole, number>> = {};
  for (const role of ROLES) {
    const roleEntries = withQuotation.filter((e) => e.role === role);
    if (roleEntries.length > 0) {
      roleDeflation[role] = overpayRatio(roleEntries);
    }
  }

  // Temperatura: media di sovra/sotto-pagamento sugli ultimi 5 inserimenti (tutti se meno di
  // 5), schiacciata in 0..1 attorno a 0.5 = "in linea con le quotazioni ufficiali". Euristica
  // dichiarata (vedi UI), non una probabilità calibrata su dati storici.
  const mostRecentFirst = [...withQuotation].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const marketTemperature = clamp01(0.5 + overpayRatio(mostRecentFirst.slice(0, 5)));

  const starterScarcityByRole: Partial<Record<PlayerRole, number>> = {};
  for (const role of ROLES) {
    const roleStarters = input.starters.filter((s) => s.role === role);
    if (roleStarters.length > 0) {
      starterScarcityByRole[role] =
        roleStarters.filter((s) => s.sold).length / roleStarters.length;
    }
  }

  const averageBidValue =
    input.entries.length > 0
      ? input.entries.reduce((sum, e) => sum + e.price, 0) / input.entries.length
      : 0;

  return {
    auctionId: input.auctionId,
    priceInflation,
    roleDeflation,
    marketTemperature,
    remainingBudgetTotal: input.remainingBudgetTotal,
    starterScarcityByRole,
    averageBidValue,
    updatedAt: new Date().toISOString(),
  };
}

/** (prezzo totale - quotazione totale) / quotazione totale: positivo = si sta pagando sopra
 * quotazione (inflazione), negativo = sotto (svalutazione). 0 se non c'è nulla da confrontare. */
function overpayRatio(entries: { price: number; quotation: number }[]): number {
  if (entries.length === 0) return 0;
  const totalPrice = entries.reduce((sum, e) => sum + e.price, 0);
  const totalQuotation = entries.reduce((sum, e) => sum + e.quotation, 0);
  if (totalQuotation === 0) return 0;
  return (totalPrice - totalQuotation) / totalQuotation;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

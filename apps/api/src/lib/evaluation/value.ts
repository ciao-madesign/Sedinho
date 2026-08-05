import type { ExplanationFactor, ValueIndices } from "@sedinho/shared";
import { missingDataFactor, type IndexCalculation } from "./types.js";

/** Indici di Convenienza (sez. 8). Solo `valueScore` e `expectedAuctionPrice` sono
 * calcolabili oggi, dalla quotazione ufficiale del listone (`Player.initialQuotation`,
 * fonte Fantacalcio.it, l'unico connettore reale attivo). `valueScore` e' il percentile
 * della quotazione rispetto ai giocatori dello stesso ruolo: riflette quanto il *mercato*
 * valuta gia' il giocatore, non ancora un ritorno atteso reale (per quello servirebbe
 * `ProductionIndices`, oggi non disponibile — vedi `efficiencyIndex`/`opportunityScore`,
 * che infatti restano `null`). */
export function computeValueIndices(
  initialQuotation: number | undefined,
  roleQuotations: number[],
): IndexCalculation<ValueIndices> {
  const factors: ExplanationFactor[] = [];

  let valueScore: number | null = null;
  let expectedAuctionPrice: number | null = null;

  if (initialQuotation !== undefined && roleQuotations.length > 0) {
    const lowerOrEqual = roleQuotations.filter((q) => q <= initialQuotation).length;
    valueScore = Number((lowerOrEqual / roleQuotations.length).toFixed(2));
    expectedAuctionPrice = initialQuotation;
    factors.push({
      label: "Quotazione ufficiale",
      direction: "neutral",
      weight: 0.5,
      detail: `Percentile ${Math.round(valueScore * 100)} tra i giocatori dello stesso ruolo, quotazione ${initialQuotation} crediti (fonte: Fantacalcio.it). Non incorpora ancora una produzione attesa: per quella serve FSTATS.`,
    });
  } else {
    factors.push(
      missingDataFactor(
        "Quotazione ufficiale",
        "Dato non disponibile: nessuna quotazione importata per questo giocatore.",
      ),
    );
  }

  factors.push(
    missingDataFactor(
      "Produzione attesa / prezzo per credito",
      "Dato non disponibile: efficiencyIndex richiede ProductionIndices (FSTATS non ancora completato).",
    ),
  );
  factors.push(
    missingDataFactor(
      "Dinamiche di mercato",
      "Dato non disponibile: opportunityScore richiede il Market Engine (sez. 13, non ancora implementato).",
    ),
  );

  return {
    indices: { valueScore, expectedAuctionPrice, efficiencyIndex: null, opportunityScore: null },
    factors,
  };
}

import { prisma } from "../db/prisma.js";

/** Aggiorna `Player.delistedAt` (sez. 5, bug segnalato dall'utente: "giocatori non più
 * presenti nella lista ufficiale ma ancora presenti nel mio database") confrontando i
 * giocatori confermati in questo giro dalla fonte `canCreatePlayers` (oggi solo Fantacalcio.it/
 * quotazioni, l'unica autorevole sull'intera rosa Serie A) con tutti i giocatori che hanno già
 * una quotazione nota — proxy per "già visti da questa fonte in passato", dato che solo
 * `canCreatePlayers` scrive `initialQuotation`. Mai una cancellazione: chi manca viene
 * flaggato (`delistedAt` valorizzato), chi ricompare viene sbloccato (`delistedAt: null`).
 * Guardia esplicita su `matchedPlayerIds.length === 0`: se il connettore fallisse producendo
 * zero record risolti (non dovrebbe succedere — `runImport.ts` lo tratta già come errore
 * separato — ma meglio non fidarsi ciecamente qui), non marchiamo l'intera rosa come sparita. */
export async function updateDelistedPlayers(
  matchedPlayerIds: string[],
): Promise<{ delisted: number; relisted: number }> {
  if (matchedPlayerIds.length === 0) return { delisted: 0, relisted: 0 };

  const delisted = await prisma.player.updateMany({
    where: {
      id: { notIn: matchedPlayerIds },
      initialQuotation: { not: null },
      delistedAt: null,
    },
    data: { delistedAt: new Date() },
  });

  const relisted = await prisma.player.updateMany({
    where: {
      id: { in: matchedPlayerIds },
      delistedAt: { not: null },
    },
    data: { delistedAt: null },
  });

  return { delisted: delisted.count, relisted: relisted.count };
}

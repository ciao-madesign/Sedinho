import { prisma } from "../db/prisma.js";

/** Riconciliazione dello stato di disponibilità (sez. "Infortuni" Dashboard): il connettore
 * Fantacalciopedia/infortunati (`import/connectors/fantacalciopediaInfortuni.ts`) è uno
 * snapshot dello stato ATTUALE, non uno storico — un giocatore guarito/tornato disponibile
 * semplicemente non ricompare più nell'elenco. Senza questa riconciliazione resterebbe segnato
 * "injured"/"suspended" per sempre, stesso identico bug già corretto per `Player.delistedAt`
 * (vedi CLAUDE.md §5). `currentlyAffectedPlayerIds` è l'elenco di TUTTI i giocatori toccati da
 * questo specifico giro del connettore (sia infortunati che squalificati): chi era già segnato
 * ma non è più in questo elenco torna "available". */
export async function resetStaleAvailability(currentlyAffectedPlayerIds: string[]): Promise<number> {
  const result = await prisma.player.updateMany({
    where: {
      availability: { in: ["injured", "suspended"] },
      id: { notIn: currentlyAffectedPlayerIds },
    },
    data: { availability: "available" },
  });
  return result.count;
}

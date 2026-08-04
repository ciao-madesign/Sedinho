import * as cheerio from "cheerio";
import type { FastifyInstance } from "fastify";

/** Rotta temporanea per ispezionare il markup reale di fantacalcio.it da un ambiente
 * (Vercel) che ha accesso a internet, dato che il sandbox di sviluppo non ce l'ha.
 * Da rimuovere una volta corretti i selettori in import/connectors/fantacalcioIt.ts. */
export async function debugRoutes(app: FastifyInstance) {
  app.get("/debug/fantacalcio", async () => {
    const url = "https://www.fantacalcio.it/quotazioni-fantacalcio";
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const candidates = [
      "table",
      "table.table-players",
      "table.player-table",
      "tbody tr",
      "[class*='player']",
      "[class*='quotazion']",
      "[class*='listone']",
    ];

    const candidateCounts = candidates.map((sel) => ({ selector: sel, count: $(sel).length }));

    const firstTable = $("table").first();
    const tableSnippet = firstTable.length
      ? firstTable.prop("outerHTML")?.slice(0, 3000)
      : null;

    const firstRow = $("tbody tr").first();
    const rowSnippet = firstRow.length ? firstRow.prop("outerHTML")?.slice(0, 2000) : null;

    return {
      status: res.status,
      htmlLength: html.length,
      title: $("title").text(),
      candidateCounts,
      tableSnippet,
      rowSnippet,
      bodyStartSnippet: html.slice(0, 1500),
    };
  });
}

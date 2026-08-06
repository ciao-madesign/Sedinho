import type { FastifyInstance } from "fastify";
import * as cheerio from "cheerio";

/** Rotta di debug TEMPORANEA per ispezionare dal vivo cosa restituisce davvero Transfermarkt
 * (0/20 giocatori trovati al primo giro reale, selettori mai verificati in questa sessione —
 * vedi CLAUDE.md sez. 5 su import/transfermarktInjuries.ts). Stessa tecnica già usata per
 * fantacalcio.it/fantacalciopedia.com in sessioni precedenti: rimuovere una volta che i
 * selettori del connettore sono corretti e verificati. Non collegata a nessun flusso utente. */
export async function debugRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { name?: string } }>("/debug/transfermarkt", async (request, reply) => {
    const name = request.query.name;
    if (!name) return reply.code(400).send({ error: "?name= richiesto" });

    const url = `https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(name)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const playerHrefs = new Set<string>();
    $("a[href*='/profil/spieler/']").each((_, el) => {
      const href = $(el).attr("href");
      if (href) playerHrefs.add(href);
    });

    return {
      url,
      status: res.status,
      contentLength: html.length,
      tableItemsCount: $("table.items").length,
      tableItemsRowCount: $("table.items tbody tr").length,
      playerLinksFoundAnywhere: [...playerHrefs].slice(0, 15),
      looksLikeChallenge:
        /just a moment|cloudflare|captcha|enable javascript|access denied/i.test(html),
      titleTag: $("title").text().trim(),
      bodySnippet: html.replace(/\s+/g, " ").slice(0, 3000),
    };
  });

  app.get<{ Querystring: { slug?: string; id?: string } }>(
    "/debug/transfermarkt-injuries",
    async (request, reply) => {
      const { slug, id } = request.query;
      if (!slug || !id) return reply.code(400).send({ error: "?slug=&id= richiesti" });

      const url = `https://www.transfermarkt.com/${slug}/verletzungen/spieler/${id}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Sedinho/0.1; strumento fantacalcio personale)",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      const html = await res.text();
      const $ = cheerio.load(html);

      return {
        url,
        status: res.status,
        contentLength: html.length,
        tableItemsCount: $("table.items").length,
        tableItemsRowCount: $("table.items tbody tr").length,
        looksLikeChallenge:
          /just a moment|cloudflare|captcha|enable javascript|access denied/i.test(html),
        titleTag: $("title").text().trim(),
        bodySnippet: html.replace(/\s+/g, " ").slice(0, 3000),
      };
    },
  );
}

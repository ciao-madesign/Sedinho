import * as cheerio from "cheerio";
import type { FastifyInstance } from "fastify";

/** Rotta temporanea per ispezionare il markup reale di fantacalciopedia.com (lista infortunati)
 * da un ambiente (Vercel) che ha accesso a internet, dato che il sandbox di sviluppo non ce
 * l'ha. Stesso identico pattern già usato per Fantacalcio.it/FSTATS/Fantacalciopedia gerarchie
 * (vedi CLAUDE.md §5/§8) e per il tentativo Transfermarkt. Da rimuovere una volta scritto e
 * verificato il connettore infortuni. */
export async function debugRoutes(app: FastifyInstance) {
  app.get("/debug/fetch", async (request, reply) => {
    const url = (request.query as Record<string, string>).url;
    if (!url) {
      return reply.code(400).send({ error: "manca ?url=" });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const candidates = [
      "table",
      "tbody tr",
      "[class*='player']",
      "[class*='calciator']",
      "[class*='giocator']",
      "[class*='infortun']",
      "[class*='rientr']",
      "ul li",
      "script[id]",
      "script[type='application/json']",
    ];
    const candidateCounts = candidates.map((sel) => {
      try {
        return { selector: sel, count: $(sel).length };
      } catch {
        return { selector: sel, count: -1 };
      }
    });

    return {
      status: res.status,
      finalUrl: res.url,
      htmlLength: html.length,
      title: $("title").text(),
      candidateCounts,
      bodyStartSnippet: html.slice(0, 4000),
    };
  });

  app.get("/debug/find", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const url = query.url;
    const keywords = (query.keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);
    const selector = query.selector;
    if (!url || (keywords.length === 0 && !selector)) {
      return reply.code(400).send({ error: "servono ?url= e (?keywords=a,b oppure ?selector=)" });
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const matches: Record<string, string[]> = {};
    for (const keyword of keywords) {
      const found: string[] = [];
      const lower = html.toLowerCase();
      const needle = keyword.toLowerCase();
      let from = 0;
      while (found.length < 8) {
        const idx = lower.indexOf(needle, from);
        if (idx === -1) break;
        found.push(html.slice(Math.max(0, idx - 200), idx + 300));
        from = idx + needle.length;
      }
      matches[keyword] = found;
    }

    let selectorSnippets: string[] | undefined;
    if (selector) {
      selectorSnippets = $(selector)
        .slice(0, 10)
        .map((_, el) => $(el).prop("outerHTML")?.slice(0, 1500) ?? "")
        .get();
    }

    return {
      status: res.status,
      finalUrl: res.url,
      htmlLength: html.length,
      matches,
      selectorSnippets,
    };
  });
}

import * as cheerio from "cheerio";
import type { FastifyInstance } from "fastify";
import { runImport } from "../import/runImport.js";

/** Rotta temporanea per ispezionare il markup reale di fstats.it e fantacalciopedia.com da
 * un ambiente (Vercel) che ha accesso a internet, dato che il sandbox di sviluppo non ce
 * l'ha. Da rimuovere una volta corretti i selettori nei rispettivi connettori. */
export async function debugRoutes(app: FastifyInstance) {
  // GET invece di POST /import/run: serve solo a poter verificare i nuovi connettori da
  // questa sessione tramite un fetch GET (mcp Vercel web_fetch_vercel_url), senza dover
  // ricorrere a un client HTTP POST che il sandbox non ha. Rimossa insieme al resto.
  app.get("/debug/run-import", async () => runImport());

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
      "[class*='rigor']",
      "[class*='gerarchi']",
      "[class*='titolare']",
      "script[id]",
      "script[type='application/json']",
      "[data-*]",
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

  app.get("/debug/links", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const url = query.url;
    const filter = query.filter ?? "";
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

    const hrefs = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      if (filter && !href.toLowerCase().includes(filter.toLowerCase())) return;
      hrefs.add(href);
    });

    return {
      status: res.status,
      finalUrl: res.url,
      htmlLength: html.length,
      linkCount: hrefs.size,
      links: Array.from(hrefs).slice(0, 200),
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

    const limit = Number(query.limit) || 5;
    const maxLen = Number(query.maxLen) || 1500;
    let selectorSnippets: string[] | undefined;
    if (selector) {
      selectorSnippets = $(selector)
        .slice(0, limit)
        .map((_, el) => $(el).prop("outerHTML")?.slice(0, maxLen) ?? "")
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

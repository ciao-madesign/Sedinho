import * as cheerio from "cheerio";
import type { FastifyInstance } from "fastify";

/** Rotta temporanea per ispezionare il markup reale di fstats.it e fantacalciopedia.com da
 * un ambiente (Vercel) che ha accesso a internet, dato che il sandbox di sviluppo non ce
 * l'ha. Da rimuovere una volta corretti i selettori nei rispettivi connettori. */
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
}

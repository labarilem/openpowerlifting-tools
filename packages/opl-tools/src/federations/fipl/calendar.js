import puppeteer from "puppeteer";

const FIPL_BASE_URL = "https://www.powerliftingitalia-fipl.it";

/**
 * @returns {Promise<Array<{ name: string; date: string; location: string; description: string; resultsUrls: string[] }>>}
 */
async function scrapeMeets(page) {
  return page.evaluate((base) => {
    function norm(s) {
      return (s || "").replace(/\s+/g, " ").trim();
    }

    function abs(href) {
      try {
        return new URL(href, base).href;
      } catch {
        return href;
      }
    }

    /** @param {HTMLTableElement} table */
    function extractFromTable(table) {
      const trs = [...table.querySelectorAll("tr")];
      const colspanTds = [];
      for (const tr of trs) {
        const cells = tr.querySelectorAll("td");
        if (cells.length !== 1) continue;
        const td = cells[0];
        if (td.getAttribute("colspan") === "2") colspanTds.push(td);
      }

      const date = colspanTds[0] ? norm(colspanTds[0].textContent) : "";
      const location = colspanTds[1] ? norm(colspanTds[1].textContent) : "";
      const description = colspanTds[2] ? norm(colspanTds[2].textContent) : "";

      const resultsUrls = [];
      let inResults = false;

      for (const tr of trs) {
        const td = tr.querySelector("td[colspan='2']");
        if (!td) {
          if (inResults) inResults = false;
          continue;
        }

        const hasRisultatiLabel =
          !!td.querySelector("strong") &&
          /risultati\s*:/i.test(td.textContent || "");

        if (hasRisultatiLabel) {
          inResults = true;
          for (const a of td.querySelectorAll("a[href]")) {
            const h = a.getAttribute("href");
            if (h) resultsUrls.push(abs(h));
          }
          continue;
        }

        if (inResults) {
          const links = [...td.querySelectorAll("a[href]")].map((a) =>
            a.getAttribute("href"),
          );
          const allPdf = links.every((h) => h && /\.pdf(\?|$)/i.test(h));
          if (links.length && allPdf) {
            for (const h of links) {
              if (h) resultsUrls.push(abs(h));
            }
          } else {
            inResults = false;
          }
        }
      }

      return { date, location, description, resultsUrls };
    }

    const blocks = document.querySelectorAll("div.colonna-1-3");
    const meets = [];

    for (const block of blocks) {
      const h1 = block.querySelector("h1.Text14Black, h1");
      const table = block.querySelector("table");
      if (!h1 || !table) continue;

      const name = (h1.textContent || "").trim();
      if (!name || name === "Calendario Gare e Risultati") continue;

      const { date, location, description, resultsUrls } =
        extractFromTable(table);
      meets.push({
        name,
        date,
        location,
        description,
        resultsUrls,
      });
    }

    return meets;
  }, FIPL_BASE_URL);
}

/**
 * Scrape FIPL annual calendar and return sequential-id entries.
 * @param {number} year
 * @returns {Promise<Array<{ id: number; name: string; date: string; location: string; description: string; resultsUrls: string[] }>>}
 */
export async function scrapeFiplCalendar(year) {
  const url = `${FIPL_BASE_URL}/calendario-gare.asp?anno=${year}`;
  const isGithubActions = process.env.GITHUB_ACTIONS === "true";
  const browser = await puppeteer.launch({
    headless: true,
    // GitHub-hosted Linux runners can block Chromium sandboxing.
    args: isGithubActions ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
  });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
    const meets = await scrapeMeets(page);
    return meets.map((meet, index) => ({
      id: index + 1,
      ...meet,
    }));
  } finally {
    await browser.close();
  }
}

export const scrapeCalendar = scrapeFiplCalendar;

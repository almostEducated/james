const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const cron = require("node-cron");
const db = require("./db");

class VenueScraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: true, // Use new Headless mode
      executablePath:
        process.platform === "linux" ? "/usr/bin/chromium-browser" : undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--no-first-run",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });
  }

  async initializeDev() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox"],
    });
  }

  async scrapeEventPage(page, eventUrl, venueConfig) {
    try {
      await page.goto(eventUrl, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      const content = await page.content();
      const $ = cheerio.load(content);

      console.log($(venueConfig.eventPage.imgSelector));

      return {
        title: $(venueConfig.eventPage.titleSelector).text().trim(),
        date: $(venueConfig.eventPage.dateSelector).text().trim(),
        time: $(venueConfig.eventPage.timeSelector).text().trim(),
        price:
          $(venueConfig.eventPage.priceSelector).text().trim() || "unavailable",
        description: $(venueConfig.eventPage.descriptionSelector).text().trim(),
        image: $(venueConfig.eventPage.imgSelector).find("img").attr("src"),
        venue: venueConfig.venueName,
        url: eventUrl,
      };
    } catch (error) {
      console.error(`Error scraping event page ${eventUrl}:`, error);
      return null;
    }
  }

  async scrapeVenue(url, venueConfig) {
    console.log("scrapping", url);
    try {
      const page = await this.browser.newPage();
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      );
      await page.setDefaultNavigationTimeout(90000);
      await page.setDefaultNavigationTimeout(60000); // 60 seconds
      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 60000,
      });

      // Add error retry logic
      let content;
      try {
        content = await page.content();
      } catch (error) {
        console.log(`Retrying ${url} after error:`, error);
        await page.reload({ waitUntil: "networkidle0", timeout: 60000 });
        content = await page.content();
      }

      const $ = cheerio.load(content);

      // Debug the selectors
      console.log("Looking for dates:", $(venueConfig.dateSelector).length);

      const shows = [];
      const eventLinks = [];

      // Use venue-specific selectors to find show information
      $(venueConfig.showSelector).each((_, element) => {
        const eventURL = $(element).find(venueConfig.linkSelector).attr("href");
        const date = $(element).find(venueConfig.dateSelector).text().trim();
        if (isShowToday(date)) {
          eventLinks.push(eventURL);
        }
      });

      function isShowToday(dateString) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        try {
          const showDate = new Date(dateString);
          showDate.setHours(0, 0, 0, 0);
          showDate.setFullYear(2024);
          return showDate.getTime() === today.getTime();
        } catch (error) {
          console.error("Error parsing date:", dateString);
          return false;
        }
      }

      for (const eventUrl of eventLinks) {
        const show = await this.scrapeEventPage(page, eventUrl, venueConfig);
        if (show) shows.push(show);
      }

      await page.close();
      return shows;
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return [];
    }
  }

  async scrapeMultipleVenues(venueConfigs) {
    const allShows = [];

    for (const config of venueConfigs) {
      const shows = await this.scrapeVenue(config.url, config);
      allShows.push(...shows);
    }

    return allShows;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

const venueConfigs = [
  {
    venueName: "Johnny Brendas",
    url: "https://johnnybrendas.com/events/",
    showSelector: ".eventMainWrapper",
    linkSelector: ".url",
    dateSelector: ".eventDateList",
    eventPage: {
      dateSelector: ".eventStDate",
      imgSelector: ".rhp-events-event-image",
      titleSelector: "h1.mb-1",
      priceSelector: ".eventCost",
      timeSelector: ".eventDoorStartDate",
    },
  },
  {
    venueName: "Kung Fu Necktie",
    url: "https://kungfunecktie.com/events/",
    linkSelector: ".url",
    showSelector: ".eventWrapper",
    dateSelector: "#eventDate",
    eventPage: {
      dateSelector: ".eventStDate",
      imgSelector: ".rhp-events-event-image",
      titleSelector: "a#eventTitle",
      priceSelector: ".eventCost",
      timeSelector: ".eventDoorStartDate",
    },
  },
  // {
  //   venueName: "Ortlieb's Lounge",
  //   url: "https://www.eventbrite.com/o/ortliebs-lounge-19833288947",
  //   showSelector:
  //     ".Container_root__4i85v NestedActionContainer_root__1jtfr event-card event-card__vertical",
  //   linkSelector: "a.event-card-link",
  //   dateSelector: "",
  //   titleSelector: "a.event-card-link",
  //   dateSelector: 'p[class$="event-card"]',
  //   priceSelector: ".eventCost",
  //   timeSelector: ".eventDoorStartDate",
  // },
  // {
  //   venueName: "The Fillmore",
  //   url: "https://www.thefillmorephilly.com/shows",
  //   linkSelector: "a.css-l1pvlg",
  //   showSelector: ".chakra-linkbox",
  //   dateSelector: ".chakra-text css-rfy86g",
  //   eventPage: {
  //     dateSelector: "span.sc-1eku3jf-16 kqyHHD",
  //     imgSelector: ".sc-1eku3jf-11 fhKWSi",
  //     titleSelector: ".sc-1eku3jf-14 dmTQnE",
  //     priceSelector: '["date-bdd"]="quick-pick-price-button"',
  //     timeSelector: "span.sc-1eku3jf-16 kqyHHD",
  //   },
  // },
];

const postDB = (data) => {
  db.run("DELETE FROM scrape_results");
  db.run(
    "INSERT INTO scrape_results (data) VALUES (?)",
    [JSON.stringify(data)],
    function (err) {
      if (err) {
        console.log(err);
        return;
      }
      console.log("Inserted row id is", this.lastID);
    }
  );
};

const getDB = async (req, res) => {
  db.get(
    "SELECT data, timestamp FROM scrape_results ORDER BY timestamp DESC LIMIT 1",
    [],
    (err, row) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (!row) {
        res.status(404).json({ error: "No data found" });
        return;
      }
      res.json({
        data: JSON.parse(row.data),
        timestamp: row.timestamp,
      });
    }
  );
};

async function main() {
  const scraper = new VenueScraper();
  if (process.env.NODE_ENV === "development") {
    await scraper.initializeDev();
  } else {
    await scraper.initialize();
  }
  const shows = await scraper.scrapeMultipleVenues(venueConfigs);

  await scraper.close();
  return shows;
}

const getForceScrape = async (req, res) => {
  const data = await main();
  postDB(data);
  res.json({ data: data });
};

const getScrape = async (req, res) => {
  try {
    getDB(req, res);
  } catch (error) {
    res.status(500).json({ error: "Scraping failed" });
  }
};

cron.schedule("0 3 * * *", async () => {
  try {
    const data = await main();
    postDB(data);
  } catch (error) {
    console.error("Scraper failed:", error);
  }
});

module.exports = { getScrape, getForceScrape };

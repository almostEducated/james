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
        // "--disable-web-security",
        // "--disable-features=IsolateOrigins,site-per-process",
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
        waitUntil: ["networkidle0", "domcontentloaded", "load"],
      });

      const content = await page.content();
      const $ = cheerio.load(content);

      return {
        title: $(venueConfig.eventPage.titleSelector).text().trim(),
        date: $(venueConfig.eventPage.dateSelector).text().trim(),
        time: $(venueConfig.eventPage.timeSelector).text().trim(),
        price:
          $(venueConfig.eventPage.priceSelector).text().trim() ||
          "Click Link for Pricing",
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

  async scrapeVenue(page, url, venueConfig) {
    console.log(`Scraping ${venueConfig.venueName} at ${url}`);

    try {
      await page.setDefaultNavigationTimeout(90000);
      await page.goto(url, {
        waitUntil: ["networkidle0", "domcontentloaded", "load"],
      });

      const content = await this.getPageContent(page);

      const $ = cheerio.load(content);

      const shows = {};
      const eventLinks = this.getEventLinks($, venueConfig);

      for (const eventUrl of eventLinks) {
        const show = await this.scrapeEventPage(page, eventUrl, venueConfig);

        if (show && !shows[show.title]) {
          shows[show.title] = show;
        }

        // Add small delay between event pages
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      return Object.values(shows);
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return [];
    }
  }

  async getPageContent(page) {
    try {
      return await page.content();
    } catch (error) {
      console.log("Retrying page load after error:", error);
      await page.reload({ waitUntil: "networkidle0" });
      return await page.content();
    }
  }

  getEventLinks($, venueConfig) {
    const eventLinks = [];
    console.log(
      venueConfig.venueName,
      "Searching",
      $(venueConfig.showSelector).length,
      "shows"
    );

    $(venueConfig.showSelector).each((_, element) => {
      const eventURL = $(element).find(venueConfig.linkSelector).attr("href");
      const date = $(element).find(venueConfig.dateSelector).text().trim();
      if (this.isShowToday(date)) {
        eventLinks.push(eventURL);
      }
    });
    return eventLinks;
  }

  isShowToday(dateString) {
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

  async scrapeMultipleVenues(venueConfigs) {
    const allShows = [];
    let currentPage = null;

    for (const config of venueConfigs) {
      try {
        if (currentPage) {
          console.log(`closing previous page`);
          await currentPage.close();
        }
        currentPage = await this.browser.newPage();
        const shows = await this.scrapeVenue(currentPage, config.url, config);
        console.log("found", shows.length, "shows");
        allShows.push(...shows);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Failed to scrape ${config.venueName}:`, error);
      }
    }

    if (currentPage) {
      console.log("closing page");
      await currentPage.close();
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
      titleSelector: "#eventTitle > h1",
      priceSelector: ".eventCost > span",
      timeSelector: ".eventDoorStartDate",
    },
  },
  {
    venueName: "MilkBoy Philadelphia",
    url: "https://milkboyphilly.com/events/",
    linkSelector: ".listing__titleLink",
    showSelector: ".listing__details",
    dateSelector: ".listingDateTime > span",
    eventPage: {
      dateSelector: ".singleListingGrid__date > span",
      imgSelector: ".opacityWrap",
      titleSelector: ".singleListing__title",
      priceSelector: ".EventDetailsCallToAction__Price-sc-a993917-6 > span",
      timeSelector: ".listing-doors",
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
  //   linkSelector: ".css-l1pvlg > a",
  //   showSelector: ".chakra-linkbox",
  //   dateSelector: ".css-1he4v4k > p:nth-child(2)",
  //   eventPage: {
  //     dateSelector: "span.sc-1eku3jf-16",
  //     imgSelector: ".sc-1eku3jf-10",
  //     titleSelector: ".sc-1eku3jf-14",
  //     priceSelector: "#quickpick-buy-button-qp-0",
  //     timeSelector: "span.sc-1eku3jf-16",
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
      let data = JSON.parse(row.data);
      if (data.length === 0) {
        async () => {
          data = await main();
          postDB(data);
        };
      }
      res.json({
        data: data,
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
  console.log(shows);

  await scraper.close();
  return shows;
}

const getForceScrape = async (req, res) => {
  res.sendStatus(201);
  const data = await main();
  postDB(data);
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

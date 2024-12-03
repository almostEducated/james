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
      headless: "new", // Use new Headless mode
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
      headless: "new",
      args: ["--no-sandbox"],
    });
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
      console.log("Looking for titles:", $(venueConfig.titleSelector).length);
      console.log("Looking for dates:", $(venueConfig.dateSelector).length);

      const shows = [];

      // You need a showSelector to iterate over event containers
      // If there isn't one, you might need to find a common parent element
      const showSelector = venueConfig.showSelector || ".eventMainWrapper";

      // Use venue-specific selectors to find show information
      $(showSelector).each((_, element) => {
        const show = {
          title: $(element).find(venueConfig.titleSelector).text().trim(),
          date: $(element).find(venueConfig.dateSelector).text().trim(),
          time: $(element).find(venueConfig.timeSelector).text().trim(),
          price: $(element).find(venueConfig.priceSelector).text().trim(),
          venue: venueConfig.venueName,
          url: url,
        };

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
        if (show.title && isShowToday(show.date)) {
          let duplicate = false;
          if (shows.some((el) => el.title === show.title)) {
            duplicate = true;
          }
          if (show.price === "") show.price = "unavaliable";

          if (!duplicate) shows.push(show);
        }
      });

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
    imgSelector: ".eventListImage",
    showSelector: ".eventMainWrapper",
    titleSelector: "a#eventTitle",
    dateSelector: ".eventDateList",
    priceSelector: ".eventCost",
    timeSelector: ".eventDoorStartDate",
  },
  {
    venueName: "Kung Fu Necktie",
    url: "https://kungfunecktie.com/events/",
    showSelector: ".eventWrapper",
    titleSelector: "a#eventTitle",
    dateSelector: "#eventDate",
    priceSelector: ".eventCost",
    timeSelector: ".eventDoorStartDate",
  },
  //   {
  //     venueName: "Ortlieb's Lounge",
  //     url: "https://www.eventbrite.com/o/ortliebs-lounge-19833288947",
  //     showSelector: ".event-card-details",
  //     titleSelector: 'h3[class$="event-card"]',
  //     dateSelector: 'p[class$="event-card"]',
  //     priceSelector: ".eventCost",
  //     timeSelector: ".eventDoorStartDate",
  //   },
];

const postDB = (data) => {
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

const getTest = async (req, res) => {
  const data = await main();
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

module.exports = { getScrape, getTest };

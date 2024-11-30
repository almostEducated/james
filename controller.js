const puppeteer = require("puppeteer");
const cheerio = require("cheerio");

class VenueScraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new", // Use new Headless mode
      executablePath: "/usr/bin/chromium-browser", // Point to system Chromium
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
        "--no-first-run",
      ],
    });
  }

  async scrapeVenue(url, venueConfig) {
    console.log("scrapping", url);
    try {
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });

      // Get page content after JavaScript execution
      const content = await page.content();

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

// Example usage:
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

async function main() {
  const scraper = new VenueScraper();
  await scraper.initialize();
  const shows = await scraper.scrapeMultipleVenues(venueConfigs);

  await scraper.close();
  return shows;
}

const getScrape = async (req, res) => {
  const data = await main();
  console.log(data);
  res.json({ data: data });
};

module.exports = { getScrape };

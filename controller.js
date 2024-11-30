const puppeteer = require("puppeteer");
const cheerio = require("cheerio");

class VenueScraper {
  constructor() {
    this.browser = null;
  }

  async initialize() {
    this.browser = await puppeteer.launch({
      headless: "new", // Use new Headless mode
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
          venue: venueConfig.venueName,
          url: url,
        };

        function isShowToday(dateString) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          try {
            // console.log(dateString);
            const showDate = new Date(dateString);
            // console.log(showDate);
            showDate.setHours(0, 0, 0, 0);
            showDate.setFullYear(2024);
            return showDate.getTime() === today.getTime();
          } catch (error) {
            console.error("Error parsing date:", dateString);
            return false;
          }
        }
        if (show.title && isShowToday(show.date)) {
          shows.push(show);
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
    showSelector: ".eventMainWrapper",
    titleSelector: "a#eventTitle",
    dateSelector: ".eventDateList",
    timeSelector: ".eventDoorStartDate",
  },
  // Add more venue configs as needed
];

async function main() {
  const scraper = new VenueScraper();
  await scraper.initialize();

  const shows = await scraper.scrapeMultipleVenues(venueConfigs);
  //   console.log("All shows:", shows);

  await scraper.close();
  return shows;
}

const getScrape = async (req, res) => {
  const data = await main();
  console.log(data);
  res.json({ msg: "hello world" });
};

module.exports = { getScrape };

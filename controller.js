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
    try {
      const page = await this.browser.newPage();
      await page.goto(url, { waitUntil: "networkidle0" });

      // Get page content after JavaScript execution
      const content = await page.content();
      const $ = cheerio.load(content);

      const shows = [];

      // Use venue-specific selectors to find show information
      $(venueConfig.showSelector).each((_, element) => {
        const show = {
          title: $(element).find(venueConfig.titleSelector).text().trim(),
          date: $(element).find(venueConfig.dateSelector).text().trim(),
          time: $(element).find(venueConfig.timeSelector).text().trim(),
          venue: venueConfig.venueName,
          url: url,
        };

        // Only add if we found at least a title and date
        if (show.title && show.date) {
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
    venueName: "The Music Hall",
    url: "https://example-venue.com/shows",
    showSelector: ".event-item",
    titleSelector: ".event-title",
    dateSelector: ".event-date",
    timeSelector: ".event-time",
  },
  // Add more venue configs as needed
];

async function main() {
  const scraper = new VenueScraper();
  await scraper.initialize();

  const shows = await scraper.scrapeMultipleVenues(venueConfigs);
  console.log("All shows:", shows);

  await scraper.close();
}

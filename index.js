// TikTok TBR Backend Service
// Deploy this to Vercel, Railway, or Render

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'TikTok TBR API is running!' });
});

// Main book search endpoint
app.post('/api/book-search', async (req, res) => {
  try {
    const { title, author, tiktok_url } = req.body;
    
    if (!title) {
      return res.status(400).json({ error: 'Book title is required' });
    }

    console.log(`Searching for: ${title} by ${author}`);
    
    const bookData = {
      title: title,
      author: author || 'Unknown',
      tiktok_url: tiktok_url || '',
      pages: 'Unknown',
      description: 'No description found',
      tropes: [],
      goodreads_url: '',
      found: false
    };

    // Try to get data from Goodreads
    try {
      const goodreadsData = await searchGoodreads(title, author);
      if (goodreadsData.found) {
        Object.assign(bookData, goodreadsData);
      }
    } catch (error) {
      console.error('Goodreads search failed:', error.message);
    }

    // Try to extract info from TikTok if URL provided
    if (tiktok_url) {
      try {
        const tiktokData = await extractFromTikTok(tiktok_url);
        if (tiktokData.title && !title) {
          bookData.title = tiktokData.title;
        }
        if (tiktokData.author && !author) {
          bookData.author = tiktokData.author;
        }
      } catch (error) {
        console.error('TikTok extraction failed:', error.message);
      }
    }

    res.json(bookData);
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Search Goodreads for book information
async function searchGoodreads(title, author) {
  try {
    console.log('Searching Goodreads...');
    
    // Create search query
    const searchQuery = encodeURIComponent(`${title} ${author || ''}`).trim();
    const searchUrl = `https://www.goodreads.com/search?q=${searchQuery}`;
    
    // Use puppeteer for more reliable scraping
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2' });
    
    // Get the first search result
    const bookLink = await page.$eval('a.bookTitle', el => el.href).catch(() => null);
    
    if (!bookLink) {
      await browser.close();
      return { found: false };
    }

    // Go to the book page
    await page.goto(bookLink, { waitUntil: 'networkidle2' });
    
    // Extract book information
    const bookInfo = await page.evaluate(() => {
      const getTextContent = (selector) => {
        const element = document.querySelector(selector);
        return element ? element.textContent.trim() : null;
      };

      // Try multiple selectors for pages (Goodreads changes layout frequently)
      const pageSelectors = [
        '[data-testid="pagesFormat"]',
        '.FeaturedDetails p',
        '.BookPageMetadataSection__ratingStats + div',
        'span:contains("pages")',
        'p:contains("pages")'
      ];

      let pages = null;
      for (const selector of pageSelectors) {
        const text = getTextContent(selector);
        if (text) {
          const pageMatch = text.match(/(\d+)\s*pages?/i);
          if (pageMatch) {
            pages = pageMatch[1];
            break;
          }
        }
      }

      // Get description
      const descriptionSelectors = [
        '[data-testid="description"] .Formatted',
        '.BookPageMetadataSection__description .Formatted',
        '.DetailsLayoutRightParagraph__widthConstrained',
        '#description span'
      ];

      let description = null;
      for (const selector of descriptionSelectors) {
        description = getTextContent(selector);
        if (description && description.length > 50) break;
      }

      // Get title and author from the page
      const title = getTextContent('[data-testid="bookTitle"]') || 
                   getTextContent('h1.Text__title1') ||
                   getTextContent('.BookPageTitleSection__title h1');

      const author = getTextContent('[data-testid="name"]') ||
                    getTextContent('.ContributorLink__name') ||
                    getTextContent('.BookPageMetadataSection__contributor a');

      return {
        title,
        author,
        pages,
        description: description ? description.substring(0, 500) + '...' : null
      };
    });

    await browser.close();

    if (bookInfo.pages || bookInfo.description) {
      return {
        found: true,
        title: bookInfo.title || title,
        author: bookInfo.author || author,
        pages: bookInfo.pages || 'Unknown',
        description: bookInfo.description || 'No description found',
        goodreads_url: bookLink,
        tropes: extractTropesFromDescription(bookInfo.description || '')
      };
    }

    return { found: false };

  } catch (error) {
    console.error('Goodreads search error:', error);
    return { found: false };
  }
}

// Extract book info from TikTok (basic implementation)
async function extractFromTikTok(tiktokUrl) {
  try {
    console.log('Extracting from TikTok...');
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(tiktokUrl, { waitUntil: 'networkidle2' });
    
    // Try to extract text from the video description/caption
    const extractedText = await page.evaluate(() => {
      const selectors = [
        '[data-e2e="browse-video-desc"]',
        '[data-e2e="video-desc"]',
        '.video-meta-caption',
        '.tt-video-meta-caption'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element.textContent.trim();
        }
      }
      return null;
    });

    await browser.close();

    if (extractedText) {
      // Try to extract book title and author from the text
      const bookMatch = extractedText.match(/(?:book|read|reading)[:\s]*["""]([^"""]+)["""]?\s*by\s+([^#\n@]+)/i);
      
      if (bookMatch) {
        return {
          title: bookMatch[1].trim(),
          author: bookMatch[2].trim(),
          extracted_text: extractedText
        };
      }
    }

    return { extracted_text: extractedText };
    
  } catch (error) {
    console.error('TikTok extraction error:', error);
    return {};
  }
}

// Extract potential tropes from book description
function extractTropesFromDescription(description) {
  if (!description) return [];
  
  const commonTropes = [
    'enemies to lovers', 'friends to lovers', 'slow burn', 'instalove',
    'love triangle', 'second chance', 'fake dating', 'forced proximity',
    'workplace romance', 'forbidden love', 'age gap', 'single parent',
    'small town', 'opposites attract', 'grumpy sunshine', 'found family',
    'chosen one', 'magic school', 'vampire', 'werewolf', 'fae', 'dragon',
    'dystopian', 'fantasy', 'sci-fi', 'contemporary', 'historical',
    'dark academia', 'royal', 'mafia', 'billionaire', 'cowboy'
  ];

  const foundTropes = [];
  const lowerDesc = description.toLowerCase();

  commonTropes.forEach(trope => {
    if (lowerDesc.includes(trope.toLowerCase())) {
      foundTropes.push(trope);
    }
  });

  return foundTropes;
}

// Alternative endpoint using Google Books API (backup)
app.post('/api/google-books-search', async (req, res) => {
  try {
    const { title, author } = req.body;
    const query = encodeURIComponent(`${title} ${author || ''}`);
    
    const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=1`);
    
    if (response.data.items && response.data.items.length > 0) {
      const book = response.data.items[0].volumeInfo;
      
      res.json({
        found: true,
        title: book.title,
        author: book.authors ? book.authors.join(', ') : 'Unknown',
        pages: book.pageCount || 'Unknown',
        description: book.description || 'No description available',
        publishedDate: book.publishedDate,
        rating: book.averageRating
      });
    } else {
      res.json({ found: false });
    }
  } catch (error) {
    console.error('Google Books API error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.listen(port, () => {
  console.log(`TikTok TBR API running on port ${port}`);
});

module.exports = app;
// TikTok TBR Backend Service - Updated without Puppeteer
const express = require(‘express’);
const cors = require(‘cors’);
const cheerio = require(‘cheerio’);
const axios = require(‘axios’);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get(’/’, (req, res) => {
res.json({ status: ‘TikTok TBR API is running!’ });
});

// Main book search endpoint (using Goodreads)
app.post(’/api/book-search’, async (req, res) => {
try {
const { title, author, tiktok_url } = req.body;

```
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

res.json(bookData);
```

} catch (error) {
console.error(‘API Error:’, error);
res.status(500).json({ error: ‘Internal server error’ });
}
});

// Search Goodreads for book information (without Puppeteer)
async function searchGoodreads(title, author) {
try {
console.log(‘Searching Goodreads…’);

```
// Create search query
const searchQuery = encodeURIComponent(`${title} ${author || ''}`).trim();
const searchUrl = `https://www.goodreads.com/search?q=${searchQuery}`;

// Use axios instead of puppeteer
const response = await axios.get(searchUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
  timeout: 10000
});

const $ = cheerio.load(response.data);

// Get the first search result book link
const bookLink = $('.bookTitle').first().attr('href');

if (!bookLink) {
  console.log('No book link found in search results');
  return { found: false };
}

const fullBookUrl = `https://www.goodreads.com${bookLink}`;
console.log('Found book URL:', fullBookUrl);

// Get the book page
const bookResponse = await axios.get(fullBookUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
  },
  timeout: 10000
});

const bookPage = cheerio.load(bookResponse.data);

// Extract book information using multiple selectors (Goodreads changes layout frequently)
let pages = null;
let description = null;
let bookTitle = null;
let bookAuthor = null;

// Try multiple selectors for pages
const pageSelectors = [
  'span[itemprop="numberOfPages"]',
  '.FeaturedDetails p',
  '.BookPageMetadataSection__ratingStats + div',
  'p:contains("pages")',
  'span:contains("pages")'
];

for (const selector of pageSelectors) {
  const element = bookPage(selector);
  if (element.length > 0) {
    const text = element.text();
    const pageMatch = text.match(/(\d+)\s*pages?/i);
    if (pageMatch) {
      pages = pageMatch[1];
      break;
    }
  }
}

// Try multiple selectors for description
const descriptionSelectors = [
  '[data-testid="description"] .Formatted',
  '.BookPageMetadataSection__description .Formatted',
  '.DetailsLayoutRightParagraph__widthConstrained',
  '#description span',
  '.readable stacked'
];

for (const selector of descriptionSelectors) {
  const element = bookPage(selector);
  if (element.length > 0) {
    const text = element.text().trim();
    if (text && text.length > 50) {
      description = text.substring(0, 500) + (text.length > 500 ? '...' : '');
      break;
    }
  }
}

// Get title and author from the book page
const titleSelectors = [
  '[data-testid="bookTitle"]',
  'h1.Text__title1',
  '.BookPageTitleSection__title h1'
];

for (const selector of titleSelectors) {
  const element = bookPage(selector);
  if (element.length > 0) {
    bookTitle = element.text().trim();
    if (bookTitle) break;
  }
}

const authorSelectors = [
  '[data-testid="name"]',
  '.ContributorLink__name',
  '.BookPageMetadataSection__contributor a'
];

for (const selector of authorSelectors) {
  const element = bookPage(selector);
  if (element.length > 0) {
    bookAuthor = element.text().trim();
    if (bookAuthor) break;
  }
}

if (pages || description) {
  return {
    found: true,
    title: bookTitle || title,
    author: bookAuthor || author,
    pages: pages || 'Unknown',
    description: description || 'No description found',
    goodreads_url: fullBookUrl,
    tropes: extractTropesFromDescription(description || '')
  };
}

return { found: false };
```

} catch (error) {
console.error(‘Goodreads search error:’, error.message);
return { found: false };
}
}

// Extract potential tropes from book description
function extractTropesFromDescription(description) {
if (!description) return [];

const commonTropes = [
‘enemies to lovers’, ‘friends to lovers’, ‘slow burn’, ‘instalove’,
‘love triangle’, ‘second chance’, ‘fake dating’, ‘forced proximity’,
‘workplace romance’, ‘forbidden love’, ‘age gap’, ‘single parent’,
‘small town’, ‘opposites attract’, ‘grumpy sunshine’, ‘found family’,
‘chosen one’, ‘magic school’, ‘vampire’, ‘werewolf’, ‘fae’, ‘dragon’,
‘dystopian’, ‘fantasy’, ‘sci-fi’, ‘contemporary’, ‘historical’,
‘dark academia’, ‘royal’, ‘mafia’, ‘billionaire’, ‘cowboy’
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

// Google Books API endpoint (backup)
app.post(’/api/google-books-search’, async (req, res) => {
try {
const { title, author } = req.body;
const query = encodeURIComponent(`${title} ${author || ''}`);

```
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
    rating: book.averageRating,
    tropes: extractTropesFromDescription(book.description || '')
  });
} else {
  res.json({ found: false });
}
```

} catch (error) {
console.error(‘Google Books API error:’, error);
res.status(500).json({ error: ‘Search failed’ });
}
});

app.listen(port, () => {
console.log(`TikTok TBR API running on port ${port}`);
});

module.exports = app;

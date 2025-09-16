// TikTok TBR Backend Service - Simplified and Reliable
const express = require(‘express’);
const cors = require(‘cors’);
const axios = require(‘axios’);

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get(’/’, (req, res) => {
res.json({ status: ‘TikTok TBR API is running!’ });
});

// Main book search endpoint - uses Google Books API only
app.post(’/api/book-search’, async (req, res) => {
try {
const { title, author, tiktok_url } = req.body;

```
if (!title) {
  return res.status(400).json({ error: 'Book title is required' });
}

console.log(`Searching for: ${title} by ${author}`);

// Search using Google Books API
const query = encodeURIComponent(`${title} ${author || ''}`.trim());
const googleBooksUrl = `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`;

const response = await axios.get(googleBooksUrl, { timeout: 10000 });

if (response.data.items && response.data.items.length > 0) {
  // Find the best match (first one that has both title similarity and page count)
  let bestMatch = null;
  
  for (const item of response.data.items) {
    const book = item.volumeInfo;
    if (book.pageCount && book.description) {
      bestMatch = book;
      break;
    }
  }
  
  // If no perfect match, use the first result
  if (!bestMatch) {
    bestMatch = response.data.items[0].volumeInfo;
  }
  
  const bookData = {
    found: true,
    title: bestMatch.title || title,
    author: bestMatch.authors ? bestMatch.authors.join(', ') : (author || 'Unknown'),
    pages: bestMatch.pageCount || 'Unknown',
    description: bestMatch.description ? 
      (bestMatch.description.substring(0, 500) + (bestMatch.description.length > 500 ? '...' : '')) : 
      'No description available',
    publishedDate: bestMatch.publishedDate || 'Unknown',
    rating: bestMatch.averageRating || 'No rating',
    tiktok_url: tiktok_url || '',
    tropes: extractTropesFromDescription(bestMatch.description || ''),
    google_books_id: response.data.items[0].id
  };
  
  res.json(bookData);
} else {
  res.json({
    found: false,
    title: title,
    author: author || 'Unknown',
    pages: 'Unknown',
    description: 'Book not found in database',
    tiktok_url: tiktok_url || '',
    tropes: []
  });
}
```

} catch (error) {
console.error(‘API Error:’, error);
res.status(500).json({
error: ‘Search failed’,
found: false,
title: req.body.title || ‘’,
author: req.body.author || ‘Unknown’,
pages: ‘Unknown’,
description: ‘Search temporarily unavailable’,
tiktok_url: req.body.tiktok_url || ‘’,
tropes: []
});
}
});

// Extract potential tropes from book description
function extractTropesFromDescription(description) {
if (!description) return [];

const commonTropes = [
‘enemies to lovers’, ‘friends to lovers’, ‘slow burn’, ‘instalove’,
‘love triangle’, ‘second chance’, ‘fake dating’, ‘fake relationship’,
‘forced proximity’, ‘workplace romance’, ‘forbidden love’, ‘forbidden romance’,
‘age gap’, ‘single parent’, ‘small town’, ‘opposites attract’,
‘grumpy sunshine’, ‘sunshine x grumpy’, ‘found family’, ‘chosen one’,
‘magic school’, ‘vampire’, ‘vampires’, ‘werewolf’, ‘werewolves’,
‘fae’, ‘faeries’, ‘dragon’, ‘dragons’, ‘dystopian’, ‘fantasy’,
‘sci-fi’, ‘science fiction’, ‘contemporary’, ‘historical’, ‘historical romance’,
‘dark academia’, ‘royal’, ‘royalty’, ‘prince’, ‘princess’, ‘mafia’,
‘billionaire’, ‘cowboy’, ‘motorcycle club’, ‘biker’, ‘military’,
‘hurt comfort’, ‘hurt/comfort’, ‘touch her and die’, ‘he falls first’,
‘she falls harder’, ‘only one bed’, ‘enemies to friends to lovers’,
‘brother's best friend’, ‘best friend's brother’, ‘dad's best friend’,
‘boss’, ‘teacher’, ‘student’, ‘bodyguard’, ‘protector’
];

const foundTropes = [];
const lowerDesc = description.toLowerCase();

commonTropes.forEach(trope => {
if (lowerDesc.includes(trope.toLowerCase())) {
foundTropes.push(trope);
}
});

return foundTropes.slice(0, 5); // Limit to 5 tropes max
}

// Backup endpoint with same functionality
app.post(’/api/google-books-search’, async (req, res) => {
// Redirect to main endpoint for consistency
req.url = ‘/api/book-search’;
app._router.handle(req, res);
});

app.listen(port, () => {
console.log(`TikTok TBR API running on port ${port}`);
});

module.exports = app;

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

// CORS configuration
const corsOptions = {
    origin: ['https://wasteland-news.onrender.com', 'http://localhost:3002'],
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static('.'));

// API Keys with rotation
const NEWS_API_KEYS = [
    process.env.NEWS_API_KEY_1,
    process.env.NEWS_API_KEY_2
];
let currentKeyIndex = 0;

// Get next API key
function getNextApiKey() {
    currentKeyIndex = (currentKeyIndex + 1) % NEWS_API_KEYS.length;
    return NEWS_API_KEYS[currentKeyIndex];
}

// Get current API key
function getCurrentApiKey() {
    return NEWS_API_KEYS[currentKeyIndex];
}

// Simple in-memory cache
const cache = {
    data: {},
    timestamp: {},
    CACHE_DURATION: 15 * 60 * 1000 // 15 minutes in milliseconds
};

// Categories mapping
const CATEGORIES = {
    general: '',
    technology: 'technology',
    business: 'business',
    science: 'science',
    health: 'health',
    sports: 'sports',
    entertainment: 'entertainment',
    ai: 'artificial intelligence OR machine learning OR AI',
    space: 'space exploration OR NASA OR SpaceX OR astronomy',
    politics: 'politics OR government OR election'
};

// Get categories
app.get('/api/categories', (req, res) => {
    res.json({
        status: 'success',
        data: Object.keys(CATEGORIES)
    });
});

// Get news by category with API key rotation
app.get('/api/news/:category', async (req, res) => {
    const category = req.params.category.toLowerCase();
    let attempts = 0;
    const maxAttempts = NEWS_API_KEYS.length;

    // Check cache first
    const now = Date.now();
    if (cache.data[category] && (now - cache.timestamp[category] < cache.CACHE_DURATION)) {
        return res.json({
            status: 'success',
            data: cache.data[category]
        });
    }

    async function attemptFetch() {
        try {
            const searchQuery = CATEGORIES[category] || '';
            let url = `https://newsapi.org/v2/top-headlines?apiKey=${getCurrentApiKey()}&pageSize=30&language=en`;
            
            if (category === 'general') {
                url += '&country=us';
            } else if (['ai', 'space', 'politics'].includes(category)) {
                url = `https://newsapi.org/v2/everything?apiKey=${getCurrentApiKey()}&q=${encodeURIComponent(searchQuery)}&pageSize=30&language=en&sortBy=publishedAt`;
            } else {
                url += `&category=${category}&country=us`;
            }
            
            const response = await axios.get(url);
            const articles = response.data.articles.filter(article => 
                article.title && 
                article.description && 
                article.urlToImage &&
                !article.title.includes('[Removed]')
            );

            // Add category to each article
            const articlesWithCategory = articles.map(article => ({
                ...article,
                category
            }));

            // Update cache
            cache.data[category] = articlesWithCategory;
            cache.timestamp[category] = now;

            return articlesWithCategory;
        } catch (error) {
            console.error('Error fetching news:', error.message);
            if (error.response && error.response.status === 429) {
                if (attempts < maxAttempts - 1) {
                    attempts++;
                    console.log(`Switching to next API key, attempt ${attempts}`);
                    getNextApiKey();
                    return await attemptFetch();
                } else if (cache.data[category]) {
                    console.log('All API keys exhausted, using cached data');
                    return cache.data[category];
                }
            }
            throw error;
        }
    }

    try {
        const articles = await attemptFetch();
        res.json({
            status: 'success',
            data: articles
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch news',
            error: error.message
        });
    }
});

// Get article content
app.get('/api/article', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ 
                status: 'error', 
                message: 'URL parameter is required',
                content: null
            });
        }

        // Set a timeout and headers to look more like a browser
        const response = await axios.get(url, {
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Cache-Control': 'max-age=0'
            }
        });

        const $ = cheerio.load(response.data);
        
        // Remove unwanted elements
        $('script, style, iframe, nav, header, footer, .ad, .advertisement, .social-share').remove();
        
        // Try multiple selectors for article content
        const contentSelectors = [
            'article', '.article-content', '.article-body',
            '[role="article"]', '.post-content', '.story-content',
            'main', '#main-content', '.entry-content',
            '.article__body', '.story-body-text', '.story__content',
            '.article-text', '.article__content', '.content-article'
        ];

        let content = '';
        for (const selector of contentSelectors) {
            const element = $(selector);
            if (element.length) {
                // Get all paragraphs within this element
                const paragraphs = element.find('p')
                    .map((_, el) => $(el).text().trim())
                    .get()
                    .filter(text => text.length > 0);
                
                if (paragraphs.length > 0) {
                    content = paragraphs.join('\n\n');
                    break;
                }
            }
        }

        // If no content found, try getting all paragraphs from body
        if (!content) {
            const paragraphs = $('body p')
                .map((_, el) => $(el).text().trim())
                .get()
                .filter(text => text.length > 0);
            
            if (paragraphs.length > 0) {
                content = paragraphs.join('\n\n');
            }
        }

        // Clean up content
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\[[^\]]*\]/g, '') // Remove [...]
            .trim();

        // If still no content, provide a fallback
        if (!content) {
            return res.json({
                status: 'warning',
                message: 'Could not extract article content',
                content: 'Full article content not available. Please click "Read full article" to view on the source website.'
            });
        }

        res.json({
            status: 'success',
            content
        });
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({
            status: 'error',
            message: 'Unable to fetch article content. The source website may be blocking access.',
            content: 'This article cannot be displayed in the app. Please click "Read full article" to view it on the source website.'
        });
    }
});

async function formatArticleContent(content) {
    try {
        const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: 'mixtral-8x7b-instruct',
            messages: [{
                role: 'assistant',
                content: 'I will help format the article content into well-structured paragraphs.'
            }, {
                role: 'user',
                content: `Please format this article content into well-structured paragraphs with clear sections, identifying key quotes and important points: ${content}`
            }],
            max_tokens: 4000
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error formatting article:', error);
        return content; // Fallback to original content if formatting fails
    }
}

app.get('/article', async (req, res) => {
    try {
        const { url } = req.query;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        
        // Try multiple selectors for article content
        const selectors = [
            'article',
            '[class*="article-body"]',
            '[class*="article-content"]',
            '[class*="story-body"]',
            '.post-content',
            'main'
        ];

        let content = '';
        for (const selector of selectors) {
            const element = $(selector);
            if (element.length) {
                content = element.text().trim();
                break;
            }
        }

        if (!content) {
            // Fallback to paragraph collection
            content = $('p').map((i, el) => $(el).text().trim()).get()
                .filter(text => text.length > 100)
                .join('\n\n');
        }

        // Clean up the content
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\[.*?\]/g, '')
            .replace(/\(.*?\)/g, '')
            .trim();

        // Format the content using Perplexity API
        const formattedContent = await formatArticleContent(content);

        res.json({
            success: true,
            content: formattedContent
        });
    } catch (error) {
        console.error('Error fetching article:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

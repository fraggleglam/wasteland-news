const BASE_URL = 'http://localhost:3002/api';
let currentCategory = 'general';
let lastRefreshTime = 0;
let pullStartY = 0;
let pullMoveY = 0;
let isPulling = false;
let isRefreshing = false;
let currentArticles = [];
let searchTimeout = null;
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
let currentArticle = null;
let excludedTopics = new Set();
let filteredArticles = [];

// Category colors
const categoryColors = {
    technology: '#3b82f6',
    business: '#10b981',
    science: '#8b5cf6',
    health: '#ef4444',
    sports: '#f59e0b',
    entertainment: '#ec4899',
    general: '#6b7280',
    ai: '#6366f1',
    space: '#8b5cf6',
    politics: '#dc2626'
};

// Get category color
function getCategoryColor(category) {
    return categoryColors[category.toLowerCase()] || categoryColors.general;
}

// Initialize categories
async function initializeCategories() {
    try {
        const categoriesContainer = document.getElementById('categories-container');
        
        // Add bookmarks button first
        categoriesContainer.innerHTML = `
            <button class="category-button bookmarks-button" onclick="showBookmarks()">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                </svg>
                Bookmarks
            </button>
        `;
        
        const response = await fetch(`${BASE_URL}/categories`);
        const data = await response.json();
        
        // Add the rest of the categories
        categoriesContainer.innerHTML += data.data.map(category => `
            <button 
                class="category-button ${category === currentCategory ? 'active' : ''}" 
                data-category="${category}"
                onclick="switchCategory('${category}')"
            >
                ${category.charAt(0).toUpperCase() + category.slice(1)}
            </button>
        `).join('');
        
        // Fetch initial news
        await fetchNews(currentCategory);
    } catch (error) {
        console.error('Error initializing categories:', error);
        showError('Failed to load categories');
    }
}

// Switch category
async function switchCategory(category) {
    // Update active state of category buttons
    document.querySelectorAll('.category-button').forEach(button => {
        if (button.dataset.category === category) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    // Clear search
    const searchInput = document.getElementById('news-search');
    if (searchInput) {
        searchInput.value = '';
    }

    // Show loading state
    const newsContainer = document.getElementById('news-container');
    if (newsContainer) {
        newsContainer.innerHTML = '<div class="loading">Loading...</div>';
    }

    try {
        await fetchNews(category);
    } catch (error) {
        console.error('Error switching category:', error);
        showError('Failed to load news for this category');
    }
}

// Initialize search functionality
function initializeSearch() {
    const searchInput = document.getElementById('news-search');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const searchTerm = e.target.value.toLowerCase();
            const filteredArticles = currentArticles.filter(article => {
                const title = article.title.toLowerCase();
                const description = article.description ? article.description.toLowerCase() : '';
                return title.includes(searchTerm) || description.includes(searchTerm);
            });
            displayNews(filteredArticles);
        }, 300);
    });
}

// Fetch news
async function fetchNews(category = currentCategory, forceRefresh = false) {
    try {
        showLoading();
        const timestamp = forceRefresh ? Date.now() : null;
        const response = await fetch(`${BASE_URL}/news/${category}${timestamp ? `?t=${timestamp}` : ''}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch news');
        }

        // Store current articles for search filtering
        currentArticles = data.data;
        filteredArticles = currentArticles;
        filterArticles(); // Apply any existing filters
        
        // Sort articles by publishedAt in descending order
        const sortedArticles = [...currentArticles].sort((a, b) => 
            new Date(b.published_at) - new Date(a.published_at)
        );
        
        displayNews(sortedArticles);
    } catch (error) {
        console.error('Error fetching news:', error);
        showError(error.message);
    } finally {
        hideLoading();
    }
}

// Display news
function displayNews(articles, isSearch = false) {
    const newsContainer = document.getElementById('news-container');
    if (!newsContainer) return;

    if (articles.length === 0) {
        newsContainer.innerHTML = `
            <div class="no-results">
                <h2>No articles found</h2>
                <p>Try adjusting your search or filters</p>
            </div>
        `;
        return;
    }

    newsContainer.innerHTML = `
        <div class="news-grid">
            ${articles.map(article => {
                // Determine article category based on title and description for general view
                let articleCategory = currentCategory;
                if (currentCategory === 'general') {
                    const content = (article.title + ' ' + article.description).toLowerCase();
                    if (content.includes('technology') || content.includes('tech') || content.includes('software') || content.includes('ai') || content.includes('app')) {
                        articleCategory = 'technology';
                    } else if (content.includes('business') || content.includes('economy') || content.includes('market')) {
                        articleCategory = 'business';
                    } else if (content.includes('science') || content.includes('research') || content.includes('study')) {
                        articleCategory = 'science';
                    } else if (content.includes('health') || content.includes('medical') || content.includes('covid')) {
                        articleCategory = 'health';
                    } else if (content.includes('sports') || content.includes('game') || content.includes('tournament')) {
                        articleCategory = 'sports';
                    } else if (content.includes('entertainment') || content.includes('movie') || content.includes('music')) {
                        articleCategory = 'entertainment';
                    } else if (content.includes('artificial intelligence') || content.includes('machine learning')) {
                        articleCategory = 'ai';
                    } else if (content.includes('space') || content.includes('nasa') || content.includes('spacex')) {
                        articleCategory = 'space';
                    } else if (content.includes('politics') || content.includes('government') || content.includes('election')) {
                        articleCategory = 'politics';
                    }
                }
                
                return `
                    <div class="news-card" data-category="${articleCategory}" onclick="showArticle(${JSON.stringify(article).replace(/"/g, '&quot;')})">
                        <div class="news-image-container">
                            <img 
                                src="${article.urlToImage || 'https://placehold.co/600x400/1a1a1a/ffffff?text=News'}" 
                                alt="${article.title}"
                                class="news-image"
                                onerror="this.src='https://placehold.co/600x400/1a1a1a/ffffff?text=News'"
                            >
                            <h2 class="news-title">${article.title}</h2>
                        </div>
                        <div class="news-content">
                            <p class="news-description">${article.description || 'No description available'}</p>
                            <div class="news-footer">
                                <div class="news-meta">
                                    <span class="source">${article.source.name}</span>
                                    <span class="time">${moment(article.publishedAt).fromNow()}</span>
                                </div>
                                <button class="bookmark-button ${bookmarks.some(bookmark => bookmark.url === article.url) ? 'active' : ''}"
                                        onclick="toggleArticleBookmark(event, ${JSON.stringify(article).replace(/"/g, '&quot;')})">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// Format article content
function formatArticleContent(content) {
    if (!content) return '';

    // Split into paragraphs
    const paragraphs = content.split(/\n\n+/);
    
    // Process each paragraph
    let formattedContent = paragraphs.map((paragraph, index) => {
        // Clean up the text
        paragraph = paragraph.trim()
            .replace(/\s+/g, ' ')
            .replace(/\[\+\d+ chars\]/g, '')
            .replace(/\[\d+\]/g, ''); // Remove reference numbers

        if (!paragraph) return '';

        // Add drop cap to first paragraph
        if (index === 0) {
            const firstChar = paragraph.charAt(0);
            const rest = paragraph.slice(1);
            return `
                <p class="first-paragraph">
                    <span class="drop-cap">${firstChar}</span>${rest}
                </p>
            `;
        }

        // Check if this paragraph looks like a section header
        if (paragraph.length < 100 && paragraph.endsWith(':')) {
            return `
                <div class="section-break"></div>
                <h2 class="section-header">${paragraph}</h2>
            `;
        }

        // Check if this looks like a key quote
        if (paragraph.includes('"') && paragraph.length > 100) {
            return `<blockquote>${paragraph}</blockquote>`;
        }

        return `<p>${paragraph}</p>`;
    }).join('\n');

    return formattedContent;
}

// Show article in slide-in view
async function showArticle(article) {
    currentArticle = article;
    const articlePage = document.getElementById('article-page');
    const articleContent = document.getElementById('article-content');
    
    // Update bookmark button state
    const bookmarkButton = articlePage.querySelector('.bookmark-button');
    bookmarkButton.classList.toggle('active', isBookmarked(article));
    
    // Show loading state first
    articleContent.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading article...</div>
        </div>
    `;
    
    // Start the slide transition
    articlePage.classList.add('active');
    
    try {
        const response = await fetch(`${BASE_URL}/article?url=${encodeURIComponent(article.url)}`);
        const data = await response.json();
        
        if (data.status === 'error' || data.status === 'warning') {
            throw new Error(data.message || 'Failed to load article');
        }
        
        // Split content into paragraphs and process them
        let paragraphs = data.content.split('\n').filter(p => p.trim());
        
        // Format the content with proper styling
        let formattedContent = paragraphs.map((paragraph, index) => {
            // Clean up text
            paragraph = paragraph.trim()
                .replace(/\s+/g, ' ')
                .replace(/\[\+\d+ chars\]/g, '')
                .replace(/\[\d+\]/g, '');

            if (!paragraph) return '';

            // Format first paragraph
            if (index === 0) {
                return `<p class="lead-paragraph">${paragraph}</p>`;
            }

            // Format quotes (paragraphs with quotation marks)
            if (paragraph.includes('"') && paragraph.length > 80) {
                return `<blockquote class="article-quote">${paragraph}</blockquote>`;
            }

            // Format section headers
            if (paragraph.length < 80 && (paragraph.endsWith(':') || paragraph.toUpperCase() === paragraph)) {
                return `
                    <div class="section-divider"></div>
                    <h2 class="section-header">${paragraph}</h2>
                `;
            }

            return `<p>${paragraph}</p>`;
        }).join('');

        // Build the article HTML
        const articleHTML = `
            <article class="article-full">
                ${article.urlToImage ? `
                    <div class="article-hero">
                        <img 
                            src="${article.urlToImage}" 
                            alt="${article.title}"
                            class="article-image"
                            onerror="this.src='https://placehold.co/600x400/1a1a1a/ffffff?text=News'"
                        >
                    </div>
                ` : ''}
                
                <div class="article-content">
                    <h1 class="article-title">${article.title}</h1>
                    
                    <div class="article-meta">
                        <span class="source">${article.source.name}</span>
                        <span class="dot">·</span>
                        <span class="date">${moment(article.publishedAt).format('MMMM D, YYYY')}</span>
                        ${article.author ? `
                            <span class="dot">·</span>
                            <span class="author">By ${article.author}</span>
                        ` : ''}
                    </div>

                    <div class="article-body">
                        ${formattedContent}
                    </div>

                    <div class="article-footer">
                        <a href="${article.url}" target="_blank" class="read-more-link">
                            Read full article on ${article.source.name} →
                        </a>
                    </div>
                </div>
            </article>
        `;

        // Set the content after a small delay to ensure smooth transition
        setTimeout(() => {
            articleContent.innerHTML = articleHTML;
        }, 300);

    } catch (error) {
        const errorHTML = `
            <div class="error-container" style="text-align: center; padding: 2rem;">
                <h3 style="color: var(--text-primary); margin-bottom: 1rem;">Unable to load article</h3>
                <p style="color: var(--text-secondary); margin-bottom: 2rem;">${error.message}</p>
                <a href="${article.url}" 
                   target="_blank" 
                   class="read-more-link" 
                   style="display: inline-block; padding: 0.8rem 1.5rem; background: var(--accent-color); color: white; text-decoration: none; border-radius: 4px;">
                    Read on ${article.source.name} →
                </a>
            </div>
        `;
        
        // Set error content after transition
        setTimeout(() => {
            articleContent.innerHTML = errorHTML;
        }, 300);
    }
}

// Close article page
function closeArticlePage() {
    const articlePage = document.getElementById('article-page');
    articlePage.classList.add('closing');
    articlePage.classList.remove('active');
    
    // Reset after transition
    setTimeout(() => {
        articlePage.classList.remove('closing');
        document.getElementById('article-content').innerHTML = '';
    }, 300);
}

function isBookmarked(article) {
    return bookmarks.some(bookmark => bookmark.url === article.url);
}

// Toggle bookmark
function toggleBookmark(event) {
    if (event) {
        event.stopPropagation();
    }
    
    if (!currentArticle) return;
    
    const bookmarkButton = document.querySelector('.bookmark-button');
    const isBookmarked = bookmarks.some(bookmark => bookmark.url === currentArticle.url);
    
    if (isBookmarked) {
        bookmarks = bookmarks.filter(bookmark => bookmark.url !== currentArticle.url);
        bookmarkButton.classList.remove('active');
    } else {
        bookmarks.push(currentArticle);
        bookmarkButton.classList.add('active');
    }
    
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
}

// Toggle article bookmark
function toggleArticleBookmark(event, article) {
    event.stopPropagation();
    currentArticle = article;
    toggleBookmark();
    
    // Update the bookmark icon in the news grid
    const bookmarkButton = event.currentTarget;
    const isBookmarked = bookmarks.some(bookmark => bookmark.url === article.url);
    bookmarkButton.classList.toggle('active', isBookmarked);
}

// Show bookmarks
function showBookmarks() {
    // Clear search when showing bookmarks
    document.getElementById('news-search').value = '';
    
    // Update active state of category buttons
    document.querySelectorAll('.category-button').forEach(button => {
        button.classList.remove('active');
    });
    document.querySelector('.bookmarks-button').classList.add('active');
    
    if (bookmarks.length === 0) {
        document.getElementById('news-container').innerHTML = `
            <div class="no-results">
                <p>No bookmarked articles yet.</p>
                <p class="hint">Click the bookmark icon on any article to save it for later.</p>
            </div>
        `;
        return;
    }
    
    displayNews(bookmarks, false, true);
}

// Initialize smooth scrolling and touch handling
function initializeScrolling() {
    const container = document.querySelector('.news-container');
    if (!container) return;

    let startY = 0;
    let startScrollTop = 0;
    let refreshThreshold = 100;
    let isRefreshing = false;

    container.addEventListener('touchstart', (e) => {
        startY = e.touches[0].pageY;
        startScrollTop = container.scrollTop;
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (isRefreshing) return;

        const y = e.touches[0].pageY;
        const delta = y - startY;

        // Only handle pull-to-refresh when at the top
        if (container.scrollTop === 0 && delta > 0) {
            if (delta > refreshThreshold && !isRefreshing) {
                isRefreshing = true;
                fetchNews(currentCategory, true).finally(() => {
                    isRefreshing = false;
                });
            }
        }
    }, { passive: true });

    // Enable smooth scrolling
    container.style.scrollBehavior = 'smooth';
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeCategories();
        initializeSearch();
        initializeScrolling();
        await fetchNews('general');
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the app');
    }
});

// Add swipe back gesture
let touchStartX = 0;
const articlePage = document.getElementById('article-page');

articlePage.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
});

articlePage.addEventListener('touchmove', (e) => {
    const touchX = e.touches[0].clientX;
    const diff = touchX - touchStartX;
    
    if (diff > 0) { // Only allow right swipe
        articlePage.style.transform = `translateX(${diff}px)`;
        e.preventDefault();
    }
});

articlePage.addEventListener('touchend', (e) => {
    const touchX = e.changedTouches[0].clientX;
    const diff = touchX - touchStartX;
    
    if (diff > 100) { // If swiped more than 100px
        closeArticlePage();
    } else {
        articlePage.style.transform = '';
    }
});

// Add pull-to-refresh functionality
function initPullToRefresh() {
    const container = document.querySelector('.container');
    const pullToRefresh = document.querySelector('.pull-to-refresh');

    container.addEventListener('touchstart', (e) => {
        if (window.scrollY === 0) {
            isPulling = true;
            pullStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!isPulling) return;
        
        pullMoveY = e.touches[0].clientY - pullStartY;
        if (pullMoveY > 0 && window.scrollY === 0) {
            container.style.transform = `translateY(${Math.min(pullMoveY * 0.4, 80)}px)`;
            pullToRefresh.style.transform = `translateY(${Math.min(pullMoveY * 0.4, 80)}px)`;
        }
    }, { passive: true });

    container.addEventListener('touchend', async () => {
        if (!isPulling) return;
        
        isPulling = false;
        if (pullMoveY > 60) {
            // Trigger refresh
            isRefreshing = true;
            pullToRefresh.classList.add('refreshing');
            container.style.transform = 'translateY(50px)';
            
            // Only refresh if it's been more than 30 seconds since last refresh
            if (Date.now() - lastRefreshTime > 30000) {
                await fetchNews(currentCategory, true);
                lastRefreshTime = Date.now();
            }
            
            setTimeout(() => {
                container.style.transform = '';
                pullToRefresh.style.transform = '';
                pullToRefresh.classList.remove('refreshing');
                isRefreshing = false;
            }, 1000);
        } else {
            container.style.transform = '';
            pullToRefresh.style.transform = '';
        }
        pullMoveY = 0;
    });
}

// Loading state management
function showLoading() {
    const newsContainer = document.getElementById('news-container');
    const errorElement = document.getElementById('error');
    
    // Clear previous content and show loading
    newsContainer.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <div class="loading-text">Loading news...</div>
        </div>
    `;
    errorElement.style.display = 'none';
}

function hideLoading() {
    const loadingContainer = document.querySelector('.loading-container');
    if (loadingContainer) {
        loadingContainer.remove();
    }
}

function showError(message) {
    const errorElement = document.getElementById('error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

// Add filter button click handler
document.getElementById('filter-button').addEventListener('click', () => {
    const dropdown = document.getElementById('filter-dropdown');
    dropdown.classList.toggle('active');
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('filter-dropdown');
    const filterButton = document.getElementById('filter-button');
    if (!dropdown.contains(e.target) && !filterButton.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// Handle filter input
document.getElementById('filter-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
        const topic = e.target.value.trim().toLowerCase();
        addFilter(topic);
        e.target.value = '';
    }
});

function addFilter(topic) {
    if (excludedTopics.has(topic)) return;
    
    excludedTopics.add(topic);
    updateFilterTags();
    filterArticles();
}

function removeFilter(topic) {
    excludedTopics.delete(topic);
    updateFilterTags();
    filterArticles();
}

function updateFilterTags() {
    const container = document.getElementById('filter-tags');
    container.innerHTML = '';
    
    excludedTopics.forEach(topic => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        tag.innerHTML = `
            <span>${topic}</span>
            <span class="remove" onclick="removeFilter('${topic}')">×</span>
        `;
        container.appendChild(tag);
    });
}

async function filterArticles() {
    if (!currentArticles.length) return;
    
    // If no filters, show all articles
    if (excludedTopics.size === 0) {
        filteredArticles = currentArticles;
        displayNews(filteredArticles);
        return;
    }
    
    // Use Perplexity API to check content relevance
    try {
        const articles = await Promise.all(currentArticles.map(async (article) => {
            const text = `${article.title} ${article.description}`.toLowerCase();
            
            // First do a simple text match
            for (const topic of excludedTopics) {
                if (text.includes(topic.toLowerCase())) {
                    return null;
                }
            }
            
            // If article passes simple filter, it's included
            return article;
        }));
        
        filteredArticles = articles.filter(article => article !== null);
        displayNews(filteredArticles);
    } catch (error) {
        console.error('Error filtering articles:', error);
    }
}

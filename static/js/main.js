document.addEventListener('DOMContentLoaded', () => {
    // API State
    let releaseNotesData = [];
    let activeFilter = 'all';
    let searchQuery = '';
    let selectedUpdateId = null;

    // DOM Elements
    const btnRefresh = document.getElementById('btn-refresh');
    const statusText = document.getElementById('status-text');
    const statusDot = document.querySelector('.status-dot');
    const lastUpdatedDisplay = document.getElementById('last-updated-display');
    const notificationBanner = document.getElementById('notification-banner');
    const notificationMessage = document.getElementById('notification-message');
    const btnNotificationClose = document.getElementById('btn-notification-close');
    const searchInput = document.getElementById('search-input');
    const filterContainer = document.getElementById('filter-container');
    const feedContainer = document.getElementById('feed-container');
    const feedList = document.getElementById('feed-list');
    const shimmerContainer = document.getElementById('shimmer-container');
    const emptyState = document.getElementById('empty-state');
    const btnResetFilters = document.getElementById('btn-reset-filters');

    // Composer Elements
    const tweetTextarea = document.getElementById('tweet-textarea');
    const charCount = document.getElementById('char-count');
    const charLimitWarning = document.getElementById('char-limit-warning');
    const progressCircle = document.getElementById('progress-circle');
    const btnClearComposer = document.getElementById('btn-clear-composer');
    const hashtagPillsContainer = document.getElementById('hashtag-pills-container');
    const btnCopyTweet = document.getElementById('btn-copy-tweet');
    const btnTweetNow = document.getElementById('btn-tweet-now');
    const tweetPreviewText = document.getElementById('tweet-preview-text');

    // Progress circle math
    const radius = progressCircle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
    progressCircle.style.strokeDashoffset = circumference;

    // Initialize Lucide Icons
    lucide.createIcons();

    // ----------------------------------------------------
    // API Fetch & Refresh
    // ----------------------------------------------------
    async function fetchReleaseNotes(forceRefresh = false) {
        setLoadingState(true);
        hideNotification();
        
        try {
            const response = await fetch(`/api/release-notes?refresh=${forceRefresh}`);
            const data = await response.json();
            
            if (data.status === 'success' || (data.entries && data.entries.length > 0)) {
                releaseNotesData = data.entries;
                
                // Update header info
                updateStatus(true);
                if (data.last_fetched) {
                    const date = new Date(data.last_fetched);
                    lastUpdatedDisplay.textContent = `Last checked: ${date.toLocaleTimeString()}`;
                }
                
                // Handle warning (e.g. stale cache returned due to network error)
                if (data.error) {
                    showNotification(data.error, 'warning');
                    updateStatus(true, 'Warning');
                }
                
                renderFeed();
            } else {
                throw new Error(data.error || 'Failed to fetch release notes');
            }
        } catch (error) {
            console.error('Error fetching release notes:', error);
            showNotification(error.message, 'error');
            updateStatus(false);
            
            // Show empty state if we have no data at all
            if (releaseNotesData.length === 0) {
                showEmptyState(true);
            }
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            btnRefresh.classList.add('spinning');
            btnRefresh.disabled = true;
            shimmerContainer.classList.remove('hidden');
            feedList.classList.add('hidden');
            emptyState.classList.add('hidden');
        } else {
            btnRefresh.classList.remove('spinning');
            btnRefresh.disabled = false;
            shimmerContainer.classList.add('hidden');
            feedList.classList.remove('hidden');
        }
    }

    function updateStatus(isOnline, customText = null) {
        if (isOnline) {
            statusDot.className = 'status-dot green';
            statusText.textContent = customText || 'Connected';
        } else {
            statusDot.className = 'status-dot red';
            statusText.textContent = 'Disconnected';
        }
    }

    function showNotification(message, type = 'error') {
        notificationMessage.textContent = message;
        notificationBanner.className = 'notification-banner';
        if (type === 'warning') {
            notificationBanner.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
            notificationBanner.style.borderColor = 'rgba(245, 158, 11, 0.3)';
            notificationBanner.style.color = '#fde68a';
        } else {
            notificationBanner.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
            notificationBanner.style.borderColor = 'rgba(239, 68, 68, 0.3)';
            notificationBanner.style.color = '#fca5a5';
        }
        notificationBanner.classList.remove('hidden');
    }

    function hideNotification() {
        notificationBanner.classList.add('hidden');
    }

    // ----------------------------------------------------
    // Feed Rendering & Filtering
    // ----------------------------------------------------
    function renderFeed() {
        feedList.innerHTML = '';
        
        let visibleCount = 0;

        releaseNotesData.forEach((entry, entryIndex) => {
            // Filter the updates inside this entry
            const filteredUpdates = entry.updates.filter(update => {
                // Type Filter
                const matchesType = activeFilter === 'all' || 
                    update.type.toLowerCase() === activeFilter;
                
                // Search Filter
                const matchesSearch = !searchQuery || 
                    entry.date.toLowerCase().includes(searchQuery) ||
                    update.type.toLowerCase().includes(searchQuery) ||
                    update.text_content.toLowerCase().includes(searchQuery);
                
                return matchesType && matchesSearch;
            });

            if (filteredUpdates.length > 0) {
                visibleCount += filteredUpdates.length;

                // Create date group
                const dateGroup = document.createElement('div');
                dateGroup.className = 'date-group animate-fade-in';
                dateGroup.style.animationDelay = `${entryIndex * 0.05}s`;

                // Header
                const dateHeader = document.createElement('div');
                dateHeader.className = 'date-group-header';
                dateHeader.innerHTML = `
                    <span class="date-title">${entry.formatted_date || entry.date}</span>
                    <div class="date-divider"></div>
                `;
                dateGroup.appendChild(dateHeader);

                // Add updates
                filteredUpdates.forEach((update, updateIndex) => {
                    const updateId = `${entry.id}-${updateIndex}`;
                    const isSelected = selectedUpdateId === updateId;

                    const card = document.createElement('div');
                    card.className = `update-card ${isSelected ? 'selected' : ''}`;
                    card.setAttribute('data-id', updateId);
                    card.setAttribute('data-type', update.type);
                    
                    // Escape single quotes for data attributes to avoid breaking JSON/strings
                    const safeText = update.text_content.replace(/"/g, '&quot;');
                    const safeLink = entry.link;
                    const safeDate = entry.formatted_date || entry.date;
                    
                    card.setAttribute('data-text', safeText);
                    card.setAttribute('data-link', safeLink);
                    card.setAttribute('data-date', safeDate);

                    card.innerHTML = `
                        <div class="update-card-header">
                            <div class="update-meta">
                                <span class="badge badge-type ${update.type.toLowerCase()}">${update.type}</span>
                            </div>
                            <div class="update-card-select-indicator">
                                <i data-lucide="check"></i>
                            </div>
                        </div>
                        <div class="update-card-body">
                            ${update.html_content}
                        </div>
                    `;

                    // Card Click Listener
                    card.addEventListener('click', (e) => {
                        // Prevent selection toggling if user clicks links inside card body
                        if (e.target.tagName === 'A') return;
                        
                        selectUpdate(card);
                    });

                    dateGroup.appendChild(card);
                });

                feedList.appendChild(dateGroup);
            }
        });

        // Update Icons
        lucide.createIcons();

        // Show empty state if no matching notes
        showEmptyState(visibleCount === 0);
    }

    function showEmptyState(show) {
        if (show) {
            emptyState.classList.remove('hidden');
            feedList.classList.add('hidden');
        } else {
            emptyState.classList.add('hidden');
            feedList.classList.remove('hidden');
        }
    }

    function selectUpdate(cardElement) {
        const updateId = cardElement.getAttribute('data-id');
        
        // Remove previous selected
        document.querySelectorAll('.update-card').forEach(card => {
            card.classList.remove('selected');
        });

        if (selectedUpdateId === updateId) {
            // Toggle off
            selectedUpdateId = null;
            clearComposer();
        } else {
            // Toggle on
            selectedUpdateId = updateId;
            cardElement.classList.add('selected');
            
            const type = cardElement.getAttribute('data-type');
            const text = cardElement.getAttribute('data-text');
            const link = cardElement.getAttribute('data-link');
            const date = cardElement.getAttribute('data-date');
            
            // Build draft tweet template
            draftTweet(type, text, link, date);
        }
    }

    // ----------------------------------------------------
    // Tweet Composer & Live Preview
    // ----------------------------------------------------
    function draftTweet(type, text, link, date) {
        // Compose clean text
        // Format: [Type] text - Date. Details: link
        let categoryEmoji = '🚀';
        if (type.toLowerCase() === 'issue') categoryEmoji = '⚠️';
        if (type.toLowerCase() === 'deprecated') categoryEmoji = '🛑';
        if (type.toLowerCase() === 'changed') categoryEmoji = '🔄';
        if (type.toLowerCase() === 'notice') categoryEmoji = '📢';

        // Truncate text if it is extremely long to fit nicely within Twitter limits
        let cleanText = text;
        const baseLength = `BigQuery Update (${date}):\n\n${categoryEmoji} [${type}] \n\nDetails: ${link}\n\n#BigQuery`.length;
        const maxTweetLen = 280;
        
        if (cleanText.length + baseLength > maxTweetLen) {
            const availableSpace = maxTweetLen - baseLength - 4; // -4 for "..."
            if (availableSpace > 10) {
                cleanText = cleanText.substring(0, availableSpace) + '...';
            }
        }

        const tweetContent = `BigQuery Update (${date}):\n\n${categoryEmoji} [${type}] ${cleanText}\n\nDetails: ${link}`;
        
        tweetTextarea.value = tweetContent;
        updateComposerUI();
    }

    function updateComposerUI() {
        const text = tweetTextarea.value;
        const length = text.length;
        const limit = 280;
        const remaining = limit - length;

        // Update Count Display
        charCount.textContent = Math.abs(remaining);
        
        // Progress Circle Math
        const percentage = Math.min((length / limit) * 100, 100);
        const offset = circumference - (percentage / 100) * circumference;
        progressCircle.style.strokeDashoffset = offset;

        // Styling status based on remaining chars
        if (remaining < 0) {
            progressCircle.style.stroke = '#ef4444'; // Red
            charCount.style.color = '#ef4444';
            charLimitWarning.textContent = 'Over limit';
            charLimitWarning.style.color = '#ef4444';
            btnTweetNow.disabled = true;
            btnTweetNow.style.opacity = '0.5';
            btnTweetNow.style.cursor = 'not-allowed';
        } else if (remaining <= 20) {
            progressCircle.style.stroke = '#f59e0b'; // Yellow
            charCount.style.color = '#f59e0b';
            charLimitWarning.textContent = 'Almost full';
            charLimitWarning.style.color = '#f59e0b';
            btnTweetNow.disabled = false;
            btnTweetNow.style.opacity = '1';
            btnTweetNow.style.cursor = 'pointer';
        } else {
            progressCircle.style.stroke = '#1d9bf0'; // Twitter Blue
            charCount.style.color = '#f3f4f6';
            charLimitWarning.textContent = 'Remaining';
            charLimitWarning.style.color = 'var(--text-muted)';
            btnTweetNow.disabled = false;
            btnTweetNow.style.opacity = '1';
            btnTweetNow.style.cursor = 'pointer';
        }

        // Update Live Twitter Preview Card
        if (length === 0) {
            tweetPreviewText.innerHTML = `<span style="color: var(--text-muted);">Select a release note to draft your post. The live preview will appear here.</span>`;
        } else {
            // Replace URLs with clickable anchors for preview look
            const urlPattern = /(https?:\/\/[^\s]+)/g;
            const highlightedText = text.replace(urlPattern, '<span style="color: var(--brand-twitter);">$1</span>')
                                        .replace(/(#\w+)/g, '<span style="color: var(--brand-twitter);">$1</span>');
            tweetPreviewText.innerHTML = highlightedText;
        }

        // Sync hashtag active state pills
        updateHashtagPillStates(text);
    }

    function updateHashtagPillStates(tweetText) {
        document.querySelectorAll('.badge-hashtag').forEach(pill => {
            const hashtag = pill.getAttribute('data-hashtag');
            // Check if hashtag exists as a standalone word/tag in text
            const regex = new RegExp(`${hashtag}\\b`, 'i');
            if (regex.test(tweetText)) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
    }

    function toggleHashtag(hashtag) {
        let text = tweetTextarea.value.trim();
        const regex = new RegExp(`\\s*${hashtag}\\b`, 'gi');

        if (regex.test(text)) {
            // Remove hashtag and fix double spacing
            text = text.replace(regex, '').trim();
        } else {
            // Append hashtag
            text = text ? `${text} ${hashtag}` : hashtag;
        }

        tweetTextarea.value = text;
        updateComposerUI();
    }

    function clearComposer() {
        tweetTextarea.value = '';
        selectedUpdateId = null;
        document.querySelectorAll('.update-card').forEach(card => {
            card.classList.remove('selected');
        });
        updateComposerUI();
    }

    // ----------------------------------------------------
    // Event Listeners
    // ----------------------------------------------------
    btnRefresh.addEventListener('click', () => {
        fetchReleaseNotes(true);
    });

    btnNotificationClose.addEventListener('click', hideNotification);

    // Filter Badges
    filterContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.badge-filter');
        if (!button) return;

        // Toggle Active
        document.querySelectorAll('.badge-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        button.classList.add('active');

        activeFilter = button.getAttribute('data-type').toLowerCase();
        renderFeed();
    });

    // Search Input
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderFeed();
    });

    // Reset Filters Button (inside empty state)
    btnResetFilters.addEventListener('click', () => {
        searchInput.value = '';
        searchQuery = '';
        
        document.querySelectorAll('.badge-filter').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector('.badge-filter[data-type="all"]').classList.add('active');
        activeFilter = 'all';

        renderFeed();
    });

    // Textarea Changes
    tweetTextarea.addEventListener('input', updateComposerUI);

    // Clear Composer Button
    btnClearComposer.addEventListener('click', clearComposer);

    // Hashtag Pills Selection
    hashtagPillsContainer.addEventListener('click', (e) => {
        const pill = e.target.closest('.badge-hashtag');
        if (!pill) return;
        const hashtag = pill.getAttribute('data-hashtag');
        toggleHashtag(hashtag);
    });

    // Copy to Clipboard
    btnCopyTweet.addEventListener('click', async () => {
        const text = tweetTextarea.value;
        if (!text) return;

        try {
            await navigator.clipboard.writeText(text);
            
            // Visual feedback
            const copyIcon = btnCopyTweet.querySelector('i');
            const copyText = btnCopyTweet.querySelector('span');
            
            btnCopyTweet.style.borderColor = '#10b981';
            btnCopyTweet.style.color = '#10b981';
            copyText.textContent = 'Copied!';
            
            setTimeout(() => {
                btnCopyTweet.style.borderColor = '';
                btnCopyTweet.style.color = '';
                copyText.textContent = 'Copy Text';
            }, 2000);
        } catch (err) {
            console.error('Clipboard copy failed:', err);
            alert('Failed to copy to clipboard.');
        }
    });

    // Tweet Now Button
    btnTweetNow.addEventListener('click', () => {
        const text = tweetTextarea.value;
        if (!text) return;

        const encodedText = encodeURIComponent(text);
        const twitterIntentUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
        window.open(twitterIntentUrl, '_blank');
    });

    // Fetch initial notes
    fetchReleaseNotes(false);
});

// Package core/searcher.go
// Implements a three-tier YouTube search:
//  1. chromedp (headless Chromium) — primary
//  2. yt-dlp  — fallback if chromedp fails
//  3. iTunes preview API — last-resort for metadata
package core

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"ares-backend/internal/models"

	"github.com/chromedp/chromedp"
	"github.com/google/uuid"
)

// ─── Public entry point ───────────────────────────────────────────────────────

// SearchYouTube searches YouTube using a priority chain:
// chromedp → yt-dlp → iTunes fallback.
func SearchYouTube(query string, searchType string) []models.SearchResult {
	// If query is a YouTube search URL, extract the actual query parameter
	if strings.Contains(query, "youtube.com/results") {
		if u, err := url.Parse(query); err == nil {
			if sq := u.Query().Get("search_query"); sq != "" {
				query = sq
			}
		}
	}

	if searchType == "playlist" {
		if !strings.Contains(strings.ToLower(query), "playlist") {
			query = query + " playlist"
		}
	} else if searchType == "audiobook" {
		if !strings.Contains(strings.ToLower(query), "audiobook") && !strings.Contains(strings.ToLower(query), "audiolivro") {
			query = query + " audiobook"
		}
	}
	log.Printf("[search] Query: %q (type: %s)", query, searchType)

	// 1. Try chromedp (headless browser) with filter
	results, err := searchWithChromedp(query, searchType, true)
	if err == nil && len(results) > 0 {
		log.Printf("[search] chromedp returned %d results", len(results))
		return results
	}
	log.Printf("[search] chromedp with filter failed/empty (%v). Retrying without filter.", err)

	// Retry without filter
	results, err = searchWithChromedp(query, searchType, false)
	if err == nil && len(results) > 0 {
		log.Printf("[search] chromedp (no filter) returned %d results", len(results))
		return results
	}
	log.Printf("[search] chromedp (no filter) failed/empty (%v), trying yt-dlp", err)

	// 2. Try yt-dlp
	results, err = searchWithYtDlp(query, searchType)
	if err == nil && len(results) > 0 {
		log.Printf("[search] yt-dlp returned %d results", len(results))
		return results
	}
	log.Printf("[search] yt-dlp failed (%v), falling back to iTunes", err)

	// 3. iTunes last resort
	return searchItunes(query)
}

// ─── Tier 1: chromedp ─────────────────────────────────────────────────────────

func searchWithChromedp(query string, searchType string, useFilter bool) ([]models.SearchResult, error) {
	opts := []chromedp.ExecAllocatorOption{
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Headless,
		chromedp.DisableGPU,
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("disable-extensions", true),
		chromedp.Flag("mute-audio", true),
	}

	// Allow overriding Chrome binary path via env
	if chromePath := os.Getenv("CHROME_BIN"); chromePath != "" {
		opts = append(opts, chromedp.ExecPath(chromePath))
	}

	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	ctx, cancel2 := chromedp.NewContext(allocCtx)
	defer cancel2()

	timeoutCtx, cancel3 := context.WithTimeout(ctx, 25*time.Second)
	defer cancel3()

	searchURL := fmt.Sprintf("https://www.youtube.com/results?search_query=%s", url.QueryEscape(query))
	if searchType == "playlist" && useFilter {
		searchURL += "&sp=EgIQAw==" // Filter by Playlist
	}

	// Selectors for YouTube search result items
	type ytItem struct {
		Title     string
		URL       string
		Channel   string
		Duration  string
		Thumbnail string
	}

	var rawItems []ytItem

	// JavaScript to extract data from YouTube search results (handles both videos and playlists)
	script := `
	(function() {
		const items = [];
		const isPlaylistSearch = window.location.href.includes('sp=EgIQAw');
		
		const renderers = document.querySelectorAll('ytd-video-renderer, ytd-playlist-renderer, yt-lockup-view-model');
		
		renderers.forEach((r) => {
			if (items.length >= 15) return;
			
			const tagName = r.tagName.toLowerCase();
			let url = '';
			let title = '';
			let channel = '';
			let thumbnail = '';
			let duration = '';
			let isPlaylist = false;
			
			if (tagName === 'yt-lockup-view-model') {
				const metadataEl = r.querySelector('yt-lockup-metadata-view-model');
				const linkEl = metadataEl ? metadataEl.querySelector('a') : r.querySelector('h3 a');
				if (!linkEl) return;
				
				isPlaylist = (linkEl.getAttribute('href') || '').includes('list=');
				
				if (isPlaylistSearch !== isPlaylist) return;
				
				const aEl = r.querySelector('a.yt-core-image--loaded, a[href]');
				url = aEl ? ('https://www.youtube.com' + (aEl.getAttribute('href') || '')) : '';
				
				if (isPlaylist && url.includes('list=')) {
					try {
						const urlObj = new URL(url);
						const listId = urlObj.searchParams.get('list');
						if (listId) {
							url = 'https://www.youtube.com/playlist?list=' + listId;
						}
					} catch(e) {}
				}
				
				title = linkEl.textContent.trim();
				
				const channelEl = r.querySelector('a[href*="/channel/"], a[href*="/@"]');
				channel = channelEl ? channelEl.textContent.trim() : '';
				
				const imgEl = r.querySelector('img');
				thumbnail = imgEl ? (imgEl.getAttribute('src') || imgEl.getAttribute('data-thumb') || '') : '';
				
				if (isPlaylist) {
					const badgeEl = r.querySelector('yt-thumbnail-overlay-badge-view-model, badge-shape');
					duration = badgeEl ? badgeEl.textContent.trim() : 'Playlist';
				} else {
					const durEl = r.querySelector('yt-thumbnail-overlay-time-status-renderer, span.ytd-thumbnail-overlay-time-status-renderer');
					duration = durEl ? durEl.textContent.trim() : '';
				}
			} else {
				isPlaylist = (tagName === 'ytd-playlist-renderer');
				if (isPlaylistSearch !== isPlaylist) return;
				
				const titleEl = r.querySelector('#video-title');
				if (!titleEl) return;
				
				title = titleEl.textContent.trim();
				url = 'https://www.youtube.com' + (titleEl.getAttribute('href') || '');
				
				if (isPlaylist && url.includes('list=')) {
					try {
						const urlObj = new URL(url);
						const listId = urlObj.searchParams.get('list');
						if (listId) {
							url = 'https://www.youtube.com/playlist?list=' + listId;
						}
					} catch(e) {}
				}
				
				const channelEl = r.querySelector('#channel-name a, .ytd-channel-name a');
				channel = channelEl ? channelEl.textContent.trim() : '';
				
				const thumbEl = r.querySelector('ytd-thumbnail img, ytd-playlist-thumbnail img');
				thumbnail = thumbEl ? (thumbEl.getAttribute('src') || thumbEl.getAttribute('data-thumb') || '') : '';
				
				if (!isPlaylist) {
					const durEl = r.querySelector('ytd-thumbnail-overlay-time-status-renderer span');
					duration = durEl ? durEl.textContent.trim() : '';
				} else {
					const countEl = r.querySelector('ytd-thumbnail-overlay-side-panel-renderer span');
					duration = countEl ? countEl.textContent.trim() : 'Playlist';
				}
			}
			
			items.push({
				title:     title,
				url:       url,
				channel:   channel,
				duration:  duration,
				thumbnail: thumbnail
			});
		});
		
		return JSON.stringify(items);
	})()
	`
	isPlaylistSearchStr := "false"
	if searchType == "playlist" {
		isPlaylistSearchStr = "true"
	}
	script = strings.ReplaceAll(script, "window.location.href.includes('sp=EgIQAw')", isPlaylistSearchStr)

	var resultJSON string
	var finalURL string
	var pageTitle string
	var htmlContent string

	log.Printf("[search] Navigating to: %s", searchURL)
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(searchURL),
		chromedp.Location(&finalURL),
		chromedp.Title(&pageTitle),
	)
	if err != nil {
		log.Printf("[search] chromedp navigation failed: %v", err)
		return nil, err
	}
	log.Printf("[search] Landed on URL: %s, Title: %q", finalURL, pageTitle)

	// Wait for renderer elements (handles legacy Polymer elements, new Lit view models, or main content wrapper)
	targetSelector := "ytd-video-renderer, ytd-playlist-renderer, yt-lockup-view-model, #content"
	err = chromedp.Run(timeoutCtx,
		chromedp.WaitVisible(targetSelector, chromedp.ByQuery),
	)
	if err != nil {
		var debugCtx context.Context
		var debugCancel context.CancelFunc
		debugCtx, debugCancel = context.WithTimeout(ctx, 5*time.Second)
		_ = chromedp.Run(debugCtx, chromedp.OuterHTML("html", &htmlContent))
		debugCancel()

		limit := 1000
		if len(htmlContent) < limit {
			limit = len(htmlContent)
		}
		log.Printf("[search] WaitVisible failed. Page HTML snippet: %s", htmlContent[:limit])
		return nil, fmt.Errorf("wait visible: %w", err)
	}

	err = chromedp.Run(timeoutCtx,
		chromedp.EvaluateAsDevTools(script, &resultJSON),
	)
	if err != nil {
		return nil, fmt.Errorf("chromedp run script: %w", err)
	}

	if err := json.Unmarshal([]byte(resultJSON), &rawItems); err != nil {
		return nil, fmt.Errorf("chromedp unmarshal: %w", err)
	}

	var results []models.SearchResult
	for _, item := range rawItems {
		if item.URL == "" || item.Title == "" {
			continue
		}
		artist, song := splitArtistTitle(item.Title)
		if item.Channel != "" && artist == "" {
			artist = item.Channel
		}
		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        song,
			Artist:       artist,
			ThumbnailURL: item.Thumbnail,
			Duration:     parseDurationStr(item.Duration),
			SourceURL:    item.URL,
			FileSize:     "~4-8 MB",
		})
	}

	return results, nil
}

// ─── Tier 2: yt-dlp ──────────────────────────────────────────────────────────

type ytDlpEntry struct {
	ID        string  `json:"id"`
	Title     string  `json:"title"`
	Uploader  string  `json:"uploader"`
	Channel   string  `json:"channel"`
	Duration  float64 `json:"duration"`
	Thumbnail string  `json:"thumbnail"`
	WebpageURL string `json:"webpage_url"`
}

func searchWithYtDlp(query string, searchType string) ([]models.SearchResult, error) {
	prefix := "ytsearch12"
	if searchType == "playlist" {
		prefix = "ytsearchplaylist12"
	}
	target := fmt.Sprintf("%s:%s", prefix, query)
	cmd := exec.Command("yt-dlp",
		target,
		"--dump-json",
		"--no-download",
		"--flat-playlist",
		"--skip-download",
		"--quiet",
		"--no-warnings",
		"--socket-timeout", "20",
	)
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return nil, fmt.Errorf("yt-dlp: %w", err)
	}

	var results []models.SearchResult
	dec := json.NewDecoder(strings.NewReader(string(out)))
	for dec.More() {
		var e ytDlpEntry
		if err := dec.Decode(&e); err != nil {
			continue
		}
		ch := e.Channel
		if ch == "" {
			ch = e.Uploader
		}
		artist, song := splitArtistTitle(e.Title)
		if ch != "" && artist == "" {
			artist = ch
		}
		
		urlStr := e.WebpageURL
		if urlStr == "" && e.ID != "" {
			if searchType == "playlist" {
				urlStr = "https://www.youtube.com/playlist?list=" + e.ID
			} else {
				urlStr = "https://www.youtube.com/watch?v=" + e.ID
			}
		}
		
		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        song,
			Artist:       artist,
			ThumbnailURL: e.Thumbnail,
			Duration:     int(e.Duration),
			SourceURL:    urlStr,
			FileSize:     "~4-8 MB",
		})
	}
	return results, nil
}

// ─── Tier 3: iTunes fallback ─────────────────────────────────────────────────

type itunesResp struct {
	Results []struct {
		TrackName       string `json:"trackName"`
		ArtistName      string `json:"artistName"`
		PreviewURL      string `json:"previewUrl"`
		TrackTimeMillis int    `json:"trackTimeMillis"`
		ArtworkURL60    string `json:"artworkUrl60"`
	} `json:"results"`
}

func searchItunes(query string) []models.SearchResult {
	apiURL := fmt.Sprintf(
		"https://itunes.apple.com/search?term=%s&media=music&entity=song&limit=15",
		url.QueryEscape(query),
	)
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var ir itunesResp
	if err := json.NewDecoder(resp.Body).Decode(&ir); err != nil {
		return nil
	}

	var results []models.SearchResult
	for _, t := range ir.Results {
		if t.PreviewURL == "" {
			continue
		}
		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        t.TrackName,
			Artist:       t.ArtistName,
			ThumbnailURL: t.ArtworkURL60,
			Duration:     t.TrackTimeMillis / 1000,
			SourceURL:    t.PreviewURL,
			FileSize:     "~1.5 MB",
		})
	}
	return results
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// splitArtistTitle splits "Artist - Title" → (artist, title).
func splitArtistTitle(s string) (artist, title string) {
	for _, sep := range []string{" – ", " — ", " - "} {
		if idx := strings.Index(s, sep); idx > 0 {
			return strings.TrimSpace(s[:idx]), strings.TrimSpace(s[idx+len(sep):])
		}
	}
	return "", strings.TrimSpace(s)
}

// parseDurationStr converts "4:32" or "1:02:45" to total seconds.
func parseDurationStr(s string) int {
	s = strings.TrimSpace(s)
	parts := strings.Split(s, ":")
	total := 0
	for _, p := range parts {
		var n int
		fmt.Sscan(p, &n)
		total = total*60 + n
	}
	return total
}

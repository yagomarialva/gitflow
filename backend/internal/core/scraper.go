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
func SearchYouTube(query string) []models.SearchResult {
	log.Printf("[search] Query: %q", query)

	// 1. Try chromedp (headless browser)
	results, err := searchWithChromedp(query)
	if err == nil && len(results) > 0 {
		log.Printf("[search] chromedp returned %d results", len(results))
		return results
	}
	log.Printf("[search] chromedp failed (%v), trying yt-dlp", err)

	// 2. Try yt-dlp
	results, err = searchWithYtDlp(query)
	if err == nil && len(results) > 0 {
		log.Printf("[search] yt-dlp returned %d results", len(results))
		return results
	}
	log.Printf("[search] yt-dlp failed (%v), falling back to iTunes", err)

	// 3. iTunes last resort
	return searchItunes(query)
}

// ─── Tier 1: chromedp ─────────────────────────────────────────────────────────

func searchWithChromedp(query string) ([]models.SearchResult, error) {
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

	// Selectors for YouTube search result items
	type ytItem struct {
		Title     string
		URL       string
		Channel   string
		Duration  string
		Thumbnail string
	}

	var rawItems []ytItem

	// JavaScript to extract video data from YouTube search results
	script := `
	(function() {
		const items = [];
		const renderers = document.querySelectorAll('ytd-video-renderer');
		renderers.forEach((r, i) => {
			if (i >= 15) return;
			const title = r.querySelector('#video-title');
			const channel = r.querySelector('#channel-name a, .ytd-channel-name a');
			const duration = r.querySelector('ytd-thumbnail-overlay-time-status-renderer span');
			const thumb = r.querySelector('ytd-thumbnail img');
			if (!title) return;
			items.push({
				title:     title.textContent.trim(),
				url:       'https://www.youtube.com' + (title.getAttribute('href') || ''),
				channel:   channel ? channel.textContent.trim() : '',
				duration:  duration ? duration.textContent.trim() : '',
				thumbnail: thumb ? (thumb.getAttribute('src') || thumb.getAttribute('data-thumb') || '') : '',
			});
		});
		return JSON.stringify(items);
	})()
	`

	var resultJSON string
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(searchURL),
		chromedp.WaitVisible(`ytd-video-renderer`, chromedp.ByQuery),
		chromedp.EvaluateAsDevTools(script, &resultJSON),
	)
	if err != nil {
		return nil, fmt.Errorf("chromedp run: %w", err)
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

func searchWithYtDlp(query string) ([]models.SearchResult, error) {
	target := fmt.Sprintf("ytsearch12:%s", query)
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
		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        song,
			Artist:       artist,
			ThumbnailURL: e.Thumbnail,
			Duration:     int(e.Duration),
			SourceURL:    e.WebpageURL,
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

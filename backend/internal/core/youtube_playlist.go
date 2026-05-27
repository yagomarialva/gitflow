package core

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"ares-backend/internal/models"

	"github.com/chromedp/chromedp"
	"github.com/google/uuid"
)

type ytPlaylistTrack struct {
	Title     string `json:"title"`
	URL       string `json:"url"`
	Duration  string `json:"duration"`
	Thumbnail string `json:"thumbnail"`
}

// ScrapeYouTubePlaylist scrapes a YouTube playlist URL bypassing lazy loading using chromedp.
func ScrapeYouTubePlaylist(ctx context.Context, playlistURL string) (models.Playlist, []models.SearchResult, error) {
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

	if chromePath := os.Getenv("CHROME_BIN"); chromePath != "" {
		opts = append(opts, chromedp.ExecPath(chromePath))
	}

	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	chromeCtx, cancel2 := chromedp.NewContext(allocCtx)
	defer cancel2()

	timeoutCtx, cancel3 := context.WithTimeout(chromeCtx, 120*time.Second) // Up to 120s for navigation, rendering, and scrolling
	defer cancel3()

	var playlistName string
	var rawItems []ytPlaylistTrack

	// JS to extract all tracks currently loaded
	extractScript := `
	(function() {
		const items = [];
		const renderers = document.querySelectorAll('ytd-playlist-video-renderer');
		renderers.forEach((r) => {
			const title = r.querySelector('#video-title');
			const duration = r.querySelector('ytd-thumbnail-overlay-time-status-renderer span');
			const thumb = r.querySelector('ytd-thumbnail img');
			if (!title) return;
			
			items.push({
				title: title.textContent.trim(),
				url: 'https://www.youtube.com' + (title.getAttribute('href') || ''),
				duration: duration ? duration.textContent.trim() : '',
				thumbnail: thumb ? (thumb.getAttribute('src') || thumb.getAttribute('data-thumb') || '') : '',
			});
		});
		return items;
	})()
	`

	// Step 1: Navigate and wait for first content
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(playlistURL),
		chromedp.WaitVisible(`ytd-playlist-video-renderer`, chromedp.ByQuery),
	)
	if err != nil {
		return models.Playlist{}, nil, fmt.Errorf("chromedp run: %w", err)
	}

	// Step 2: Scroll down in a Go-side loop to trigger lazy loading
	var lastHeight int
	staleCount := 0
	for staleCount < 4 {
		var newHeight int
		if err := chromedp.Run(timeoutCtx,
			chromedp.Evaluate(`window.scrollBy(0, 2000); document.documentElement.scrollHeight`, &newHeight),
		); err != nil {
			break
		}
		if newHeight == lastHeight {
			staleCount++
		} else {
			staleCount = 0
			lastHeight = newHeight
		}
		time.Sleep(500 * time.Millisecond)
	}

	// Step 3: Extract playlist title from document.title
	if err := chromedp.Run(timeoutCtx,
		chromedp.Evaluate(`(function(){ var t = document.title || ''; if (t.endsWith(' - YouTube')) { t = t.substring(0, t.length - 10); } return t; })()`, &playlistName),
	); err != nil {
		log.Printf("[playlist] failed to extract title: %v", err)
	}

	// Step 4: Extract all loaded tracks
	if err := chromedp.Run(timeoutCtx,
		chromedp.Evaluate(extractScript, &rawItems),
	); err != nil {
		return models.Playlist{}, nil, fmt.Errorf("chromedp extract tracks: %w", err)
	}

	playlist := models.Playlist{
		ID:        uuid.New().String(),
		Name:      playlistName,
		SourceURL: playlistURL,
		CreatedAt: time.Now(),
	}

	if playlist.Name == "" {
		playlist.Name = "YouTube Playlist"
	}

	var results []models.SearchResult
	for i, item := range rawItems {
		if item.URL == "" || item.Title == "" {
			continue
		}
		if i == 0 {
			playlist.ThumbnailURL = item.Thumbnail
		}

		artist, song := splitArtistTitle(item.Title)
		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        song,
			Artist:       artist,
			ThumbnailURL: item.Thumbnail,
			Duration:     parseDurationStr(item.Duration),
			SourceURL:    item.URL,
		})
	}

	return playlist, results, nil
}

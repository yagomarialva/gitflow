package core

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"time"

	"github.com/chromedp/chromedp"
)

// ScrapeTPBForAudiobook scrapes The Pirate Bay for audiobook torrents using chromedp.
// It bypasses simple Cloudflare screens by waiting for the result table and extracts the magnet link with the most seeders.
func ScrapeTPBForAudiobook(ctx context.Context, query string) (string, error) {
	opts := []chromedp.ExecAllocatorOption{
		chromedp.NoFirstRun,
		chromedp.NoDefaultBrowserCheck,
		chromedp.Headless,
		chromedp.DisableGPU,
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("disable-extensions", true),
	}

	if chromePath := os.Getenv("CHROME_BIN"); chromePath != "" {
		opts = append(opts, chromedp.ExecPath(chromePath))
	}

	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	chromeCtx, cancel2 := chromedp.NewContext(allocCtx)
	defer cancel2()

	timeoutCtx, cancel3 := context.WithTimeout(chromeCtx, 30*time.Second)
	defer cancel3()

	// 100 = Audio
	searchURL := fmt.Sprintf("https://thepiratebay.org/search.php?q=%s&audio=on", url.QueryEscape(query))

	var magnetLink string

	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate(searchURL),
		// Wait for the main results list. ID #st or list items are typical in modern TPB proxies.
		// Using .list-item or `#st` table
		chromedp.WaitVisible(`.list-item, #st`, chromedp.ByQuery),
		chromedp.Evaluate(`
			(function() {
				// Get the first result (usually sorted by seeders if TPB default is kept or we take the top one)
				let firstResult = document.querySelector('.list-item');
				if (!firstResult) {
					// Fallback to old TPB table layout
					let trs = document.querySelectorAll('#searchResult tr');
					if (trs.length > 1) firstResult = trs[1]; // index 0 is header
				}
				if (!firstResult) return "";
				let magnetTag = firstResult.querySelector('a[href^="magnet:?"]');
				return magnetTag ? magnetTag.href : "";
			})();
		`, &magnetLink),
	)

	if err != nil {
		return "", fmt.Errorf("chromedp run: %w", err)
	}

	if magnetLink == "" {
		return "", fmt.Errorf("no viable torrent found on The Pirate Bay for query: %s", query)
	}

	return magnetLink, nil
}

package main

import (
	"context"
	"log"
	"time"

	"github.com/chromedp/chromedp"
)

func main() {
	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("no-sandbox", true),
	)
	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	ctx, cancel2 := chromedp.NewContext(allocCtx)
	defer cancel2()

	var finalURL string
	var pageTitle string

	searchURL := "https://www.youtube.com/results?search_query=motorhead+playlist&sp=EgIQAw=="
	log.Printf("Navigating to: %s", searchURL)
	
	ctxWithTimeout, cancel3 := context.WithTimeout(ctx, 20*time.Second)
	defer cancel3()

	err := chromedp.Run(ctxWithTimeout,
		chromedp.Navigate(searchURL),
		chromedp.Location(&finalURL),
		chromedp.Title(&pageTitle),
	)
	if err != nil {
		log.Fatalf("Run failed: %v", err)
	}

	log.Printf("Landed on URL: %s, Title: %s", finalURL, pageTitle)

	// Wait 5 seconds
	time.Sleep(5 * time.Second)

	script := `
	(function() {
		const items = [];
		const isPlaylistSearch = true; // Hardcoded for test
		
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
				
				url = 'https://www.youtube.com' + linkEl.getAttribute('href');
				isPlaylist = url.includes('list=');
				
				if (isPlaylistSearch !== isPlaylist) return;
				
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

	var resultJSON string
	err = chromedp.Run(ctx,
		chromedp.Evaluate(script, &resultJSON),
	)
	if err != nil {
		log.Fatalf("Evaluate failed: %v", err)
	}

	log.Printf("Result items: %s", resultJSON)
}

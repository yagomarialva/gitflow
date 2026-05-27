package core

import (
	"encoding/xml"
	"io"
	"net/http"
	"time"

	"ares-backend/internal/models"
)

type RSS struct {
	Channel struct {
		Title       string `xml:"title"`
		Description string `xml:"description"`
		Image       struct {
			URL string `xml:"url"`
		} `xml:"image"`
		Items []struct {
			Title     string `xml:"title"`
			Enclosure struct {
				URL  string `xml:"url,attr"`
				Type string `xml:"type,attr"`
			} `xml:"enclosure"`
		} `xml:"item"`
	} `xml:"channel"`
}

func ScrapePodcastRSS(feedURL string) (models.Playlist, []models.SearchResult, error) {
	var meta models.Playlist
	var tracks []models.SearchResult

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(feedURL)
	if err != nil {
		return meta, tracks, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return meta, tracks, err
	}

	var rss RSS
	if err := xml.Unmarshal(body, &rss); err != nil {
		return meta, tracks, err
	}

	meta = models.Playlist{
		ID:           "podcast-" + feedURL,
		Name:         rss.Channel.Title,
		SourceURL:    feedURL,
		ThumbnailURL: rss.Channel.Image.URL,
		CreatedAt:    time.Now(),
	}

	for _, item := range rss.Channel.Items {
		if item.Enclosure.URL != "" {
			tracks = append(tracks, models.SearchResult{
				Title:     item.Title,
				SourceURL: item.Enclosure.URL,
			})
		}
	}

	return meta, tracks, nil
}

package core

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"

	"ares-backend/internal/models"

	"github.com/google/uuid"
)

// SearchLibriVox queries the LibriVox API for audiobooks matching the title.
func SearchLibriVox(query string) []models.SearchResult {
	var results []models.SearchResult
	apiURL := fmt.Sprintf("https://librivox.org/api/feed/audiobooks?title=^%s&format=json", url.QueryEscape(query))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		log.Printf("[librivox] Error fetching API: %v", err)
		return results
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[librivox] API returned status: %d", resp.StatusCode)
		return results
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return results
	}

	var data struct {
		Books []struct {
			ID          string `json:"id"`
			Title       string `json:"title"`
			Description string `json:"description"`
			TotalTime   string `json:"totaltime"` // e.g. "12:34:56"
			ZipURL      string `json:"url_zip_file"`
			Authors     []struct {
				FirstName string `json:"first_name"`
				LastName  string `json:"last_name"`
			} `json:"authors"`
		} `json:"books"`
	}

	// LibriVox sometimes returns an error object if nothing is found, so we ignore errors here
	if err := json.Unmarshal(body, &data); err != nil {
		return results
	}

	for _, b := range data.Books {
		if b.ZipURL == "" {
			continue
		}

		artist := "LibriVox Volunteer"
		if len(b.Authors) > 0 {
			artist = b.Authors[0].FirstName + " " + b.Authors[0].LastName
		}

		// parse totaltime to seconds roughly (HH:MM:SS)
		var h, m, s int
		fmt.Sscanf(b.TotalTime, "%d:%d:%d", &h, &m, &s)
		duration := h*3600 + m*60 + s

		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        b.Title,
			Artist:       artist,
			ThumbnailURL: "https://librivox.org/images/librivox-logo.png",
			Duration:     duration,
			SourceURL    : b.ZipURL,
			FileSize:     "~100-300 MB",
		})
	}

	return results
}

// SearchPodcasts queries the iTunes Search API for podcasts (audiobooks).
func SearchPodcasts(query string) []models.SearchResult {
	var results []models.SearchResult
	apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&media=podcast&entity=podcast&limit=10", url.QueryEscape(query))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		log.Printf("[itunes] Error fetching API: %v", err)
		return results
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[itunes] API returned status: %d", resp.StatusCode)
		return results
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return results
	}

	var data struct {
		Results []struct {
			TrackName      string `json:"trackName"`
			ArtistName     string `json:"artistName"`
			FeedURL        string `json:"feedUrl"`
			ArtworkUrl600  string `json:"artworkUrl600"`
			TrackCount     int    `json:"trackCount"`
		} `json:"results"`
	}

	if err := json.Unmarshal(body, &data); err != nil {
		return results
	}

	for _, p := range data.Results {
		if p.FeedURL == "" {
			continue
		}

		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        p.TrackName,
			Artist:       p.ArtistName + " (Podcast)",
			ThumbnailURL: p.ArtworkUrl600,
			Duration:     p.TrackCount, // Using duration to show number of episodes
			SourceURL    : p.FeedURL,
			FileSize:     "Varies",
		})
	}

	return results
}

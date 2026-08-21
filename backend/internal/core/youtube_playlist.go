package core

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os/exec"
	"strings"
	"time"

	"ares-backend/internal/models"

	"github.com/google/uuid"
)

// ScrapeYouTubePlaylist fetches playlist tracks using yt-dlp instead of chromedp for better reliability.
func ScrapeYouTubePlaylist(ctx context.Context, playlistURL string) (models.Playlist, []models.SearchResult, error) {
	// 1. Get playlist title
	playlistName := "YouTube Playlist"
	cmdTitle := exec.CommandContext(ctx, "yt-dlp", playlistURL, "--playlist-end", "1", "--dump-json", "--flat-playlist")
	if out, err := cmdTitle.Output(); err == nil {
		var info struct {
			PlaylistTitle string `json:"playlist_title"`
			Playlist      string `json:"playlist"`
		}
		if json.Unmarshal(out, &info) == nil {
			if info.PlaylistTitle != "" {
				playlistName = info.PlaylistTitle
			} else if info.Playlist != "" {
				playlistName = info.Playlist
			}
		}
	}

	// 2. Fetch all tracks
	cmd := exec.CommandContext(ctx, "yt-dlp", playlistURL, "--dump-json", "--flat-playlist", "--quiet", "--no-warnings")
	out, err := cmd.Output()
	if err != nil && len(out) == 0 {
		return models.Playlist{}, nil, fmt.Errorf("yt-dlp fetch playlist: %w", err)
	}

	playlist := models.Playlist{
		ID:        uuid.New().String(),
		Name:      playlistName,
		SourceURL: playlistURL,
		CreatedAt: time.Now(),
	}

	var results []models.SearchResult
	dec := json.NewDecoder(strings.NewReader(string(out)))
	for dec.More() {
		var e ytDlpEntry
		if err := dec.Decode(&e); err != nil {
			continue
		}
		artist, song := splitArtistTitle(e.Title)
		if e.Channel != "" && artist == "" {
			artist = e.Channel
		} else if e.Uploader != "" && artist == "" {
			artist = e.Uploader
		}
		
		urlStr := e.WebpageURL
		if urlStr == "" && e.ID != "" {
			urlStr = "https://www.youtube.com/watch?v=" + e.ID
		}

		if song == "" || strings.Contains(song, "[Private video]") || strings.Contains(song, "[Deleted video]") {
			continue
		}

		if len(results) == 0 && e.Thumbnail != "" {
			playlist.ThumbnailURL = e.Thumbnail
		}

		results = append(results, models.SearchResult{
			ID:           uuid.New().String(),
			Title:        song,
			Artist:       artist,
			ThumbnailURL: e.Thumbnail,
			Duration:     int(e.Duration),
			SourceURL:    urlStr,
		})
	}

	log.Printf("[playlist] Fetched %d tracks for playlist %q", len(results), playlistName)
	return playlist, results, nil
}

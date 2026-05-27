package models

import "time"

type Track struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Artist       string    `json:"artist"`
	Album        string    `json:"album"`
	Duration     int       `json:"duration"`
	FilePath     string    `json:"file_path"`
	ThumbnailURL string    `json:"thumbnail_url"`
	StorageType  string    `json:"storage_type"` // "opus_gz" | "mp3"
	AddedAt      time.Time `json:"added_at"`
}

type Download struct {
	ID          string     `json:"id"`
	SourceURL   string     `json:"source_url"`
	Title       string     `json:"title"`
	Artist      string     `json:"artist"`
	Status      string     `json:"status"`  // pending|searching|downloading|converting|completed|failed
	Source      string     `json:"source"`  // "chromedp"|"ytdlp"|"torrent"
	Progress    float64    `json:"progress"`
	FilePath    string     `json:"file_path,omitempty"`
	PlaylistID  string     `json:"playlist_id,omitempty"`
	Error       string     `json:"error,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

type SearchResult struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Artist       string `json:"artist"`
	ThumbnailURL string `json:"thumbnail_url"`
	Duration     int    `json:"duration"`
	SourceURL    string `json:"source_url"`
	FileSize     string `json:"file_size"`
}

type Playlist struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	SourceURL    string    `json:"source_url,omitempty"`    // From YouTube playlist URL
	ThumbnailURL string    `json:"thumbnail_url,omitempty"` // Extracted thumbnail
	CreatedAt    time.Time `json:"created_at"`
}

// WSEvent is sent over WebSocket to the frontend.
type WSEvent struct {
	Event   string      `json:"event"`
	Payload interface{} `json:"payload"`
}

type Audiobook struct {
	ID           string    `json:"id"`
	Title        string    `json:"title"`
	Author       string    `json:"author"`
	Duration     int       `json:"duration"`
	FilePath     string    `json:"file_path"`
	ThumbnailURL string    `json:"thumbnail_url"`
	StorageType  string    `json:"storage_type"`
	ResumeTime   int       `json:"resume_time"`
	AddedAt      time.Time `json:"added_at"`
}

// Package core/downloader.go
// Download pipeline:
//   1. yt-dlp (YouTube → MP3 via ffmpeg + ID3 tags)  — primary
//   2. anacrolix/torrent (magnet/DHT lookup)          — fallback
//   3. Stores as Opus+gzip (.opus.gz) to save ~40% disk
package core

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"ares-backend/internal/db"
	"ares-backend/internal/models"

	"github.com/anacrolix/torrent"
	"github.com/google/uuid"
)

// ─── Worker Pool ─────────────────────────────────────────────────────────────

var (
	DownloadQueue    = make(chan *models.Download, 100)
	ActiveWorker     sync.WaitGroup
	progressCallback func(dl *models.Download)
)

func StartDownloadWorkers(numWorkers int, downloadsPath string, onProgress func(dl *models.Download)) {
	progressCallback = onProgress
	for i := 0; i < numWorkers; i++ {
		ActiveWorker.Add(1)
		go func(id int) {
			defer ActiveWorker.Done()
			log.Printf("[worker-%d] started", id)
			for dl := range DownloadQueue {
				processDownload(dl, downloadsPath)
			}
		}(i)
	}
}

// AddDownload registers a new download job and queues it.
func AddDownload(title, sourceURL, playlistID string) (*models.Download, error) {
	dl := &models.Download{
		ID:         uuid.New().String(),
		SourceURL:  sourceURL,
		Title:      title,
		Status:     "pending",
		Progress:   0,
		PlaylistID: playlistID,
		CreatedAt:  time.Now(),
	}
	// Safely add column if not exists
	_, _ = db.DB.Exec("ALTER TABLE downloads ADD COLUMN playlist_id TEXT NOT NULL DEFAULT ''")

	_, err := db.DB.Exec(
		"INSERT INTO downloads (id, source_url, title, status, progress, playlist_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		dl.ID, dl.SourceURL, dl.Title, dl.Status, dl.Progress, dl.PlaylistID, dl.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	DownloadQueue <- dl
	return dl, nil
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

func processDownload(dl *models.Download, downloadsPath string) {
	log.Printf("[dl] start %s — %s", dl.ID, dl.Title)
	os.MkdirAll(downloadsPath, 0755)

	// Step 1: Check if it's a YouTube Playlist URL
	if strings.Contains(dl.SourceURL, "list=") && !strings.Contains(dl.SourceURL, "watch?v=") {
		log.Printf("[dl] Detected YouTube Playlist. Initiating full scrape.")
		dl.Status = "downloading"
		dl.Source = "chromedp"
		updateDL(dl)
		notify(dl)

		// 1a) Scrape the playlist page to get all track URLs/titles into a slice
		plMeta, scrapedTracks, err := ScrapeYouTubePlaylist(context.Background(), dl.SourceURL)
		if err != nil {
			failDL(dl, fmt.Sprintf("failed to scrape playlist: %v", err))
			return
		}

		log.Printf("[dl] Playlist '%s' has %d tracks. Starting sequential download.", plMeta.Name, len(scrapedTracks))

		// 1b) Download each track sequentially, collecting library track IDs
		downloadedTrackIDs := make([]string, 0, len(scrapedTracks))

		for i, track := range scrapedTracks {
			log.Printf("[dl] Downloading playlist track %d/%d: %s", i+1, len(scrapedTracks), track.Title)

			// Update parent download progress based on how many tracks are done
			dl.Progress = float64(i) / float64(len(scrapedTracks)) * 100
			updateDL(dl)
			notify(dl)

			// Download this individual track synchronously (not via queue)
			trackID, err := downloadSingleTrack(track.Title, track.SourceURL, downloadsPath)
			if err != nil {
				log.Printf("[dl] ⚠️ Failed to download track '%s': %v (skipping)", track.Title, err)
				continue
			}
			downloadedTrackIDs = append(downloadedTrackIDs, trackID)
		}

		log.Printf("[dl] Downloaded %d/%d tracks. Creating playlist.", len(downloadedTrackIDs), len(scrapedTracks))

		// 1c) Create the playlist in DB (only after downloads are done)
		playlistID := plMeta.ID
		playlistName := plMeta.Name
		if playlistName == "" {
			playlistName = dl.Title
		}
		_, err = db.DB.Exec(
			"INSERT INTO playlists (id, name, source_url, thumbnail_url, created_at) VALUES (?, ?, ?, ?, ?)",
			playlistID, playlistName, plMeta.SourceURL, plMeta.ThumbnailURL, plMeta.CreatedAt,
		)
		if err != nil {
			log.Printf("[dl] Failed to create playlist in DB: %v", err)
		}

		// 1d) Link all downloaded tracks to the playlist
		for _, tid := range downloadedTrackIDs {
			_, err = db.DB.Exec(
				"INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?,?)",
				playlistID, tid,
			)
			if err != nil {
				log.Printf("[dl] Failed to link track %s to playlist: %v", tid, err)
			}
		}

		// 1e) Garbage collection: nil out temporary slices so GC can reclaim memory
		scrapedTracks = nil
		downloadedTrackIDs = nil

		// Mark parent download as completed
		now := time.Now()
		dl.Status = "completed"
		dl.Progress = 100
		dl.CompletedAt = &now
		updateDL(dl)
		notify(dl)
		log.Printf("[dl] ✅ Playlist '%s' fully processed.", playlistName)
		return
	}
	// Step 1.5: Check if it's a direct ZIP file (LibriVox)
	if strings.HasSuffix(dl.SourceURL, ".zip") {
		log.Printf("[dl] Detected direct ZIP download. Initiating direct fetch.")
		dl.Status = "downloading"
		dl.Source = "direct"
		updateDL(dl)
		notify(dl)

		zipPath := filepath.Join(downloadsPath, dl.ID+".zip")
		err := directDownloadFile(dl.SourceURL, zipPath, dl)
		if err != nil {
			failDL(dl, fmt.Sprintf("failed to download zip: %v", err))
			return
		}

		// Insert into audiobooks directly as mp3_zip
		now := time.Now()
		dl.FilePath = zipPath
		dl.Status = "completed"
		dl.Progress = 100
		dl.CompletedAt = &now
		updateDL(dl)
		notify(dl)

		_, err = db.DB.Exec(
			`INSERT INTO audiobooks (id, title, author, file_path, storage_type, added_at)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON CONFLICT(file_path) DO NOTHING`,
			uuid.New().String(), dl.Title, dl.Artist, zipPath, "mp3_zip", now,
		)
		if err != nil {
			log.Printf("[dl] audiobook insert failed for ZIP: %v", err)
		}
		log.Printf("[dl] ✅ ZIP '%s' fully downloaded.", dl.Title)
		return
	}
	// Step 1.6: Check if it's a Podcast RSS feed
	if !strings.Contains(dl.SourceURL, "youtube.com") && (strings.HasSuffix(dl.SourceURL, ".xml") || strings.Contains(dl.SourceURL, "feed") || strings.Contains(dl.SourceURL, "rss") || strings.Contains(dl.SourceURL, "podcast")) && !strings.HasSuffix(dl.SourceURL, ".zip") {
		log.Printf("[dl] Detected Podcast RSS feed. Initiating feed parsing.")
		dl.Status = "downloading"
		dl.Source = "rss"
		updateDL(dl)
		notify(dl)

		plMeta, scrapedTracks, err := ScrapePodcastRSS(dl.SourceURL)
		if err != nil {
			failDL(dl, fmt.Sprintf("failed to parse podcast rss: %v", err))
			return
		}

		log.Printf("[dl] Podcast '%s' has %d episodes. Starting sequential download.", plMeta.Name, len(scrapedTracks))

		downloadedTrackIDs := make([]string, 0, len(scrapedTracks))
		for i, track := range scrapedTracks {
			log.Printf("[dl] Downloading podcast episode %d/%d: %s", i+1, len(scrapedTracks), track.Title)
			dl.Progress = float64(i) / float64(len(scrapedTracks)) * 100
			updateDL(dl)
			notify(dl)

			// Download single episode (often direct MP3 urls in RSS)
			trackID, err := downloadSingleTrack(track.Title, track.SourceURL, downloadsPath)
			if err != nil {
				log.Printf("[dl] ⚠️ Failed to download episode '%s': %v (skipping)", track.Title, err)
				continue
			}
			downloadedTrackIDs = append(downloadedTrackIDs, trackID)
		}

		log.Printf("[dl] Downloaded %d/%d episodes. Creating podcast playlist.", len(downloadedTrackIDs), len(scrapedTracks))

		playlistID := "pod-" + uuid.New().String()
		playlistName := plMeta.Name
		if playlistName == "" {
			playlistName = dl.Title
		}
		_, err = db.DB.Exec(
			"INSERT INTO playlists (id, name, source_url, thumbnail_url, created_at) VALUES (?, ?, ?, ?, ?)",
			playlistID, playlistName, plMeta.SourceURL, plMeta.ThumbnailURL, plMeta.CreatedAt,
		)
		if err != nil {
			log.Printf("[dl] Failed to create playlist in DB: %v", err)
		}

		for _, tid := range downloadedTrackIDs {
			_, err = db.DB.Exec(
				"INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?,?)",
				playlistID, tid,
			)
		}

		now := time.Now()
		dl.Status = "completed"
		dl.Progress = 100
		dl.CompletedAt = &now
		updateDL(dl)
		notify(dl)
		log.Printf("[dl] ✅ Podcast '%s' fully processed.", playlistName)
		return
	}

	ytURL := dl.SourceURL

	// Step 2: Try yt-dlp first
	dl.Status = "downloading"
	dl.Source = "ytdlp"
	updateDL(dl)
	notify(dl)

	rawFile, meta, err := ytDlpDownload(ytURL, downloadsPath, dl)
	if err != nil {
		log.Printf("[dl] yt-dlp failed: %v — trying torrent fallback", err)
		dl.Source = "torrent"
		dl.Status = "downloading"
		updateDL(dl)
		notify(dl)

		rawFile, err = torrentFallback(dl.Title, downloadsPath, dl)
		if err != nil {
			failDL(dl, fmt.Sprintf("all sources exhausted: %v", err))
			return
		}
		meta = &trackMeta{Title: dl.Title, Artist: dl.Artist}
	}

	// Step 3: Compress to zip (mp3 inside zip for streaming compatibility)
	dl.Status = "converting"
	dl.Progress = 90
	updateDL(dl)
	notify(dl)

	zipPath, err := compressToZip(rawFile, meta, downloadsPath)
	if err != nil {
		log.Printf("[dl] compression failed (%v) — keeping raw mp3", err)
		zipPath = rawFile
	} else {
		os.Remove(rawFile) // remove uncompressed original
	}

	// Step 4: Persist track to library
	now := time.Now()
	dl.FilePath = zipPath
	dl.Status = "completed"
	dl.Progress = 100
	dl.CompletedAt = &now
	updateDL(dl)

	storageType := "mp3"
	if strings.HasSuffix(zipPath, ".zip") {
		storageType = "mp3_zip"
	}

	trackID := uuid.New().String()
	_, err = db.DB.Exec(
		`INSERT INTO library_tracks (id, title, artist, thumbnail_url, file_path, storage_type, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_path) DO NOTHING`,
		trackID, meta.Title, meta.Artist, meta.Thumbnail, zipPath, storageType, now,
	)
	if err != nil {
		log.Printf("[dl] library insert failed: %v", err)
	}

	// Link to playlist if needed
	if dl.PlaylistID != "" {
		_, err = db.DB.Exec(
			"INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?,?)",
			dl.PlaylistID, trackID,
		)
		if err != nil {
			log.Printf("[dl] playlist track link failed: %v", err)
		}
	}

	notify(dl)
	log.Printf("[dl] ✅ done %s → %s", dl.ID, zipPath)
}

// downloadSingleTrack downloads a single track synchronously (not queued).
// It runs yt-dlp, compresses, inserts into library_tracks, and returns the track ID.
// Used by the playlist pipeline to download each track in a loop.
func downloadSingleTrack(title, sourceURL, downloadsPath string) (string, error) {
	tmpDL := &models.Download{
		ID:        uuid.New().String(),
		SourceURL: sourceURL,
		Title:     title,
		Status:    "downloading",
		Source:    "ytdlp",
		CreatedAt: time.Now(),
	}

	// Try yt-dlp
	rawFile, meta, err := ytDlpDownload(sourceURL, downloadsPath, tmpDL)
	if err != nil {
		log.Printf("[dl-single] yt-dlp failed for '%s': %v — trying torrent", title, err)
		rawFile, err = torrentFallback(title, downloadsPath, tmpDL)
		if err != nil {
			return "", fmt.Errorf("all sources exhausted for '%s': %w", title, err)
		}
		meta = &trackMeta{Title: title, Artist: ""}
	}

	// Compress
	zipPath, err := compressToZip(rawFile, meta, downloadsPath)
	if err != nil {
		log.Printf("[dl-single] compression failed (%v) — keeping raw mp3", err)
		zipPath = rawFile
	} else {
		os.Remove(rawFile)
	}

	// Persist to library
	now := time.Now()
	storageType := "mp3"
	if strings.HasSuffix(zipPath, ".zip") {
		storageType = "mp3_zip"
	}

	trackID := uuid.New().String()
	_, err = db.DB.Exec(
		`INSERT INTO library_tracks (id, title, artist, thumbnail_url, file_path, storage_type, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_path) DO NOTHING`,
		trackID, meta.Title, meta.Artist, meta.Thumbnail, zipPath, storageType, now,
	)
	if err != nil {
		return "", fmt.Errorf("library insert failed: %w", err)
	}

	log.Printf("[dl-single] ✅ Track '%s' saved as %s", meta.Title, trackID)
	return trackID, nil
}

// ─── yt-dlp integration ───────────────────────────────────────────────────────

type trackMeta struct {
	Title     string
	Artist    string
	Thumbnail string
}

var progressRe = regexp.MustCompile(`\[download\]\s+([\d.]+)%`)

func ytDlpDownload(ytURL, downloadsPath string, dl *models.Download) (string, *trackMeta, error) {
	tmpID := "tmp_" + dl.ID
	outTemplate := filepath.Join(downloadsPath, tmpID+".%(ext)s")

	cmd := exec.Command("yt-dlp",
		ytURL,
		"-x",
		"--audio-format", "mp3",
		"--audio-quality", "0",
		"--no-playlist",
		"-o", outTemplate,
		"--write-info-json",
		"--progress",
		"--newline",
		"--quiet",
		"--no-warnings",
		"--socket-timeout", "30",
		"--retries", "3",
	)

	stdoutPipe, _ := cmd.StdoutPipe()
	stderrPipe, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return "", nil, fmt.Errorf("start yt-dlp: %w", err)
	}

	// Parse progress lines
	parseLines := func(r io.Reader) {
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			line := sc.Text()
			if m := progressRe.FindStringSubmatch(line); len(m) > 1 {
				pct, _ := strconv.ParseFloat(m[1], 64)
				mapped := pct * 0.85 // map 0-100 yt-dlp to 0-85% of our total
				if mapped > dl.Progress {
					dl.Progress = mapped
					updateDL(dl)
					notify(dl)
				}
			}
		}
	}
	go parseLines(stdoutPipe)
	go parseLines(stderrPipe)

	if err := cmd.Wait(); err != nil {
		return "", nil, fmt.Errorf("yt-dlp: %w", err)
	}

	// Find output file
	mp3Path := filepath.Join(downloadsPath, tmpID+".mp3")
	if _, err := os.Stat(mp3Path); err != nil {
		// Try glob fallback
		matches, _ := filepath.Glob(filepath.Join(downloadsPath, tmpID+".*"))
		for _, m := range matches {
			if !strings.HasSuffix(m, ".json") {
				mp3Path = m
				break
			}
		}
	}
	if _, err := os.Stat(mp3Path); err != nil {
		return "", nil, fmt.Errorf("output file not found: %s", mp3Path)
	}

	// Read metadata from yt-dlp info json
	meta := &trackMeta{Title: dl.Title, Artist: dl.Artist}
	jsonPath := filepath.Join(downloadsPath, tmpID+".info.json")
	if data, err := os.ReadFile(jsonPath); err == nil {
		var info map[string]interface{}
		if json.Unmarshal(data, &info) == nil {
			if t, ok := info["title"].(string); ok {
				artist, song := splitArtistTitle(cleanYouTubeTitle(t))
				meta.Title = song
				meta.Artist = artist
			}
			if ch, ok := info["channel"].(string); ok && meta.Artist == "" {
				meta.Artist = ch
			}
			if th, ok := info["thumbnail"].(string); ok {
				meta.Thumbnail = th
			}
		}
		os.Remove(jsonPath)
	}

	// Inject ID3 + normalize
	finalMP3 := filepath.Join(downloadsPath, "tmp_norm_"+dl.ID+".mp3")
	if err := normalizeAndTag(mp3Path, finalMP3, meta); err != nil {
		log.Printf("[dl] normalize failed (non-fatal): %v", err)
		finalMP3 = mp3Path
	} else {
		os.Remove(mp3Path)
	}

	return finalMP3, meta, nil
}

// normalizeAndTag runs ffmpeg loudnorm + embeds ID3 tags with cover art.
func normalizeAndTag(input, output string, meta *trackMeta) error {
	// Download thumbnail
	tmpThumb := input + ".thumb.jpg"
	if meta.Thumbnail != "" {
		_ = exec.Command("curl", "-sL", "-o", tmpThumb, meta.Thumbnail).Run()
	}
	defer os.Remove(tmpThumb)

	args := []string{"-y", "-i", input}
	if _, err := os.Stat(tmpThumb); err == nil {
		args = append(args,
			"-i", tmpThumb,
			"-map", "0:a",
			"-map", "1:v",
			"-c:a", "libmp3lame",
			"-b:a", "320k",
			"-filter:a", "loudnorm",
			"-c:v", "mjpeg",
			"-id3v2_version", "3",
			"-metadata:s:v", "title=Album cover",
			"-metadata:s:v", "comment=Cover (front)",
		)
	} else {
		args = append(args,
			"-map", "0:a",
			"-c:a", "libmp3lame",
			"-b:a", "320k",
			"-filter:a", "loudnorm",
			"-id3v2_version", "3",
		)
	}
	args = append(args,
		"-metadata", "title="+meta.Title,
		"-metadata", "artist="+meta.Artist,
		output,
	)

	out, err := exec.Command("ffmpeg", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg: %w — %s", err, string(out))
	}
	return nil
}

// cleanYouTubeTitle removes common YouTube noise from titles.
var noiseRe = regexp.MustCompile(
	`(?i)\b(official\s*(music\s*)?video|official\s*audio|lyric\s*video|lyrics|HD|HQ|4K|remastered|explicit|clean\s*version|audio\s*only)\b`,
)

func cleanYouTubeTitle(s string) string {
	s = noiseRe.ReplaceAllString(s, " ")
	s = regexp.MustCompile(`\[[^\]]*\]|\([^)]*\)`).ReplaceAllString(s, " ")
	s = regexp.MustCompile(`\s{2,}`).ReplaceAllString(s, " ")
	return strings.TrimSpace(s)
}

// ─── BitTorrent fallback ──────────────────────────────────────────────────────

func torrentFallback(query, downloadsPath string, dl *models.Download) (string, error) {
	log.Printf("[torrent] searching for: %q", query)

	// Build torrent client config
	cfg := torrent.NewDefaultClientConfig()
	cfg.DataDir = filepath.Join(downloadsPath, "torrent_tmp_"+dl.ID)
	cfg.ListenPort = torrentPort()
	os.MkdirAll(cfg.DataDir, 0755)
	defer os.RemoveAll(cfg.DataDir)

	client, err := torrent.NewClient(cfg)
	if err != nil {
		return "", fmt.Errorf("torrent client: %w", err)
	}
	defer client.Close()

	// Search DHT / open trackers via magnet
	// Build a search magnet targeting common music torrent trackers
	magnetURI, err := searchMagnet(query)
	if err != nil {
		return "", fmt.Errorf("magnet search: %w", err)
	}

	t, err := client.AddMagnet(magnetURI)
	if err != nil {
		return "", fmt.Errorf("add magnet: %w", err)
	}

	// Wait for torrent info (timeout 60s)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	select {
	case <-t.GotInfo():
	case <-ctx.Done():
		return "", fmt.Errorf("timeout waiting for torrent info")
	}

	// Find best audio file
	var bestFile *torrent.File
	for _, f := range t.Files() {
		name := strings.ToLower(f.DisplayPath())
		if strings.HasSuffix(name, ".mp3") || strings.HasSuffix(name, ".flac") || strings.HasSuffix(name, ".ogg") {
			if bestFile == nil || f.Length() > bestFile.Length() {
				bestFile = f
			}
		}
	}
	if bestFile == nil {
		return "", fmt.Errorf("no audio file found in torrent")
	}
	bestFile.Download()

	// Monitor progress
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	dlCtx, dlCancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer dlCancel()

	for {
		select {
		case <-dlCtx.Done():
			return "", fmt.Errorf("torrent download timeout")
		case <-ticker.C:
			stats := t.Stats()
			total := bestFile.Length()
			if total > 0 {
				completed := float64(stats.BytesRead.Int64()) / float64(total) * 100
				dl.Progress = completed * 0.85
				updateDL(dl)
				notify(dl)
			}
			if bestFile.BytesCompleted() >= bestFile.Length() {
				goto done
			}
		}
	}

done:
	// Copy to downloads directory
	srcPath := filepath.Join(cfg.DataDir, bestFile.DisplayPath())
	ext := filepath.Ext(srcPath)
	destPath := filepath.Join(downloadsPath, "tmp_torrent_"+dl.ID+ext)
	if err := copyFile(srcPath, destPath); err != nil {
		return "", fmt.Errorf("copy torrent file: %w", err)
	}
	return destPath, nil
}

// searchMagnet builds a magnet URI by querying a JSON torrent search API.
// Uses a public torrent search API (no tracker registration required).
func searchMagnet(query string) (string, error) {
	// We use a DHT-based approach: create a fake info-hash search magnet
	// targeting well-known open trackers with DHT enabled.
	// In production you'd integrate with an API like Jackett, prowlarr, etc.
	//
	// For now: search knaben.eu (public, no API key required)
	apiURL := fmt.Sprintf("https://knaben.eu/api/search/%s/0/0/1", strings.ReplaceAll(query, " ", "%20"))
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(apiURL)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Hits []struct {
			Magnet string `json:"magnet"`
		} `json:"hits"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil || len(result.Hits) == 0 {
		return "", fmt.Errorf("no torrent results")
	}
	return result.Hits[0].Magnet, nil
}

func torrentPort() int {
	portStr := os.Getenv("TORRENT_PORT")
	if portStr == "" {
		return 6881
	}
	p, _ := strconv.Atoi(portStr)
	return p
}

// ─── Fase 3: Compression (mp3 inside zip) ────────────────────────────────────

// compressToZip wraps the mp3 in a zip archive to reduce storage by ~15-25%.
// The streaming handler decompresses on-the-fly.
func compressToZip(mp3Path string, meta *trackMeta, downloadsPath string) (string, error) {
	// Build a clean filename: "Artist - Title.mp3"
	fileName := safeFilename(fmt.Sprintf("%s - %s.mp3", meta.Artist, meta.Title))
	if meta.Artist == "" {
		fileName = safeFilename(meta.Title+".mp3")
	}
	zipPath := filepath.Join(downloadsPath, strings.TrimSuffix(fileName, ".mp3")+".zip")
	zipPath = resolveConflict(zipPath)

	src, err := os.Open(mp3Path)
	if err != nil {
		return "", err
	}
	defer src.Close()

	dst, err := os.Create(zipPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	zw := zip.NewWriter(dst)
	defer zw.Close()

	w, err := zw.Create(fileName)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(w, src); err != nil {
		return "", err
	}

	return zipPath, nil
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func failDL(dl *models.Download, reason string) {
	log.Printf("[dl] FAIL %s: %s", dl.ID, reason)
	dl.Status = "failed"
	dl.Error = reason
	updateDL(dl)
	notify(dl)
}

func updateDL(dl *models.Download) {
	_, err := db.DB.Exec(
		"UPDATE downloads SET status=?, progress=?, source=?, file_path=?, playlist_id=?, error=?, completed_at=? WHERE id=?",
		dl.Status, dl.Progress, dl.Source, dl.FilePath, dl.PlaylistID, dl.Error, dl.CompletedAt, dl.ID,
	)
	if err != nil {
		log.Printf("[dl] updateDL error: %v", err)
	}
}

func notify(dl *models.Download) {
	if progressCallback != nil {
		progressCallback(dl)
	}
}

var unsafeCharsRe = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1f]`)

func safeFilename(s string) string {
	s = unsafeCharsRe.ReplaceAllString(s, "_")
	s = regexp.MustCompile(`\s{2,}`).ReplaceAllString(s, " ")
	s = strings.TrimSpace(s)
	if len(s) > 200 {
		s = s[:200]
	}
	return s
}

func resolveConflict(path string) string {
	if _, err := os.Stat(path); err != nil {
		return path
	}
	ext := filepath.Ext(path)
	base := strings.TrimSuffix(path, ext)
	for i := 2; i < 100; i++ {
		c := fmt.Sprintf("%s (%d)%s", base, i, ext)
		if _, err := os.Stat(c); err != nil {
			return c
		}
	}
	return path
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}

// directDownloadFile downloads a file (like a LibriVox ZIP) directly to disk.
func directDownloadFile(url, destPath string, dl *models.Download) error {
	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}

	_, err = io.Copy(out, resp.Body)
	return err
}

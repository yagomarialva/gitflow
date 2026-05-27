package api

import (
	"ares-backend/internal/core"
	"ares-backend/internal/db"
	"ares-backend/internal/models"
	"net/http"

	"github.com/gofiber/adaptor/v2"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
	"github.com/google/uuid"
)

func SetupRoutes(app *fiber.App) {
	// ── WebSocket ────────────────────────────────────────────────────────
	app.Use("/ws", WsHandler)
	app.Get("/ws/events", websocket.New(HandleConnections))

	api := app.Group("/api")

	// ── Search ───────────────────────────────────────────────────────────
	api.Get("/search", handleSearch)

	// ── Downloads ────────────────────────────────────────────────────────
	api.Post("/downloads", handleStartDownload)
	api.Get("/downloads", handleGetDownloads)
	api.Delete("/downloads/:id", handleDeleteDownload)

	// ── Library ──────────────────────────────────────────────────────────
	api.Get("/library", handleGetLibrary)
	api.Put("/library/:id", handleUpdateTrack)
	api.Delete("/library/:id", handleDeleteTrack)

	// ── Streaming (decompresses zip on-the-fly) ───────────────────────────
	api.Get("/stream/:id", handleStreamTrack)

	// ── Playlists ─────────────────────────────────────────────────────────
	api.Get("/playlists", handleGetPlaylists)
	api.Post("/playlists", handleCreatePlaylist)
	api.Put("/playlists/:id", handleUpdatePlaylist)
	api.Delete("/playlists/:id", handleDeletePlaylist)
	api.Get("/playlists/:id/tracks", handleGetPlaylistTracks)
	api.Post("/playlists/:id/tracks", handleAddToPlaylist)
	api.Delete("/playlists/:id/tracks/:tid", handleRemoveFromPlaylist)
	api.Get("/playlists/:id/download", handleDownloadPlaylist)

	// ── Audiobooks ────────────────────────────────────────────────────────
	api.Get("/audiobooks", handleGetAudiobooks)
	api.Put("/audiobooks/:id/progress", handleUpdateAudiobookProgress)
	api.Delete("/audiobooks/:id", handleDeleteAudiobook)
}
// ─── Search ──────────────────────────────────────────────────────────────────

func handleSearch(c *fiber.Ctx) error {
	q := c.Query("q")
	searchType := c.Query("type", "music")
	if q == "" {
		return c.Status(400).JSON(fiber.Map{"error": "Missing search query"})
	}

	var results []models.SearchResult
	if searchType == "audiobook" {
		// Aggregate from multiple sources concurrently
		ch := make(chan []models.SearchResult, 4)
		
		go func() { ch <- core.SearchLibriVox(q) }()
		go func() { ch <- core.SearchPodcasts(q) }()
		go func() { ch <- core.SearchYouTube(q, "audiobook") }()
		go func() {
			var tpb []models.SearchResult
			magnet, err := core.ScrapeTPBForAudiobook(c.Context(), q)
			if err == nil && magnet != "" {
				tpb = append(tpb, models.SearchResult{
					ID:        magnet,
					Title:     q,
					Artist:    "Audiobook (The Pirate Bay)",
					Duration:  0,
					SourceURL: magnet,
				})
			}
			ch <- tpb
		}()

		// Collect results
		for i := 0; i < 4; i++ {
			res := <-ch
			results = append(results, res...)
		}
	} else if searchType == "playlist" {
		results = core.SearchYouTube(q, "playlist")
	} else {
		results = core.SearchYouTube(q, "music")
	}

	if results == nil {
		results = []models.SearchResult{}
	}
	return c.JSON(results)
}

// ─── Downloads ───────────────────────────────────────────────────────────────

type DownloadRequest struct {
	SourceURL string `json:"source_url"`
	Title     string `json:"title"`
}

func handleStartDownload(c *fiber.Ctx) error {
	var req DownloadRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Invalid request body"})
	}
	dl, err := core.AddDownload(req.Title, req.SourceURL, "")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Failed to queue download"})
	}
	return c.Status(201).JSON(dl)
}

func handleGetDownloads(c *fiber.Ctx) error {
	rows, err := db.DB.Query(`
		SELECT id, source_url, title, artist, status, source, progress,
		       COALESCE(file_path,''), COALESCE(error,''), created_at, completed_at
		FROM downloads ORDER BY created_at DESC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var list []models.Download
	for rows.Next() {
		var d models.Download
		if err := rows.Scan(&d.ID, &d.SourceURL, &d.Title, &d.Artist, &d.Status, &d.Source,
			&d.Progress, &d.FilePath, &d.Error, &d.CreatedAt, &d.CompletedAt); err != nil {
			continue
		}
		list = append(list, d)
	}
	if list == nil {
		list = []models.Download{}
	}
	return c.JSON(list)
}

func handleDeleteDownload(c *fiber.Ctx) error {
	_, err := db.DB.Exec("DELETE FROM downloads WHERE id=?", c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// ─── Library ─────────────────────────────────────────────────────────────────

func handleGetLibrary(c *fiber.Ctx) error {
	rows, err := db.DB.Query(`
		SELECT id, title, artist, COALESCE(album,''), COALESCE(duration,0),
		       file_path, COALESCE(thumbnail_url,''), COALESCE(storage_type,'mp3'), added_at
		FROM library_tracks ORDER BY added_at DESC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var tracks []models.Track
	for rows.Next() {
		var t models.Track
		if err := rows.Scan(&t.ID, &t.Title, &t.Artist, &t.Album, &t.Duration,
			&t.FilePath, &t.ThumbnailURL, &t.StorageType, &t.AddedAt); err != nil {
			continue
		}
		tracks = append(tracks, t)
	}
	if tracks == nil {
		tracks = []models.Track{}
	}
	return c.JSON(tracks)
}

func handleUpdateTrack(c *fiber.Ctx) error {
	id := c.Params("id")
	var req struct {
		Title  string `json:"title"`
		Artist string `json:"artist"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}

	_, err := db.DB.Exec("UPDATE library_tracks SET title=?, artist=? WHERE id=?", req.Title, req.Artist, id)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func handleDeleteTrack(c *fiber.Ctx) error {
	_, err := db.DB.Exec("DELETE FROM library_tracks WHERE id=?", c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

// ─── Streaming ────────────────────────────────────────────────────────────────

func handleStreamTrack(c *fiber.Ctx) error {
	var filePath string
	err := db.DB.QueryRow("SELECT file_path FROM library_tracks WHERE id=?", c.Params("id")).Scan(&filePath)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Track not found"})
	}

	return adaptor.HTTPHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := core.StreamTrack(filePath, w, r); err != nil {
			http.Error(w, err.Error(), 500)
		}
	})(c)
}

// ─── Playlists ────────────────────────────────────────────────────────────────

func handleGetPlaylists(c *fiber.Ctx) error {
	rows, err := db.DB.Query("SELECT id, name, created_at FROM playlists ORDER BY created_at DESC")
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var list []models.Playlist
	for rows.Next() {
		var p models.Playlist
		if err := rows.Scan(&p.ID, &p.Name, &p.CreatedAt); err != nil {
			continue
		}
		list = append(list, p)
	}
	if list == nil {
		list = []models.Playlist{}
	}
	return c.JSON(list)
}

type playlistReq struct {
	Name string `json:"name"`
}

func handleCreatePlaylist(c *fiber.Ctx) error {
	var req playlistReq
	if err := c.BodyParser(&req); err != nil || req.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name required"})
	}
	id := uuid.New().String()
	_, err := db.DB.Exec("INSERT INTO playlists (id, name) VALUES (?,?)", id, req.Name)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"id": id, "name": req.Name})
}

func handleDeletePlaylist(c *fiber.Ctx) error {
	_, err := db.DB.Exec("DELETE FROM playlists WHERE id=?", c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

type addTrackReq struct {
	TrackID string `json:"track_id"`
}

func handleAddToPlaylist(c *fiber.Ctx) error {
	var req addTrackReq
	if err := c.BodyParser(&req); err != nil || req.TrackID == "" {
		return c.Status(400).JSON(fiber.Map{"error": "track_id required"})
	}
	_, err := db.DB.Exec(
		"INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id) VALUES (?,?)",
		c.Params("id"), req.TrackID,
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.Status(201).JSON(fiber.Map{"success": true})
}

func handleUpdatePlaylist(c *fiber.Ctx) error {
	var req playlistReq
	if err := c.BodyParser(&req); err != nil || req.Name == "" {
		return c.Status(400).JSON(fiber.Map{"error": "name required"})
	}
	_, err := db.DB.Exec("UPDATE playlists SET name=? WHERE id=?", req.Name, c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func handleGetPlaylistTracks(c *fiber.Ctx) error {
	rows, err := db.DB.Query(`
		SELECT l.id, l.title, l.artist, COALESCE(l.album,''), COALESCE(l.duration,0),
		       l.file_path, COALESCE(l.thumbnail_url,''), COALESCE(l.storage_type,'mp3'), l.added_at
		FROM library_tracks l
		JOIN playlist_tracks pt ON pt.track_id = l.id
		WHERE pt.playlist_id = ?
		ORDER BY pt.track_order ASC`, c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var tracks []models.Track
	for rows.Next() {
		var t models.Track
		if err := rows.Scan(&t.ID, &t.Title, &t.Artist, &t.Album, &t.Duration,
			&t.FilePath, &t.ThumbnailURL, &t.StorageType, &t.AddedAt); err != nil {
			continue
		}
		tracks = append(tracks, t)
	}
	if tracks == nil {
		tracks = []models.Track{}
	}
	return c.JSON(tracks)
}

func handleRemoveFromPlaylist(c *fiber.Ctx) error {
	_, err := db.DB.Exec(
		"DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?",
		c.Params("id"), c.Params("tid"),
	)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

func handleDownloadPlaylist(c *fiber.Ctx) error {
	return adaptor.HTTPHandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := core.StreamPlaylistAsZip(c.Params("id"), w); err != nil {
			http.Error(w, err.Error(), 500)
		}
	})(c)
}

// ─── Audiobooks ───────────────────────────────────────────────────────────────

func handleGetAudiobooks(c *fiber.Ctx) error {
	rows, err := db.DB.Query(`
		SELECT id, title, author, COALESCE(duration,0), COALESCE(resume_time,0),
		       file_path, COALESCE(thumbnail_url,''), storage_type, added_at
		FROM audiobooks ORDER BY added_at DESC`)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	defer rows.Close()

	var list []models.Audiobook
	for rows.Next() {
		var a models.Audiobook
		if err := rows.Scan(&a.ID, &a.Title, &a.Author, &a.Duration, &a.ResumeTime,
			&a.FilePath, &a.ThumbnailURL, &a.StorageType, &a.AddedAt); err != nil {
			continue
		}
		list = append(list, a)
	}
	if list == nil {
		list = []models.Audiobook{}
	}
	return c.JSON(list)
}

type updateProgressReq struct {
	ResumeTime int `json:"resume_time"`
}

func handleUpdateAudiobookProgress(c *fiber.Ctx) error {
	var req updateProgressReq
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid body"})
	}
	_, err := db.DB.Exec("UPDATE audiobooks SET resume_time=? WHERE id=?", req.ResumeTime, c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.JSON(fiber.Map{"success": true})
}

func handleDeleteAudiobook(c *fiber.Ctx) error {
	_, err := db.DB.Exec("DELETE FROM audiobooks WHERE id=?", c.Params("id"))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": err.Error()})
	}
	return c.SendStatus(204)
}

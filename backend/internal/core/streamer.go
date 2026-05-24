package core

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"ares-backend/internal/db"
)

// StreamTrack serves the audio file — decompressing on-the-fly if it's a .zip.
// Supports HTTP Range requests so the browser can seek.
func StreamTrack(filePath string, w http.ResponseWriter, r *http.Request) error {
	if strings.HasSuffix(filePath, ".zip") {
		return streamFromZip(filePath, w, r)
	}
	// Plain mp3 — serve directly with range support
	return streamPlain(filePath, w, r)
}

// StreamPlaylistAsZip streams all tracks in a playlist as a single zip file download.
func StreamPlaylistAsZip(playlistID string, w http.ResponseWriter) error {
	var name string
	err := db.DB.QueryRow("SELECT name FROM playlists WHERE id=?", playlistID).Scan(&name)
	if err != nil {
		return fmt.Errorf("playlist not found: %w", err)
	}

	rows, err := db.DB.Query(`
		SELECT l.title, l.artist, l.file_path, l.storage_type
		FROM library_tracks l
		JOIN playlist_tracks pt ON pt.track_id = l.id
		WHERE pt.playlist_id = ?
		ORDER BY pt.track_order ASC`, playlistID)
	if err != nil {
		return err
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "application/zip")
	// Sanitize playlist name for filename
	safeName := strings.ReplaceAll(name, "/", "-")
	safeName = strings.ReplaceAll(safeName, "\"", "")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.zip\"", safeName))

	zw := zip.NewWriter(w)
	defer zw.Close()

	for rows.Next() {
		var title, artist, filePath, storageType string
		if err := rows.Scan(&title, &artist, &filePath, &storageType); err != nil {
			continue
		}

		filename := fmt.Sprintf("%s - %s.mp3", artist, title)
		filename = strings.ReplaceAll(filename, "/", "-")
		filename = strings.ReplaceAll(filename, "\"", "'")

		fw, err := zw.Create(filename)
		if err != nil {
			log.Printf("Failed to create zip entry for %s: %v", filename, err)
			continue
		}

		if storageType == "mp3_zip" {
			if err := copyFromZipToWriter(filePath, fw); err != nil {
				log.Printf("Failed to copy from zip %s: %v", filePath, err)
			}
		} else {
			f, err := os.Open(filePath)
			if err != nil {
				log.Printf("Failed to open file %s: %v", filePath, err)
				continue
			}
			io.Copy(fw, f)
			f.Close()
		}
	}
	return nil
}

func copyFromZipToWriter(zipPath string, w io.Writer) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer zr.Close()
	if len(zr.File) == 0 {
		return fmt.Errorf("empty zip")
	}
	rc, err := zr.File[0].Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	_, err = io.Copy(w, rc)
	return err
}

// streamFromZip decompresses the first file inside the zip to a temp file,
// streams it, then deletes the temp file.
func streamFromZip(zipPath string, w http.ResponseWriter, r *http.Request) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("open zip: %w", err)
	}
	defer zr.Close()

	if len(zr.File) == 0 {
		return fmt.Errorf("empty zip archive")
	}

	zf := zr.File[0] // always one mp3 inside

	// Write to a temp file so we can support HTTP Range (seek)
	tmpFile, err := os.CreateTemp(os.Getenv("TMP_PATH"), "stream_*.mp3")
	if err != nil {
		return fmt.Errorf("create temp: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		tmpFile.Close()
		os.Remove(tmpPath)
		log.Printf("[stream] cleaned up temp file %s", tmpPath)
	}()

	rc, err := zf.Open()
	if err != nil {
		return fmt.Errorf("open zip entry: %w", err)
	}
	if _, err := io.Copy(tmpFile, rc); err != nil {
		rc.Close()
		return fmt.Errorf("decompress: %w", err)
	}
	rc.Close()
	tmpFile.Close()

	return streamPlain(tmpPath, w, r)
}

// streamPlain serves a plain file with Content-Type audio/mpeg and Range support.
func streamPlain(filePath string, w http.ResponseWriter, r *http.Request) error {
	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return err
	}

	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	http.ServeContent(w, r, stat.Name(), stat.ModTime(), f)
	return nil
}

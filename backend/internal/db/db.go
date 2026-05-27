package db

import (
	"ares-backend/internal/models"
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB(dbPath string) {
	var err error
	DB, err = sql.Open("sqlite", dbPath+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	if err = DB.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	DB.SetMaxOpenConns(1) // SQLite: single writer
	createTables()
	log.Println("✅ Database ready at", dbPath)
}

func createTables() {
	query := `
	CREATE TABLE IF NOT EXISTS library_tracks (
		id            TEXT PRIMARY KEY,
		title         TEXT NOT NULL,
		artist        TEXT NOT NULL DEFAULT '',
		album         TEXT NOT NULL DEFAULT '',
		duration      INTEGER NOT NULL DEFAULT 0,
		file_path     TEXT NOT NULL UNIQUE,
		thumbnail_url TEXT NOT NULL DEFAULT '',
		storage_type  TEXT NOT NULL DEFAULT 'mp3',
		added_at      DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS downloads (
		id           TEXT PRIMARY KEY,
		source_url   TEXT NOT NULL,
		title        TEXT NOT NULL DEFAULT '',
		artist       TEXT NOT NULL DEFAULT '',
		status       TEXT NOT NULL DEFAULT 'pending',
		source       TEXT NOT NULL DEFAULT 'ytdlp',
		progress     REAL NOT NULL DEFAULT 0,
		file_path    TEXT NOT NULL DEFAULT '',
		error        TEXT NOT NULL DEFAULT '',
		created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
		completed_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS playlists (
		id            TEXT PRIMARY KEY,
		name          TEXT NOT NULL,
		source_url    TEXT NOT NULL DEFAULT '',
		thumbnail_url TEXT NOT NULL DEFAULT '',
		created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS playlist_tracks (
		playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
		track_id    TEXT NOT NULL REFERENCES library_tracks(id) ON DELETE CASCADE,
		track_order INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY(playlist_id, track_id)
	);

	CREATE TABLE IF NOT EXISTS audiobooks (
		id            TEXT PRIMARY KEY,
		title         TEXT NOT NULL,
		author        TEXT NOT NULL DEFAULT '',
		duration      INTEGER NOT NULL DEFAULT 0,
		file_path     TEXT NOT NULL UNIQUE,
		thumbnail_url TEXT NOT NULL DEFAULT '',
		storage_type  TEXT NOT NULL DEFAULT 'mp3',
		resume_time   INTEGER NOT NULL DEFAULT 0,
		added_at      DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
	CREATE INDEX IF NOT EXISTS idx_tracks_added ON library_tracks(added_at DESC);
	CREATE INDEX IF NOT EXISTS idx_audiobooks_added ON audiobooks(added_at DESC);
	`
	if _, err := DB.Exec(query); err != nil {
		log.Fatalf("createTables: %v", err)
	}

	// Safely add new columns to existing playlists table if they don't exist
	_ = addColumnIfNotExists("playlists", "source_url", "TEXT NOT NULL DEFAULT ''")
	_ = addColumnIfNotExists("playlists", "thumbnail_url", "TEXT NOT NULL DEFAULT ''")
}

func addColumnIfNotExists(table, column, def string) error {
	_, err := DB.Exec("ALTER TABLE " + table + " ADD COLUMN " + column + " " + def)
	return err // Ignore error, as SQLite will return an error if column already exists
}

// --- Audiobook CRUD operations ---

func InsertAudiobook(a *models.Audiobook) error {
	_, err := DB.Exec(`
		INSERT INTO audiobooks (id, title, author, duration, file_path, thumbnail_url, storage_type, resume_time, added_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		a.ID, a.Title, a.Author, a.Duration, a.FilePath, a.ThumbnailURL, a.StorageType, a.ResumeTime, a.AddedAt,
	)
	return err
}

func GetAudiobooks() ([]models.Audiobook, error) {
	rows, err := DB.Query("SELECT id, title, author, duration, file_path, thumbnail_url, storage_type, resume_time, added_at FROM audiobooks ORDER BY added_at DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var books []models.Audiobook
	for rows.Next() {
		var a models.Audiobook
		if err := rows.Scan(&a.ID, &a.Title, &a.Author, &a.Duration, &a.FilePath, &a.ThumbnailURL, &a.StorageType, &a.ResumeTime, &a.AddedAt); err != nil {
			continue
		}
		books = append(books, a)
	}
	return books, nil
}

func UpdateAudiobookProgress(id string, resumeTime int) error {
	_, err := DB.Exec("UPDATE audiobooks SET resume_time = ? WHERE id = ?", resumeTime, id)
	return err
}

func DeleteAudiobook(id string) error {
	_, err := DB.Exec("DELETE FROM audiobooks WHERE id = ?", id)
	return err
}

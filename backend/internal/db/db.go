package db

import (
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
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS playlist_tracks (
		playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
		track_id    TEXT NOT NULL REFERENCES library_tracks(id) ON DELETE CASCADE,
		track_order INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY(playlist_id, track_id)
	);

	CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status);
	CREATE INDEX IF NOT EXISTS idx_tracks_added ON library_tracks(added_at DESC);
	`
	if _, err := DB.Exec(query); err != nil {
		log.Fatalf("createTables: %v", err)
	}
}

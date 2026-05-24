package main

import (
	"ares-backend/internal/api"
	"ares-backend/internal/core"
	"ares-backend/internal/db"
	"log"
	"os"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
)

func main() {
	// Initialize Database
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "ares.db"
	}
	db.InitDB(dbPath)

	// Start Download Workers
	downloadsPath := os.Getenv("DOWNLOADS_PATH")
	if downloadsPath == "" {
		downloadsPath = "./downloads"
	}
	
	// Create channels and start goroutines for concurrent downloads
	core.StartDownloadWorkers(3, downloadsPath, api.BroadcastDownloadProgress)

	// Setup Fiber App
	app := fiber.New()

	app.Use(cors.New())

	// Setup Routes and WebSockets
	api.SetupRoutes(app)

	// Serve downloaded audio files
	app.Group("/api").Static("/files", downloadsPath)

	// Start Server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Starting Ares Backend on port %s...", port)
	log.Fatal(app.Listen(":" + port))
}

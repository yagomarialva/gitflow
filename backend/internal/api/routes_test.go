package api

import (
	"ares-backend/internal/db"
	"encoding/json"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gofiber/fiber/v2"
)

func TestSearchAPI(t *testing.T) {
	app := fiber.New()
	SetupRoutes(app)

	req := httptest.NewRequest("GET", "/api/search?q=metallica", nil)
	resp, err := app.Test(req, 10000) // 10 seconds timeout because it hits external API

	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Fatalf("Expected status code 200, got %d", resp.StatusCode)
	}

	var results []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&results); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(results) == 0 {
		t.Fatalf("Expected search results from iTunes, got empty array. Check your internet connection or iTunes API status.")
	}
	
	// Check if it has the required fields
	first := results[0]
	if first["title"] == "" || first["source_url"] == "" {
		t.Fatalf("Missing required fields in search result: %v", first)
	}
}

func TestLibraryAPI(t *testing.T) {
	app := fiber.New()
	SetupRoutes(app)

	// Setup dummy DB for test
	db.InitDB("test_ares.db")
	defer os.Remove("test_ares.db")

	req := httptest.NewRequest("GET", "/api/library", nil)
	resp, err := app.Test(req)

	if err != nil {
		t.Fatalf("Failed to execute request: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Fatalf("Expected status code 200, got %d", resp.StatusCode)
	}
}

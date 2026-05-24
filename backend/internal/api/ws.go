package api

import (
	"ares-backend/internal/models"
	"log"
	"sync"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/websocket/v2"
)

var (
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
)

// WsHandler upgrades the connection to WebSocket
func WsHandler(c *fiber.Ctx) error {
	if websocket.IsWebSocketUpgrade(c) {
		c.Locals("allowed", true)
		return c.Next()
	}
	return fiber.ErrUpgradeRequired
}

// HandleConnections manages individual WS connections
func HandleConnections(c *websocket.Conn) {
	clientsMu.Lock()
	clients[c] = true
	clientsMu.Unlock()

	log.Println("New WebSocket client connected")

	defer func() {
		clientsMu.Lock()
		delete(clients, c)
		clientsMu.Unlock()
		c.Close()
		log.Println("WebSocket client disconnected")
	}()

	for {
		// Read message (we might not need to read, just write, but we must read to detect disconnects)
		_, _, err := c.ReadMessage()
		if err != nil {
			break
		}
	}
}

type WsMessage struct {
	Event   string      `json:"event"`
	Payload interface{} `json:"payload"`
}

// BroadcastDownloadProgress sends download updates to all connected clients
func BroadcastDownloadProgress(dl *models.Download) {
	clientsMu.Lock()
	defer clientsMu.Unlock()

	msg := WsMessage{
		Event:   "download_progress",
		Payload: dl,
	}
	
	if dl.Status == "completed" {
		msg.Event = "download_completed"
	}

	for client := range clients {
		err := client.WriteJSON(msg)
		if err != nil {
			log.Printf("Error writing to WS client: %v", err)
			client.Close()
			delete(clients, client)
		}
	}
}

# ─── Stage 1: Go Builder ─────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
# CGO disabled — using modernc pure-Go sqlite, no C compiler needed
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/ares-backend

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM alpine:3.20

# ── System tools ──────────────────────────────────────────────────────────────
RUN apk --no-cache add \
    ca-certificates \
    tzdata \
    sqlite-libs \
    # ── chromedp / Chromium headless deps ───────────────────────────────────
    chromium \
    chromium-chromedriver \
    nss \
    freetype \
    harfbuzz \
    ttf-freefont \
    font-noto-emoji \
    # ── yt-dlp + ffmpeg for download pipeline ───────────────────────────────
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    && pip3 install --break-system-packages yt-dlp \
    && yt-dlp --version

# ── Chromium environment for chromedp ─────────────────────────────────────────
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV CHROMEDP_NO_SANDBOX=true

# ── Non-root user ─────────────────────────────────────────────────────────────
RUN adduser -D -u 1001 ares

WORKDIR /app

COPY --from=builder /app/server .

RUN mkdir -p /app/data /app/downloads /app/tmp \
    && chown -R ares:ares /app

USER ares

EXPOSE 8080

CMD ["./server"]

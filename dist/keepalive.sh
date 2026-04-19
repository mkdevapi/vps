#!/bin/bash

# VPS Pro Keep Alive Script
# Pings the specified URLs to prevent the service from sleeping on Render's free tier

# URLs to ping (update these with your actual Render deployment URLs)
URLS=(
    "https://vps-pro-xxxx.onrender.com/"
    "https://vps-pro-yyyy.onrender.com/"
)

# Interval between pings (in seconds)
# 3 minutes = 180 seconds (Render free tier sleeps after 15 min of inactivity)
INTERVAL=180

echo "=========================================="
echo "VPS Pro Keep Alive Service"
echo "=========================================="
echo "Interval: ${INTERVAL} seconds"
echo "Starting keep alive pings..."
echo ""

# Function to ping a URL
ping_url() {
    local url="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Try curl with timeout
    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$url" 2>/dev/null)

    if [ "$response" = "200" ] || [ "$response" = "301" ] || [ "$response" = "302" ]; then
        echo "[$timestamp] ✓ Ping successful: $url (HTTP $response)"
        return 0
    else
        echo "[$timestamp] ✗ Ping failed: $url (HTTP $response)"
        return 1
    fi
}

# Main loop
while true; do
    echo "-------------------------------------------"
    echo "Keep alive ping at $(date '+%Y-%m-%d %H:%M:%S')"
    echo "-------------------------------------------"

    for url in "${URLS[@]}"; do
        # Skip empty URLs
        if [ -n "$url" ]; then
            ping_url "$url"
        fi
    done

    echo ""
    echo "Next ping in ${INTERVAL} seconds..."
    echo ""

    # Wait for the next interval
    sleep "$INTERVAL"
done

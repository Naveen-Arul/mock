#!/bin/bash

# =============================================================================
# Docker Build Script with Network Error Handling
# =============================================================================
# This script builds Docker images with retry logic for network errors

set -e

echo "========================================="
echo "MockMentorBiz - Robust Docker Build"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

MAX_RETRIES=3
RETRY_DELAY=10

build_with_retry() {
    local service=$1
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        echo -e "${YELLOW}Building $service (attempt $attempt/$MAX_RETRIES)...${NC}"

        if docker-compose build $service; then
            echo -e "${GREEN}✓ $service built successfully${NC}"
            return 0
        else
            if [ $attempt -lt $MAX_RETRIES ]; then
                echo -e "${RED}✗ Build failed. Retrying in ${RETRY_DELAY}s...${NC}"
                sleep $RETRY_DELAY

                # Clean up Docker build cache for this service
                echo "Cleaning Docker build cache..."
                docker builder prune -f --filter "label=stage=$service" 2>/dev/null || true

                attempt=$((attempt + 1))
            else
                echo -e "${RED}✗ Failed to build $service after $MAX_RETRIES attempts${NC}"
                return 1
            fi
        fi
    done
}

# Check if Docker is running
echo "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}ERROR: Docker is not running${NC}"
    echo "Please start Docker Desktop and try again"
    exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}ERROR: .env file not found${NC}"
    echo "Please create .env from .env.example"
    exit 1
fi
echo -e "${GREEN}✓ .env file found${NC}"
echo ""

# Build services one by one with retry logic
echo "Building services (this may take 10-15 minutes)..."
echo ""

# Build backend
echo "1/2 Building backend..."
if ! build_with_retry "backend"; then
    echo -e "${RED}Failed to build backend${NC}"
    echo ""
    echo "Troubleshooting tips:"
    echo "1. Check your internet connection"
    echo "2. Try again in a few minutes (repository mirrors may be temporarily down)"
    echo "3. Increase Docker memory to 8GB+ in Settings → Resources"
    echo "4. Run: docker system prune -a (clears all Docker cache)"
    exit 1
fi
echo ""

# Build frontend
echo "2/2 Building frontend..."
if ! build_with_retry "frontend"; then
    echo -e "${RED}Failed to build frontend${NC}"
    exit 1
fi
echo ""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ All services built successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Starting services..."
docker-compose up -d

echo ""
echo "Waiting for services to be ready..."
sleep 10

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}✅ MockMentorBiz is running!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo "Access your application at:"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo ""
echo "To view logs: docker-compose logs -f"
echo "To stop:      docker-compose down"

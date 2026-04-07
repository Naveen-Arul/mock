#!/bin/bash

# =============================================================================
# MockMentorBiz - Docker Startup Script
# =============================================================================
# This script starts the MockMentorBiz application using Docker Compose
# It handles potential memory issues by building services sequentially
# =============================================================================

set -e  # Exit on error

echo "========================================="
echo "MockMentorBiz - Docker Startup"
echo "========================================="
echo ""

# Check if Docker is running
echo "✓ Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running. Please start Docker Desktop and try again."
    exit 1
fi
echo "✓ Docker is running"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create .env from .env.example and configure your API keys."
    exit 1
fi
echo "✓ .env file found"
echo ""

# Check if required directories exist
echo "✓ Checking required files..."
if [ ! -d "database" ]; then
    echo "❌ Error: database/ folder not found!"
    exit 1
fi
if [ ! -f "database/schema.sql" ]; then
    echo "❌ Error: database/schema.sql not found!"
    exit 1
fi
if [ ! -f "frontend/package.json" ]; then
    echo "❌ Error: frontend/package.json not found!"
    exit 1
fi
echo "✓ All required files present"
echo ""

# Function to show help
show_help() {
    echo "Usage: ./docker-start.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --build    Force rebuild of all images"
    echo "  --clean    Stop and remove all containers, volumes, and images"
    echo "  --logs     Show logs after starting"
    echo "  --help     Show this help message"
    echo ""
}

# Parse arguments
BUILD_FLAG=""
LOGS_FLAG=""

for arg in "$@"; do
    case $arg in
        --build)
            BUILD_FLAG="--build"
            ;;
        --clean)
            echo "🧹 Cleaning up old containers and volumes..."
            docker-compose down -v --remove-orphans
            echo "✓ Cleanup complete"
            echo ""
            ;;
        --logs)
            LOGS_FLAG="yes"
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo "❌ Unknown option: $arg"
            show_help
            exit 1
            ;;
    esac
done

# Start services
echo "🚀 Starting MockMentorBiz services..."
echo ""
echo "This may take a few minutes on first run..."
echo ""

if [ -n "$BUILD_FLAG" ]; then
    echo "📦 Building services sequentially to avoid memory issues..."
    echo ""

    # Build MySQL (uses base image, no build needed)
    echo "1/3 Preparing MySQL..."
    docker-compose pull mysql || true
    echo ""

    # Build backend
    echo "2/3 Building backend (this may take a while)..."
    docker-compose build backend
    echo ""

    # Build frontend
    echo "3/3 Building frontend (this may take a while)..."
    docker-compose build frontend
    echo ""

    echo "✓ All services built successfully"
    echo ""
fi

# Start all services
echo "🔄 Starting all services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

# Wait for MySQL
echo "Waiting for MySQL..."
timeout=60
counter=0
until docker-compose exec -T mysql mysqladmin ping -h localhost -u mmb_user -pmmb_pass --silent 2>/dev/null || [ $counter -eq $timeout ]; do
    printf '.'
    sleep 1
    counter=$((counter + 1))
done

if [ $counter -eq $timeout ]; then
    echo ""
    echo "⚠️  Warning: MySQL health check timed out"
    echo "Check logs with: docker-compose logs mysql"
else
    echo ""
    echo "✓ MySQL is ready"
fi

# Wait for backend
echo "Waiting for backend..."
counter=0
until curl -f http://localhost:8000/health > /dev/null 2>&1 || [ $counter -eq $timeout ]; do
    printf '.'
    sleep 1
    counter=$((counter + 1))
done

if [ $counter -eq $timeout ]; then
    echo ""
    echo "⚠️  Warning: Backend health check timed out"
    echo "Check logs with: docker-compose logs backend"
else
    echo ""
    echo "✓ Backend is ready"
fi

echo ""
echo "========================================="
echo "✅ MockMentorBiz is running!"
echo "========================================="
echo ""
echo "Access your application at:"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo ""
echo "MySQL Connection:"
echo "  Host:      localhost:3307"
echo "  User:      mmb_user"
echo "  Password:  mmb_pass"
echo "  Database:  mockmentorbiz"
echo ""
echo "Useful commands:"
echo "  View logs:         docker-compose logs -f"
echo "  Stop services:     docker-compose down"
echo "  Restart services:  docker-compose restart"
echo ""

if [ -n "$LOGS_FLAG" ]; then
    echo "Showing logs (Ctrl+C to exit)..."
    echo ""
    docker-compose logs -f
fi

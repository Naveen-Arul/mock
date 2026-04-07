@echo off
REM =============================================================================
REM Docker Build Script with Network Error Handling (Windows)
REM =============================================================================

setlocal enabledelayedexpansion

echo =========================================
echo MockMentorBiz - Robust Docker Build
echo =========================================
echo.

set MAX_RETRIES=3
set RETRY_DELAY=10

REM Check if Docker is running
echo Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running
    echo Please start Docker Desktop and try again
    exit /b 1
)
echo OK: Docker is running
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found
    echo Please create .env from .env.example
    exit /b 1
)
echo OK: .env file found
echo.

echo Building services (this may take 10-15 minutes^)...
echo.

REM Build backend with retry
echo 1/2 Building backend...
set /a attempt=1
:retry_backend
echo Attempt !attempt!/%MAX_RETRIES%...
docker-compose build backend
if errorlevel 1 (
    if !attempt! lss %MAX_RETRIES% (
        echo Build failed. Retrying in %RETRY_DELAY% seconds...
        timeout /t %RETRY_DELAY% /nobreak >nul
        echo Cleaning Docker build cache...
        docker builder prune -f >nul 2>&1
        set /a attempt+=1
        goto retry_backend
    ) else (
        echo ERROR: Failed to build backend after %MAX_RETRIES% attempts
        echo.
        echo Troubleshooting tips:
        echo 1. Check your internet connection
        echo 2. Try again in a few minutes (repository mirrors may be temporarily down^)
        echo 3. Increase Docker memory to 8GB+ in Settings -^> Resources
        echo 4. Run: docker system prune -a (clears all Docker cache^)
        exit /b 1
    )
)
echo OK: Backend built successfully
echo.

REM Build frontend with retry
echo 2/2 Building frontend...
set /a attempt=1
:retry_frontend
echo Attempt !attempt!/%MAX_RETRIES%...
docker-compose build frontend
if errorlevel 1 (
    if !attempt! lss %MAX_RETRIES% (
        echo Build failed. Retrying in %RETRY_DELAY% seconds...
        timeout /t %RETRY_DELAY% /nobreak >nul
        docker builder prune -f >nul 2>&1
        set /a attempt+=1
        goto retry_frontend
    ) else (
        echo ERROR: Failed to build frontend after %MAX_RETRIES% attempts
        exit /b 1
    )
)
echo OK: Frontend built successfully
echo.

echo =========================================
echo All services built successfully!
echo =========================================
echo.
echo Starting services...
docker-compose up -d

echo.
echo Waiting for services to be ready...
timeout /t 10 /nobreak >nul

echo.
echo =========================================
echo MockMentorBiz is running!
echo =========================================
echo.
echo Access your application at:
echo   Frontend:  http://localhost:5173
echo   Backend:   http://localhost:8000
echo   API Docs:  http://localhost:8000/docs
echo.
echo To view logs: docker-compose logs -f
echo To stop:      docker-compose down
echo.

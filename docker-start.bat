@echo off
REM =============================================================================
REM MockMentorBiz - Docker Startup Script (Windows)
REM =============================================================================

echo =========================================
echo MockMentorBiz - Docker Startup
echo =========================================
echo.

REM Check if Docker is running
echo Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Please start Docker Desktop and try again.
    exit /b 1
)
echo OK: Docker is running
echo.

REM Check if .env exists
if not exist .env (
    echo ERROR: .env file not found!
    echo Please create .env from .env.example and configure your API keys.
    exit /b 1
)
echo OK: .env file found
echo.

REM Check required files
echo Checking required files...
if not exist database\schema.sql (
    echo ERROR: database\schema.sql not found!
    exit /b 1
)
if not exist frontend\package.json (
    echo ERROR: frontend\package.json not found!
    exit /b 1
)
echo OK: All required files present
echo.

REM Parse arguments
set BUILD_FLAG=
set CLEAN_FLAG=
set LOGS_FLAG=

:parse_args
if "%~1"=="" goto start_services
if /i "%~1"=="--build" set BUILD_FLAG=--build
if /i "%~1"=="--clean" set CLEAN_FLAG=yes
if /i "%~1"=="--logs" set LOGS_FLAG=yes
if /i "%~1"=="--help" goto show_help
shift
goto parse_args

:show_help
echo Usage: docker-start.bat [OPTIONS]
echo.
echo Options:
echo   --build    Force rebuild of all images
echo   --clean    Stop and remove all containers, volumes, and images
echo   --logs     Show logs after starting
echo   --help     Show this help message
echo.
exit /b 0

:start_services
if "%CLEAN_FLAG%"=="yes" (
    echo Cleaning up old containers and volumes...
    docker-compose down -v --remove-orphans
    echo OK: Cleanup complete
    echo.
)

echo Starting MockMentorBiz services...
echo.
echo This may take a few minutes on first run...
echo.

if "%BUILD_FLAG%"=="--build" (
    echo Building services sequentially to avoid memory issues...
    echo.

    echo 1/3 Preparing MySQL...
    docker-compose pull mysql
    echo.

    echo 2/3 Building backend (this may take a while^)...
    docker-compose build backend
    if errorlevel 1 (
        echo ERROR: Backend build failed!
        echo Try increasing Docker memory in Docker Desktop Settings -^> Resources
        exit /b 1
    )
    echo.

    echo 3/3 Building frontend (this may take a while^)...
    docker-compose build frontend
    if errorlevel 1 (
        echo ERROR: Frontend build failed!
        exit /b 1
    )
    echo.

    echo OK: All services built successfully
    echo.
)

echo Starting all services...
docker-compose up -d
if errorlevel 1 (
    echo ERROR: Failed to start services!
    echo Check Docker Desktop and try again.
    exit /b 1
)

echo.
echo Waiting for services to be healthy...
echo Please wait...
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
echo MySQL Connection:
echo   Host:      localhost:3307
echo   User:      mmb_user
echo   Password:  mmb_pass
echo   Database:  mockmentorbiz
echo.
echo Useful commands:
echo   View logs:         docker-compose logs -f
echo   Stop services:     docker-compose down
echo   Restart services:  docker-compose restart
echo.

if "%LOGS_FLAG%"=="yes" (
    echo Showing logs (Ctrl+C to exit^)...
    echo.
    docker-compose logs -f
)

exit /b 0

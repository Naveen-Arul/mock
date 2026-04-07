#!/usr/bin/env pwsh
# =============================================================================
# MockMentorBiz - Docker Quick Start Script (Windows PowerShell)
# =============================================================================
# This script automates the entire Docker setup process.
# Usage: .\docker-quickstart.ps1 [dev|prod|clean]
# =============================================================================

param(
    [Parameter(Position=0)]
    [ValidateSet("dev", "prod", "clean")]
    [string]$Mode = "dev"
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info  { Write-Host $args[0] -ForegroundColor Cyan }
function Write-Success { Write-Host $args[0] -ForegroundColor Green }
function Write-Warning { Write-Host $args[0] -ForegroundColor Yellow }
function Write-Error-Custom { Write-Host $args[0] -ForegroundColor Red }

# =============================================================================
# Step 1: Check Docker is running
# =============================================================================
Write-Info "Checking Docker..."
try {
    $dockerVersion = docker --version
    Write-Success "✓ Docker installed: $dockerVersion"
} catch {
    Write-Error-Custom "✗ Docker is not installed or not running!"
    Write-Warning "Please install Docker Desktop from https://www.docker.com/products/docker-desktop"
    exit 1
}

# Check if Docker daemon is running
try {
    docker ps | Out-Null
    Write-Success "✓ Docker daemon is running"
} catch {
    Write-Error-Custom "✗ Docker daemon is not responding!"
    Write-Warning "Please start Docker Desktop application"
    exit 1
}

# =============================================================================
# Step 2: Check .env file exists
# =============================================================================
Write-Info "Checking environment configuration..."
if (-not (Test-Path ".env")) {
    Write-Warning ".env file not found!"
    
    if (Test-Path ".env.example") {
        Write-Info "Creating .env from .env.example..."
        Copy-Item ".env.example" ".env"
        Write-Success "✓ Created .env file"
        Write-Warning "⚠ Please edit .env and add your API keys before continuing!"
        
        $continue = Read-Host "Continue anyway? (y/n)"
        if ($continue -ne "y") {
            exit 0
        }
    } else {
        Write-Error-Custom "✗ .env.example not found either!"
        exit 1
    }
} else {
    Write-Success "✓ .env file found"
}

# =============================================================================
# Step 3: Validate critical environment variables
# =============================================================================
Write-Info "Validating environment variables..."

$envContent = Get-Content ".env"
$ownerSeedEnabled = $envContent -match "^OWNER_SEED_ON_STARTUP=true"

if (-not $ownerSeedEnabled) {
    Write-Warning "Owner seeding is disabled in .env"
    Write-Warning "You won't be able to login on first run!"
    Write-Warning "Enable it by setting OWNER_SEED_ON_STARTUP=true in .env"
    
    $enable = Read-Host "Enable owner seeding now? (y/n)"
    if ($enable -eq "y") {
        # Update .env
        $newContent = $envContent | ForEach-Object {
            if ($_ -match "^OWNER_SEED_ON_STARTUP=") {
                "OWNER_SEED_ON_STARTUP=true"
            } elseif ($_ -match "^OWNER_SEED_EMAIL=") {
                "OWNER_SEED_EMAIL=owner@platform.com"
            } elseif ($_ -match "^OWNER_SEED_USERNAME=") {
                "OWNER_SEED_USERNAME=platform_owner"
            } elseif ($_ -match "^OWNER_SEED_PASSWORD=") {
                "OWNER_SEED_PASSWORD=Owner@123456"
            } elseif ($_ -match "^OWNER_SEED_FULL_NAME=") {
                "OWNER_SEED_FULL_NAME=Platform Owner"
            } else {
                $_
            }
        }
        $newContent | Set-Content ".env"
        Write-Success "✓ Updated .env with owner seed configuration"
    }
}

# =============================================================================
# Step 4: Stop existing containers
# =============================================================================
Write-Info "Stopping existing containers (if any)..."
docker compose down 2>$null
Write-Success "✓ Cleaned up existing containers"

# =============================================================================
# Step 5: Build and start containers based on mode
# =============================================================================
if ($Mode -eq "clean") {
    Write-Warning "Removing all volumes (this will delete all data!)..."
    docker compose down -v
    Write-Success "✓ Volumes removed"
    exit 0
}

if ($Mode -eq "prod") {
    Write-Info "Starting PRODUCTION mode..."
    Write-Warning "This will build the production stack with nginx."
    
    $composeFile = "docker-compose.prod.yml"
    
    # Check if prod compose file exists
    if (-not (Test-Path $composeFile)) {
        Write-Error-Custom "✗ $composeFile not found!"
        exit 1
    }
    
    Write-Info "Building production images (this may take 5-10 minutes)..."
    docker compose -f $composeFile up --build -d
} else {
    Write-Info "Starting DEVELOPMENT mode..."
    Write-Info "This will build dev containers with hot-reload enabled."
    
    Write-Info "Building and starting services..."
    docker compose up --build -d
}

# =============================================================================
# Step 6: Wait for services to be healthy
# =============================================================================
Write-Info ""
Write-Info "Waiting for services to become healthy..."
Write-Info "This may take 2-3 minutes on first run (MySQL initialization)..."
Write-Info ""

$maxAttempts = 30
$attempt = 0
$healthy = $false

while ($attempt -lt $maxAttempts -and -not $healthy) {
    $attempt++
    Write-Host "." -NoNewline
    
    try {
        # Check if all containers are running
        $containers = docker compose ps --format json | ConvertFrom-Json
        
        $allHealthy = $true
        foreach ($container in $containers) {
            if ($container.Health -ne "healthy" -and $container.Health -ne "") {
                $allHealthy = $false
                break
            }
        }
        
        if ($allHealthy) {
            $healthy = $true
        }
    } catch {
        # Containers might not be ready yet
    }
    
    if (-not $healthy) {
        Start-Sleep -Seconds 5
    }
}

Write-Info ""

if ($healthy) {
    Write-Success "✓ All services are healthy!"
} else {
    Write-Warning "⚠ Some services may still be starting up..."
    Write-Warning "Check status with: docker compose ps"
}

# =============================================================================
# Step 7: Display access information
# =============================================================================
Write-Info ""
Write-Info "═══════════════════════════════════════════════════════"
Write-Success "  🎉 MockMentorBiz is now running!"
Write-Info "═══════════════════════════════════════════════════════"
Write-Info ""

if ($Mode -eq "prod") {
    Write-Info "  Frontend (Production):  http://localhost"
    Write-Info "  Backend API:            http://localhost:8000"
    Write-Info "  API Documentation:      http://localhost:8000/docs"
} else {
    Write-Info "  Frontend (Development): http://localhost:5173"
    Write-Info "  Backend API:            http://localhost:8000"
    Write-Info "  API Documentation:      http://localhost:8000/docs"
}

Write-Info ""
Write-Info "  Default Login:"
Write-Info "    Email:    owner@platform.com"
Write-Info "    Password: Owner@123456"
Write-Info ""
Write-Info "═══════════════════════════════════════════════════════"
Write-Info ""

# =============================================================================
# Step 8: Show logs option
# =============================================================================
$showLogs = Read-Host "Show live logs? (y/n)"
if ($showLogs -eq "y") {
    Write-Info "Attaching to container logs (Ctrl+C to detach)..."
    docker compose logs -f
}

# =============================================================================
# Step 9: Final status check
# =============================================================================
Write-Info ""
Write-Info "Container Status:"
docker compose ps

Write-Info ""
Write-Info "Useful commands:"
Write-Info "  View logs:           docker compose logs -f"
Write-Info "  Stop services:       docker compose down"
Write-Info "  Restart services:    docker compose restart"
Write-Info "  Rebuild:             docker compose up --build"
Write-Info "  Complete reset:      docker compose down -v"
Write-Info ""
Write-Success "Done!"

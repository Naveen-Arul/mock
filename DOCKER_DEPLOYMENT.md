# 🐳 MockMentorBiz - Docker Deployment Guide

## ⚠️ IMPORTANT: Read Before Running

This guide ensures error-free Docker deployment. Follow ALL steps carefully.

---

## 📋 Pre-Requisites

1. **Docker Desktop** installed and running (Windows)
2. **Git** (optional, for cloning)
3. **At least 4GB free RAM** for containers
4. **No local MySQL** required (Docker handles it)

---

## 🚀 Quick Start (Development Mode)

### Step 1: Configure Environment Variables

The `.env` file has been pre-configured with defaults. **Review and update if needed:**

```bash
# AI API Keys (REQUIRED for AI features)
GROQ_API_KEY=your-actual-key-here
ELEVENLABS_API_KEY=your-tts-key-here

# Owner Account (auto-created on first run)
OWNER_SEED_ON_STARTUP=true  # Keep this TRUE for first startup
OWNER_SEED_EMAIL=owner@platform.com
OWNER_SEED_PASSWORD=Owner@123456  # Change this!
```

### Step 2: Start All Services

```powershell
docker compose up --build
```

**What this does:**
- ✅ Builds MySQL 8 container (port 3307)
- ✅ Builds FastAPI backend (port 8000)
- ✅ Builds Vite frontend dev server (port 5173)
- ✅ Initializes database schema automatically
- ✅ Creates platform owner account

### Step 3: Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

**Default Login:**
- Email: `owner@platform.com`
- Password: `Owner@123456`

---

## 🛠️ Production Deployment

### Option A: Build Locally (Recommended for Testing)

```powershell
# Build and run production stack
docker compose -f docker-compose.prod.yml up --build -d

# View logs
docker compose -f docker-compose.prod.yml logs -f

# Stop
docker compose -f docker-compose.prod.yml down
```

**Access**: http://localhost (port 80)

### Option B: Use Pre-built Images (For Deployment)

If images are published to Docker Hub:

```powershell
docker compose -f docker-compose.hub.yml up -d
```

---

## 🔧 Troubleshooting Common Issues

### Issue 1: Backend Won't Connect to MySQL

**Error**: `Can't connect to MySQL server on 'mysql:3306'`

**Solution**:
```powershell
# Check MySQL is healthy
docker ps | findstr mysql

# View MySQL logs
docker logs mockmentorbiz-mysql

# Restart MySQL only
docker restart mockmentorbiz-mysql
```

**Wait Time**: MySQL can take 30-60 seconds to initialize on first run.

---

### Issue 2: Frontend Can't Reach Backend

**Error**: `Network Error` or `CORS Error` in browser console

**Cause**: Frontend is trying to reach backend at wrong URL

**Solution**:
1. Check `.env` has correct values:
   ```bash
   VITE_API_BASE_URL=http://localhost:8000
   VITE_WS_BASE_URL=ws://localhost:8000
   ```

2. In development mode, frontend proxy should work automatically.

3. In production, nginx handles proxying - no config needed.

---

### Issue 3: No Users Can Login

**Problem**: Database is empty, no accounts exist

**Solution**: Enable owner seeding in `.env`:

```bash
OWNER_SEED_ON_STARTUP=true
OWNER_SEED_EMAIL=owner@platform.com
OWNER_SEED_USERNAME=platform_owner
OWNER_SEED_PASSWORD=YourSecurePassword123!
OWNER_SEED_FULL_NAME=Platform Owner
```

Then restart:
```powershell
docker restart mockmentorbiz-backend
```

Check logs:
```powershell
docker logs mockmentorbiz-backend | findstr "Seeded"
```

Should show: `✅ Seeded platform owner: owner@platform.com`

---

### Issue 4: Port Already in Use

**Error**: `Bind for 0.0.0.0:8000 failed: port is already occupied`

**Solutions**:

**Option A**: Stop conflicting services
```powershell
# Find what's using port 8000
netstat -ano | findstr :8000

# Kill the process (replace PID)
taskkill /PID <PID> /F
```

**Option B**: Change Docker ports
Edit `docker-compose.yml`:
```yaml
ports:
  - "8001:8000"  # Use 8001 instead of 8000
```

---

### Issue 5: Docker Build Fails

**Error**: `failed to solve: failed to compute cache key`

**Solution**:
```powershell
# Clean Docker cache
docker system prune -a

# Rebuild without cache
docker compose up --build --no-cache
```

---

### Issue 6: MySQL Container Exits Immediately

**Check logs**:
```powershell
docker logs mockmentorbiz-mysql
```

**Common causes**:
1. **Port conflict**: Another MySQL running on port 3307
2. **Volume permission**: Windows file permissions on volume mounts
3. **Memory**: Not enough RAM allocated to Docker

**Fix**:
```powershell
# Remove old container
docker rm -f mockmentorbiz-mysql

# Remove volume (WARNING: deletes data!)
docker volume rm mockmentorbiz_mysql_data

# Restart
docker compose up -d mysql
```

---

## 📊 Container Architecture

```
┌─────────────────────────────────────────┐
│         Docker Network                  │
│                                         │
│  ┌──────────────┐                      │
│  │   MySQL 8    │ Port 3306 (internal) │
│  │  (Database)  │ Exposed: 3307        │
│  └──────┬───────┘                      │
│         │                               │
│  ┌──────▼───────┐                      │
│  │   FastAPI    │ Port 8000 (internal) │
│  │   Backend    │ Exposed: 8000        │
│  └──────┬───────┘                      │
│         │                               │
│  ┌──────▼───────┐                      │
│  │  Nginx/Vite  │ Port 80/5173         │
│  │   Frontend   │ Exposed: 80/5173     │
│  └──────────────┘                      │
└─────────────────────────────────────────┘
```

---

## 🔐 Security Best Practices

### For Production:

1. **Change all default passwords** in `.env`:
   ```bash
   MYSQL_ROOT_PASSWORD=use-strong-random-password
   MYSQL_PASSWORD=use-strong-random-password
   SECRET_KEY=generate-new-64-character-hex-string
   JWT_SECRET=generate-new-random-string
   ```

2. **Disable debug features**:
   ```bash
   ENVIRONMENT=production
   DEBUG_MODE=false
   LOG_LEVEL=warn
   ```

3. **Don't expose MySQL port** in production:
   ```yaml
   # Remove or comment out in docker-compose.prod.yml
   # ports:
   #   - "3307:3306"
   ```

4. **Use HTTPS** with reverse proxy (nginx/traefik)

5. **Set proper CORS origins**:
   ```bash
   CORS_ORIGINS=https://yourdomain.com
   ```

---

## 📦 Data Persistence

**Volumes created:**
- `mockmentorbiz_mysql_data` - Database files
- `mockmentorbiz_uploads_data` - Student resumes, recordings

**To backup data:**
```powershell
# Backup MySQL
docker exec mockmentorbiz-mysql mysqldump -u root -pmmb_root mockmentorbiz > backup.sql

# Backup uploads
docker run --rm -v mockmentorbiz_uploads_data:/data -v ${PWD}:/backup ubuntu tar czf /backup/uploads.tar.gz /data
```

**To reset everything:**
```powershell
docker compose down -v  # Removes volumes too!
docker compose up --build
```

---

## 🎯 Development Workflow

### Hot Reload

Both backend and frontend support hot reload in development mode:

- **Backend**: Changes to `.py` files auto-reload via uvicorn --reload
- **Frontend**: Changes to `.tsx/.ts` files auto-reload via Vite HMR

**No need to rebuild containers!** Just edit files in:
- `backend/` directory
- `frontend/src/` directory

### Adding Dependencies

**Backend**:
```powershell
# Add to requirements.txt
echo "new-package==1.0.0" >> backend/requirements.txt

# Rebuild backend
docker compose up --build backend
```

**Frontend**:
```powershell
# Install package
docker exec -it mockmentorbiz-frontend npm install package-name

# Or add to package.json and rebuild
docker compose up --build frontend
```

---

## 🧪 Testing

### Run Backend Tests (if available)
```powershell
docker exec -it mockmentorbiz-backend pytest
```

### Check Health Endpoints
```powershell
# Backend health
curl http://localhost:8000/health

# Frontend (should return index.html)
curl http://localhost:5173
```

---

## 📝 Environment Variables Reference

### Required for AI Features:
```bash
GROQ_API_KEY=sk-...       # Question generation, evaluation
ELEVENLABS_API_KEY=...    # Text-to-speech
WHISPER_MODEL=whisper-large-v3.en  # Speech-to-text
```

### Optional:
```bash
OPENAI_API_KEY=sk-...     # Alternative AI provider
MURF_API_KEY=...          # Alternative TTS
```

### Platform Settings:
```bash
SECRET_KEY=64-char-hex-string
JWT_SECRET=random-string
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

---

## 🆘 Getting Help

### Check Logs
```powershell
# All services
docker compose logs -f

# Specific service
docker logs -f mockmentorbiz-backend
docker logs -f mockmentorbiz-frontend
docker logs -f mockmentorbiz-mysql
```

### Inspect Containers
```powershell
# Enter backend shell
docker exec -it mockmentorbiz-backend /bin/bash

# Enter MySQL CLI
docker exec -it mockmentorbiz-mysql mysql -ummb_user -pmmb_pass mockmentorbiz
```

### View Resource Usage
```powershell
docker stats
```

---

## ✅ Success Checklist

Before declaring deployment successful:

- [ ] MySQL container is healthy (`docker ps` shows "healthy")
- [ ] Backend logs show "Application startup complete"
- [ ] Frontend loads at http://localhost:5173 (dev) or http://localhost (prod)
- [ ] Can login with owner credentials
- [ ] API docs accessible at http://localhost:8000/docs
- [ ] No error messages in browser console
- [ ] Database tables created (check via MySQL CLI)

---

## 🔄 Updating Existing Deployment

### Update Code Only (Keep Data)
```powershell
# Pull latest changes (if using git)
git pull

# Rebuild and restart
docker compose up --build -d

# Or for production
docker compose -f docker-compose.prod.yml up --build -d
```

### Complete Reset (Lose All Data)
```powershell
docker compose down -v
docker compose up --build
```

---

**Last Updated**: March 2026  
**Version**: 1.0.0

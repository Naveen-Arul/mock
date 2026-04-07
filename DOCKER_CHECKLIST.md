# ✅ Docker Deployment Checklist

Use this checklist to ensure error-free Docker deployment.

---

## 📋 Pre-Deployment Checklist

### System Requirements
- [ ] Docker Desktop installed and running
- [ ] At least 4GB free RAM available
- [ ] Ports 8000, 5173, 3307 available (or willing to change)
- [ ] Windows PowerShell (for scripts) or Docker CLI access

### Configuration Files
- [ ] `.env` file exists in root directory
- [ ] API keys added to `.env` (GROQ_API_KEY, ELEVENLABS_API_KEY)
- [ ] `OWNER_SEED_ON_STARTUP=true` in `.env`
- [ ] Owner credentials set in `.env`:
  - [ ] OWNER_SEED_EMAIL
  - [ ] OWNER_SEED_USERNAME
  - [ ] OWNER_SEED_PASSWORD (strong password)
  - [ ] OWNER_SEED_FULL_NAME

### Code Review
- [ ] `docker-compose.yml` frontend service uses `image: node:20-alpine` (not build target)
- [ ] Database schema files exist in `database/` folder
- [ ] Backend `requirements.txt` is complete
- [ ] Frontend `package.json` has all dependencies

---

## 🚀 Deployment Steps

### Step 1: Choose Deployment Mode

**Development Mode** (Recommended for first-time setup):
- ✅ Hot-reload enabled
- ✅ Easy debugging
- ✅ Source code mounted

**Production Mode** (For live deployment):
- ✅ Optimized nginx serving
- ✅ Single entry point (port 80)
- ✅ No hot-reload

### Step 2: Start Containers

#### Option A: Using Quick Start Script
```powershell
# Development
.\docker-quickstart.ps1 dev

# Production
.\docker-quickstart.ps1 prod
```

#### Option B: Manual Docker Compose
```powershell
# Development
docker compose up --build

# Production
docker compose -f docker-compose.prod.yml up --build -d
```

### Step 3: Wait for Initialization

⏱️ **Expected Times:**
- MySQL initialization: 30-60 seconds
- Backend startup: 10-20 seconds
- Frontend build: 30-60 seconds (first time only)
- **Total**: 2-3 minutes on first run

**Monitor Progress:**
```powershell
docker compose logs -f
```

**Look for these success messages:**
- MySQL: `ready for connections`
- Backend: `Application startup complete` + `✅ Seeded platform owner`
- Frontend: `ready in X ms`

---

## ✅ Verification Checklist

### Container Health
```powershell
docker compose ps
```

Expected output:
```
NAME                        STATUS                    PORTS
mockmentorbiz-mysql         Up (healthy)             3306/tcp, 0.0.0.0:3307->3306/tcp
mockmentorbiz-backend       Up (healthy)             0.0.0.0:8000->8000/tcp
mockmentorbiz-frontend      Up                       0.0.0.0:5173->5173/tcp
```

### Backend Health Check
```powershell
curl http://localhost:8000/health
```

Expected response:
```json
{
  "status": "healthy",
  "message": "MockMentorBiz API is running"
}
```

### Frontend Loads
Open browser: http://localhost:5173 (dev) or http://localhost (prod)

Expected: Login page should load

### API Documentation Accessible
Open browser: http://localhost:8000/docs

Expected: Swagger UI with API endpoints

### Database Initialized
```powershell
docker exec mockmentorbiz-mysql mysql -ummb_user -pmmb_pass -e "USE mockmentorbiz; SHOW TABLES;"
```

Expected: List of tables (users, admins, interviews, etc.)

### Owner Account Created
Check backend logs:
```powershell
docker logs mockmentorbiz-backend | findstr "Seeded"
```

Expected: `✅ Seeded platform owner: owner@platform.com`

### Login Test
1. Navigate to frontend URL
2. Login with:
   - Email: `owner@platform.com`
   - Password: Your configured `OWNER_SEED_PASSWORD`
3. Expected: Successfully login to dashboard

---

## 🔧 Troubleshooting Checklist

If something fails, check these in order:

### 1. Docker Daemon Running
```powershell
docker ps
```
✅ Should list running containers

### 2. Sufficient Resources
```powershell
docker stats
```
✅ CPU < 80%, Memory < 90%

### 3. Port Conflicts
```powershell
netstat -ano | findstr :8000
netstat -ano | findstr :5173
netstat -ano | findstr :3307
```
✅ No conflicts (or change ports in compose file)

### 4. Environment Variables Loaded
```powershell
docker exec mockmentorbiz-backend env | findstr GROQ
docker exec mockmentorbiz-backend env | findstr DATABASE
```
✅ Variables match your `.env` file

### 5. MySQL Connection
```powershell
docker logs mockmentorbiz-mysql | Select-String -Pattern "error|Error|ERROR" -Context 2
```
✅ No error messages

### 6. Backend Database Connection
```powershell
docker logs mockmentorbiz-backend | Select-String -Pattern "Can't connect" -Context 2
```
✅ No connection errors

### 7. Frontend Build Errors
```powershell
docker logs mockmentorbiz-frontend
```
✅ No TypeScript/build errors

---

## 🎯 Post-Deployment Tasks

### Immediate Actions

1. **Change Default Password** (if using seed):
   ```bash
   # Login and change password via UI
   ```

2. **Test Core Features**:
   - [ ] Create a test student account
   - [ ] Upload a resume
   - [ ] Start a mock interview
   - [ ] Test AI features (question generation)
   - [ ] Test voice recording (if enabled)

3. **Configure Production Settings** (if going live):
   - [ ] Update `SECRET_KEY` and `JWT_SECRET`
   - [ ] Set `ENVIRONMENT=production`
   - [ ] Configure SSL/TLS certificates
   - [ ] Restrict `CORS_ORIGINS`
   - [ ] Hide MySQL port (comment out in compose)

### Monitoring Setup

```powershell
# Continuous monitoring
docker compose logs -f

# Resource usage
docker stats

# Disk space
docker system df
```

### Backup Strategy

```powershell
# Create MySQL backup
docker exec mockmentorbiz-mysql mysqldump -u root -pmmb_root mockmentorbiz > backup_$(Get-Date -Format "yyyyMMdd_HHmmss").sql

# Backup uploads
docker run --rm -v mockmentorbiz_uploads_data:/data -v ${PWD}:/backup ubuntu tar czf /backup/uploads_$(Get-Date -Format "yyyyMMdd_HHmmss").tar.gz /data
```

---

## 🔄 Update Procedures

### Update Code Only (Keep Data)
```powershell
# Pull latest changes
git pull

# Rebuild and restart
docker compose up --build -d

# Monitor
docker compose logs -f
```

### Complete Reset (Lose All Data)
```powershell
docker compose down -v
docker compose up --build
```

### Update Dependencies
```powershell
# Backend
docker compose build --no-cache backend
docker compose up -d backend

# Frontend
docker compose build --no-cache frontend
docker compose up -d frontend
```

---

## 📊 Success Metrics

Your deployment is successful when:

### Technical Metrics
- [ ] All containers show "Up (healthy)" status
- [ ] Backend responds to `/health` endpoint
- [ ] Frontend loads without errors
- [ ] MySQL accepts connections
- [ ] No error messages in logs
- [ ] CPU usage < 50% at idle
- [ ] Memory usage stable

### User Experience Metrics
- [ ] Login works with seeded credentials
- [ ] Dashboard loads
- [ ] Can navigate between pages
- [ ] Can upload files
- [ ] AI features respond (if keys configured)
- [ ] No console errors in browser
- [ ] Page load time < 2 seconds

### Security Metrics
- [ ] JWT tokens are being issued
- [ ] Passwords are hashed in database
- [ ] CORS headers present
- [ ] Non-root users in containers
- [ ] No sensitive data in logs

---

## 🆘 Emergency Procedures

### If Backend Crashes
```powershell
# Check logs
docker logs mockmentorbiz-backend

# Restart
docker restart mockmentorbiz-backend

# Rebuild if needed
docker compose up -d --build backend
```

### If MySQL Crashes
```powershell
# Check logs
docker logs mockmentorbiz-mysql

# Restart
docker restart mockmentorbiz-mysql

# If data corrupted, restore from backup
docker compose down -v
docker compose up -d mysql
# Then restore from SQL dump
```

### If Frontend Shows Blank Page
```powershell
# Check build logs
docker logs mockmentorbiz-frontend

# Rebuild
docker compose up -d --build frontend

# Clear browser cache and reload
```

### If All Else Fails
```powershell
# Nuclear option: complete reset
docker compose down -v
docker system prune -a

# Rebuild everything
docker compose up --build
```

---

## 📞 Support Resources

### Documentation
- [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) - Full deployment guide
- [DOCKER_ANALYSIS_REPORT.md](DOCKER_ANALYSIS_REPORT.md) - Detailed analysis
- [README.md](README.md) - Project overview

### Logs
```powershell
# All services
docker compose logs -f

# Specific service
docker logs -f mockmentorbiz-backend

# Last 100 lines
docker logs --tail 100 mockmentorbiz-mysql
```

### Interactive Debugging
```powershell
# Enter backend container
docker exec -it mockmentorbiz-backend /bin/bash

# Enter MySQL CLI
docker exec -it mockmentorbiz-mysql mysql -ummb_user -pmmb_pass mockmentorbiz

# Inspect network
docker network inspect mockmentorbiz-network
```

---

## ✅ Final Sign-Off

Before marking deployment as complete:

- [ ] All verification steps passed
- [ ] Login test successful
- [ ] Core features tested
- [ ] Monitoring in place
- [ ] Backup strategy implemented
- [ ] Team trained on basic operations
- [ ] Documentation reviewed and accessible

**Deployment Date**: _______________  
**Deployed By**: _______________  
**Mode**: ☐ Development ☐ Production  
**Notes**: _______________

---

**Status**: ✅ READY FOR DEPLOYMENT  
**Last Updated**: March 16, 2026

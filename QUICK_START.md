# 🚀 MockMentorBiz - Docker Quick Start
$env:SECRET_KEY='296dcfe87f74ca893b473fe1e4e8f93964ada2c40e628b7ab48700fcb9404663'
$env:DATABASE_URL='sqlite:///E:/PROJECT/mock-mentor/mockmentorbiz/backend/mockmentorbiz.db'
$env:AUTO_CREATE_DB='false'
$env:OWNER_SEED_ON_STARTUP='false'
& e:/PROJECT/mock-mentor/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir e:/PROJECT/mock-mentor/mockmentorbiz/backend --host 0.0.0.0 --port 8000 --reload

## ✅ **Improved Build with Network Error Handling**

Your Docker setup now includes automatic retry logic for network errors!

---

## 🎯 **Recommended: Use Build Scripts**

These scripts handle network errors automatically with retry logic:

### **Windows:**
```batch
cd mockmentorbiz
build-docker.bat
```

### **Linux/Mac:**
```bash
cd mockmentorbiz
chmod +x build-docker.sh
./build-docker.sh
```

---

## 📋 **Alternative: Manual Build**

If you prefer manual control:

```bash
cd mockmentorbiz

# Clean Docker cache (if you had previous errors)
docker system prune -f

# Build with retry
docker-compose up --build
```

---

## 🔧 **Network Error Solutions**

If you see **403 Forbidden** or **Hash Sum mismatch** errors:

### Solution 1: Build Services Separately
```bash
# Build backend
docker-compose build backend

# If backend fails, wait 2-3 minutes and retry
docker-compose build backend

# Build frontend
docker-compose build frontend

# Start all services
docker-compose up
```

### Solution 2: Clean Docker Cache
```bash
# Remove all Docker build cache
docker system prune -a

# Try building again
docker-compose up --build
```

### Solution 3: Wait and Retry
Debian mirror issues are usually temporary. Wait 5-10 minutes and try again.

### Solution 4: Use Pre-built Images (Coming Soon)
We're working on publishing pre-built images to Docker Hub.

---

## ⚙️ **Docker Memory Settings**

**IMPORTANT**: Set Docker memory to at least **8GB**

1. Open **Docker Desktop**
2. Go to **Settings → Resources**
3. Set **Memory** to **8 GB** or more
4. Set **Swap** to **2 GB**
5. Click **Apply & Restart**

---

## 🌐 **Access After Starting**

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5173 |
| **Backend API** | http://localhost:8000 |
| **API Docs** | http://localhost:8000/docs |
| **MySQL** | localhost:3307 (user: mmb_user, pass: mmb_pass) |

---

## 🎓 **First Time Setup**

### 1. Create Platform Owner

Edit `.env`:
```bash
OWNER_SEED_ON_STARTUP=true
OWNER_SEED_EMAIL=owner@platform.com
OWNER_SEED_USERNAME=platform_owner
OWNER_SEED_PASSWORD=ChangeMe123!
OWNER_SEED_FULL_NAME=Platform Owner
```

Restart backend:
```bash
docker-compose restart backend
```

### 2. Login & Create Accounts

- Owner login: http://localhost:5173/owner/login
- Create Super Admin (college)
- Super Admin creates Department Admins
- Students register at: http://localhost:5173/register

---

## 🐛 **Common Issues**

### Backend Build Fails with 403/Network Errors

**Cause**: Debian repository network issues (temporary)

**Solutions**:
1. Use `build-docker.bat` (has automatic retries)
2. Wait 5-10 minutes and try again
3. Clean cache: `docker system prune -a`
4. Build services separately (see above)

### Frontend Build Fails - npm errors

**Cause**: Missing package-lock.json dependencies

**Solution**: Should be auto-fixed with `npm install`
- If fails, run: `docker-compose build frontend --no-cache`

### Port Already in Use

**Solution**: Change ports in `docker-compose.yml`
```yaml
ports:
  - "3308:3306"  # MySQL (was 3307)
  - "8001:8000"  # Backend (was 8000)
  - "5174:5173"  # Frontend (was 5173)
```

### Out of Memory During Build

**Solution**:
1. Increase Docker memory to 8GB+ (see above)
2. Close other applications
3. Build services one at a time

---

## 🔄 **Useful Commands**

```bash
# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend

# Restart a service
docker-compose restart backend

# Stop all services
docker-compose down

# Stop and remove all data (fresh start)
docker-compose down -v

# Clean all Docker cache
docker system prune -a

# Check service status
docker-compose ps
```

---

## 📊 **Build Time Expectations**

| Service | First Build | Subsequent Builds |
|---------|------------|-------------------|
| MySQL | 1-2 min | Instant (cached) |
| Backend | 5-10 min | 1-2 min |
| Frontend | 3-7 min | 1-2 min |
| **Total** | **10-20 min** | **2-5 min** |

---

## ✅ **Success Indicators**

When everything works, you'll see:

```
mockmentorbiz-mysql     | ready for connections
mockmentorbiz-backend   | INFO: Uvicorn running on http://0.0.0.0:8000
mockmentorbiz-frontend  | VITE ... ready in ... ms
mockmentorbiz-frontend  | ➜  Local:   http://localhost:5173/
```

---

## 🆘 **Still Having Issues?**

1. **Check Docker memory**: Must be 8GB+
2. **Check internet connection**: Needed for package downloads
3. **Wait and retry**: Mirror issues are usually temporary
4. **Clean everything**: `docker system prune -a && docker-compose up --build`
5. **Build separately**: Follow "Solution 1" under Network Error Solutions

---

## 🎉 **You're Ready!**

Once built, your AI-powered mock interview platform is ready to use!

Visit http://localhost:5173 to get started.

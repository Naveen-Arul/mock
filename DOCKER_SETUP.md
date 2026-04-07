# MockMentorBiz - Docker Setup Guide

## ✅ Prerequisites Completed

All necessary files have been created for Docker deployment:

1. **Database Files** ✓
   - `database/schema.sql` - Complete database schema with all tables
   - `database/seed_users.sql` - Seed data file (minimal, uses app logic)

2. **Frontend Files** ✓
   - `frontend/package.json` - All required npm dependencies
   - `frontend/package-lock.json` - Lock file for consistent builds

3. **Environment Configuration** ✓
   - `.env` - Environment variables configured for Docker

## 🚀 Quick Start with Docker

### Option 1: Using Docker Compose (Recommended)

```bash
cd mockmentorbiz
docker-compose up --build
```

This will start:
- **MySQL** on port 3307 (to avoid conflicts with local MySQL)
- **Backend API** on port 8000
- **Frontend Dev Server** on port 5173

### Option 2: Production Build

```bash
cd mockmentorbiz
docker-compose -f docker-compose.prod.yml up --build
```

This will start:
- **MySQL** on port 3307
- **Backend API** on port 8000
- **Nginx** serving frontend on port 80

## 📋 Important Notes

### 1. API Keys Required

For full functionality, update these in `.env`:

```bash
OPENAI_API_KEY=your-actual-openai-key
GROQ_API_KEY=your-actual-groq-key
```

Get keys from:
- OpenAI: https://platform.openai.com/api-keys
- Groq: https://console.groq.com/keys

### 2. Security Secrets

**⚠️ IMPORTANT**: Before deploying to production, change these values in `.env`:

```bash
SECRET_KEY=your-secure-random-string-here
JWT_SECRET=your-secure-jwt-secret-here
SUPER_ADMIN_SECRET=your-super-admin-secret-here
OWNER_BOOTSTRAP_SECRET=your-owner-bootstrap-secret-here
```

Generate secure secrets:
```bash
# On Linux/Mac
openssl rand -hex 32

# On Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### 3. Docker Memory Settings

If you encounter memory allocation errors during build:

**Docker Desktop Settings:**
1. Open Docker Desktop
2. Go to Settings → Resources
3. Increase Memory to at least **8 GB**
4. Increase Swap to at least **2 GB**
5. Click "Apply & Restart"

## 🔧 Troubleshooting

### Issue: Docker build fails with "cannot allocate memory"

**Solution:**
1. Close other applications to free up memory
2. Increase Docker memory allocation (see above)
3. Build stages separately:

```bash
# Build backend only first
docker-compose build backend

# Then build frontend
docker-compose build frontend

# Finally start all services
docker-compose up
```

### Issue: Port already in use

**Solution:**
Change ports in `docker-compose.yml`:
- MySQL: Change `3307:3306` to another port like `3308:3306`
- Backend: Change `8000:8000` to another port like `8001:8000`
- Frontend: Change `5173:5173` to another port like `5174:5173`

### Issue: Database connection refused

**Solution:**
```bash
# Check MySQL is healthy
docker-compose ps

# View MySQL logs
docker-compose logs mysql

# Restart services
docker-compose restart
```

## 📝 Access Points

Once running:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **MySQL**: localhost:3307
  - User: `mmb_user`
  - Password: `mmb_pass`
  - Database: `mockmentorbiz`

## 🎯 First Time Setup

### 1. Create Platform Owner (Developer Only)

Option A: Auto-seed on first startup (recommended for dev):

In `.env`, set:
```bash
OWNER_SEED_ON_STARTUP=true
OWNER_SEED_EMAIL=owner@platform.com
OWNER_SEED_USERNAME=platform_owner
OWNER_SEED_PASSWORD=StrongPassword123!
OWNER_SEED_FULL_NAME=Platform Owner
```

Option B: Bootstrap via API:
```bash
curl -X POST "http://localhost:8000/api/owner/bootstrap-owner" \
  -H "X-Owner-Secret: dev-owner-secret-change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "owner@platform.com",
    "username": "platform_owner",
    "password": "StrongPassword123!",
    "full_name": "Platform Owner"
  }'
```

### 2. Login as Owner

Visit: http://localhost:5173/owner/login

### 3. Create Super Admin (College)

From Owner Dashboard: http://localhost:5173/owner

Create a super admin for your college.

### 4. Create Department Admin

Login as Super Admin, then go to Admin Management to create department admins.

### 5. Register Students

Students can register at: http://localhost:5173/register

They'll need the department admin's unique ID.

## 🐳 Docker Commands Cheat Sheet

```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# Stop services
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v

# View logs
docker-compose logs -f

# View specific service logs
docker-compose logs -f backend

# Rebuild services
docker-compose up --build

# Restart a service
docker-compose restart backend

# Execute command in running container
docker-compose exec backend bash
docker-compose exec mysql mysql -u mmb_user -pmmb_pass mockmentorbiz

# Check service status
docker-compose ps

# Remove all containers and images (full cleanup)
docker-compose down --rmi all -v
```

## 📊 Database Management

### Connect to MySQL

```bash
# Via docker-compose
docker-compose exec mysql mysql -u mmb_user -pmmb_pass mockmentorbiz

# Via host (port 3307)
mysql -h 127.0.0.1 -P 3307 -u mmb_user -pmmb_pass mockmentorbiz
```

### Backup Database

```bash
docker-compose exec mysql mysqldump -u mmb_user -pmmb_pass mockmentorbiz > backup.sql
```

### Restore Database

```bash
docker-compose exec -T mysql mysql -u mmb_user -pmmb_pass mockmentorbiz < backup.sql
```

## 🔄 Development Workflow

### Hot Reload is Enabled

Both frontend and backend support hot reload:

- **Backend**: Edit files in `backend/` → auto-reloads
- **Frontend**: Edit files in `frontend/src/` → auto-reloads in browser

### Access Logs

```bash
# All logs
docker-compose logs -f

# Backend only
docker-compose logs -f backend

# Frontend only
docker-compose logs -f frontend

# MySQL only
docker-compose logs -f mysql
```

## ✅ Verification Checklist

- [ ] Docker Desktop is running
- [ ] Docker has at least 8GB memory allocated
- [ ] All files created successfully:
  - [ ] `database/schema.sql`
  - [ ] `database/seed_users.sql`
  - [ ] `frontend/package.json`
  - [ ] `frontend/package-lock.json`
  - [ ] `.env` (configured with your API keys)
- [ ] Ports 3307, 5173, and 8000 are available
- [ ] API keys added to `.env` (or features will be limited)
- [ ] Security secrets changed in `.env` (for production)

## 🎉 Success!

If you see:
```
mockmentorbiz-mysql     | ... ready for connections
mockmentorbiz-backend   | INFO:     Uvicorn running on http://0.0.0.0:8000
mockmentorbiz-frontend  | VITE ... ready in ... ms
mockmentorbiz-frontend  | ➜  Local:   http://localhost:5173/
```

Your application is **ready**! Open http://localhost:5173 to get started.

## 💡 Next Steps

1. Create platform owner account (see First Time Setup above)
2. Login and create Super Admin for your college
3. Super Admin creates department admins
4. Students register using admin ID
5. Start conducting mock interviews!

## 📞 Support

If you encounter issues:
1. Check Docker Desktop is running and has enough resources
2. Review logs: `docker-compose logs -f`
3. Ensure ports are not in use: `netstat -ano | findstr "3307 5173 8000"`
4. Try clean restart: `docker-compose down -v && docker-compose up --build`

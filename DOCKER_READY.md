# 🚀 MockMentorBiz - Docker Setup Complete!

## ✅ All Files Created Successfully

All missing files have been created and the project is ready to run with Docker!

### Created Files:

1. **Database Files**
   - ✅ `database/schema.sql` - Complete MySQL schema with all tables
   - ✅ `database/seed_users.sql` - Seed data configuration

2. **Frontend Files**
   - ✅ `frontend/package.json` - All npm dependencies configured
   - ✅ `frontend/package-lock.json` - Dependency lock file

3. **Configuration Files**
   - ✅ `.env` - Environment variables with sensible defaults
   - ✅ `DOCKER_SETUP.md` - Comprehensive setup guide
   - ✅ `docker-start.sh` - Linux/Mac startup script
   - ✅ `docker-start.bat` - Windows startup script

## 🎯 How to Run

### Quick Start (Windows):

```batch
cd mockmentorbiz
docker-start.bat --build
```

### Quick Start (Linux/Mac):

```bash
cd mockmentorbiz
chmod +x docker-start.sh
./docker-start.sh --build
```

### Manual Start:

```bash
cd mockmentorbiz
docker-compose up --build
```

## ⚙️ Important Configuration

### 1. API Keys (Required for Full Functionality)

Edit `.env` and add your API keys:

```bash
OPENAI_API_KEY=your-real-openai-key-here
GROQ_API_KEY=your-real-groq-key-here
```

**Get keys from:**
- OpenAI: https://platform.openai.com/api-keys
- Groq: https://console.groq.com/keys

### 2. Docker Memory Settings

If build fails with memory errors:

1. Open **Docker Desktop**
2. Go to **Settings** → **Resources**
3. Set **Memory** to at least **8 GB**
4. Set **Swap** to at least **2 GB**
5. Click **Apply & Restart**

### 3. Security (Production)

Before deploying to production, change these in `.env`:

```bash
SECRET_KEY=<generate-secure-random-string>
JWT_SECRET=<generate-secure-random-string>
SUPER_ADMIN_SECRET=<generate-secure-random-string>
OWNER_BOOTSTRAP_SECRET=<generate-secure-random-string>
```

Generate secure secrets:
```bash
# Linux/Mac
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

## 📋 Access Points

Once running:

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **MySQL**: localhost:3307
  - User: `mmb_user`
  - Password: `mmb_pass`
  - Database: `mockmentorbiz`

## 🎓 First Time Setup

### Step 1: Create Platform Owner

#### Option A: Auto-seed (Recommended for Development)

In `.env`, set:
```bash
OWNER_SEED_ON_STARTUP=true
OWNER_SEED_EMAIL=owner@platform.com
OWNER_SEED_USERNAME=platform_owner
OWNER_SEED_PASSWORD=ChangeMe123!
OWNER_SEED_FULL_NAME=Platform Owner
```

Then restart:
```bash
docker-compose restart backend
```

#### Option B: Bootstrap via API

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

### Step 2: Login as Owner

Visit: http://localhost:5173/owner/login

### Step 3: Create Super Admin (College)

From Owner Dashboard, create a super admin for your college.

### Step 4: Create Department Admin

Login as Super Admin, create department admins.

### Step 5: Register Students

Students register at: http://localhost:5173/register using admin ID.

## 🔧 Common Commands

```bash
# Start services
docker-compose up

# Start in background
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f

# Restart a service
docker-compose restart backend

# Clean slate (removes all data!)
docker-compose down -v

# Rebuild and start
docker-compose up --build
```

## 📊 Database Access

```bash
# Connect to MySQL via Docker
docker-compose exec mysql mysql -u mmb_user -pmmb_pass mockmentorbiz

# Connect from host
mysql -h 127.0.0.1 -P 3307 -u mmb_user -pmmb_pass mockmentorbiz

# Backup database
docker-compose exec mysql mysqldump -u mmb_user -pmmb_pass mockmentorbiz > backup.sql

# Restore database
docker-compose exec -T mysql mysql -u mmb_user -pmmb_pass mockmentorbiz < backup.sql
```

## 🐛 Troubleshooting

### Build fails with "cannot allocate memory"

**Solution:**
1. Increase Docker memory (see Docker Memory Settings above)
2. Close other applications
3. Build services one at a time:
   ```bash
   docker-compose build backend
   docker-compose build frontend
   docker-compose up
   ```

### Port already in use

**Solution:**
Change ports in `docker-compose.yml`:
- MySQL: `"3308:3306"` instead of `"3307:3306"`
- Backend: `"8001:8000"` instead of `"8000:8000"`
- Frontend: `"5174:5173"` instead of `"5173:5173"`

### Database connection refused

**Solution:**
```bash
# Check service status
docker-compose ps

# View MySQL logs
docker-compose logs mysql

# Restart MySQL
docker-compose restart mysql
```

### Frontend not loading

**Solution:**
```bash
# Check frontend logs
docker-compose logs frontend

# Rebuild frontend
docker-compose up --build frontend
```

## ✅ Verification Checklist

- [ ] Docker Desktop is running
- [ ] Docker memory set to at least 8GB
- [ ] All files created (check list above)
- [ ] `.env` file configured with API keys
- [ ] Ports 3307, 5173, 8000 are available
- [ ] Services start without errors
- [ ] Frontend accessible at http://localhost:5173
- [ ] Backend accessible at http://localhost:8000
- [ ] API docs accessible at http://localhost:8000/docs

## 📚 Documentation

- `DOCKER_SETUP.md` - Detailed Docker setup guide
- `README.md` - Project overview and features
- `SETUP.md` - Manual installation guide
- `.env.example` - Environment variable template

## 🎉 Success Indicators

When everything is working, you should see:

```
mockmentorbiz-mysql     | ... ready for connections
mockmentorbiz-backend   | INFO:     Uvicorn running on http://0.0.0.0:8000
mockmentorbiz-frontend  | VITE ... ready in ... ms
mockmentorbiz-frontend  | ➜  Local:   http://localhost:5173/
```

## 🚀 Next Steps

1. ✅ Start the services using the startup script
2. ✅ Create platform owner account
3. ✅ Login and create Super Admin
4. ✅ Create department admins
5. ✅ Register students
6. ✅ Start conducting mock interviews!

## 💡 Tips

- **Hot Reload**: Both frontend and backend support hot reload - edit files and see changes instantly
- **Logs**: Use `docker-compose logs -f servicename` to debug issues
- **Clean Start**: Use `docker-compose down -v` for a fresh database
- **Performance**: Close unnecessary applications if build is slow
- **Backup**: Regularly backup your database in production

## 📞 Support Resources

- Check logs: `docker-compose logs -f`
- Validate config: `docker-compose config`
- Check services: `docker-compose ps`
- Docker docs: https://docs.docker.com/
- FastAPI docs: http://localhost:8000/docs (when running)

---

**🎯 Your application is ready to run! Follow the Quick Start steps above to get started.**

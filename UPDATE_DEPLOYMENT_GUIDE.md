# 🔄 Fluxfeed Update & Deployment Guide

## Quick Reference: How to Update Your Live Website

---

## 📦 **Frontend Updates (Vercel - Auto Deploy)**

### Steps:
1. Make changes in VS Code
2. Test locally: `npm run dev`
3. Commit and push to GitHub:
   ```powershell
   git add .
   git commit -m "feat: description of your changes"
   git push origin main
   ```
4. ✅ **Vercel auto-deploys in 1-2 minutes!**

### Monitor Deployment:
- Visit: https://vercel.com/dashboard
- Your site updates at: `https://fluxfeed.news`

---

## 🖥️ **Backend Updates (DigitalOcean - Manual Deploy)**

### Steps:

#### **1. Local Development:**
```powershell
# Make your changes in VS Code
# Test locally
npm run server

# Commit and push
git add .
git commit -m "fix: backend update description"
git push origin main
```

#### **2. Deploy to Server:**
```powershell
# SSH into droplet
ssh root@206.189.66.139

# Navigate to project
cd /var/www/fluxfeed-api

# Pull latest code
git pull origin main

# Install new dependencies (if package.json changed)
npm install

# Restart the API server
pm2 restart fluxfeed-api

# Check logs to verify it's working
pm2 logs fluxfeed-api --lines 30

# Exit SSH
exit
```

---

## 🔧 **Update Environment Variables (.env)**

### On DigitalOcean Droplet:

```bash
# SSH into server
ssh root@206.189.66.139

# Navigate to project
cd /var/www/fluxfeed-api

# Edit .env file
nano .env

# Make your changes
# Save: Ctrl+X, then Y, then Enter

# Restart PM2 to apply changes
pm2 restart fluxfeed-api

# Verify changes took effect
pm2 logs fluxfeed-api --lines 20

# Exit
exit
```

### On Vercel (Frontend ENV):

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Update `VITE_API_URL` or add new variables
5. **Redeploy** the project (Deployments → Click "..." → Redeploy)

---

## 📋 **Common Update Scenarios**

### **Scenario 1: Fix a Bug in Frontend**
```powershell
# Fix the bug in VS Code
git add .
git commit -m "fix: resolve issue with navbar"
git push origin main
# Done! Vercel auto-deploys ✅
```

### **Scenario 2: Add New API Endpoint**
```powershell
# Add endpoint in server/routes/*.ts
git add .
git commit -m "feat: add new analytics endpoint"
git push origin main

# SSH and deploy
ssh root@206.189.66.139
cd /var/www/fluxfeed-api
git pull origin main
pm2 restart fluxfeed-api
pm2 logs fluxfeed-api --lines 20
exit
```

### **Scenario 3: Update Both Frontend + Backend**
```powershell
# Make changes to both
git add .
git commit -m "feat: add new feature across stack"
git push origin main

# Frontend auto-deploys via Vercel ✅

# Deploy backend manually
ssh root@206.189.66.139
cd /var/www/fluxfeed-api
git pull origin main
npm install
pm2 restart fluxfeed-api
exit
```

### **Scenario 4: Database Schema Change**
```powershell
# Create migration script (e.g., migrations/add-new-column.js)
git add .
git commit -m "db: add user preferences table"
git push origin main

# SSH into droplet
ssh root@206.189.66.139
cd /var/www/fluxfeed-api
git pull origin main

# Run migration
node migrations/add-new-column.js

# Restart API
pm2 restart fluxfeed-api
exit
```

---

## 🚨 **Troubleshooting Commands**

### Check Backend Status:
```bash
ssh root@206.189.66.139
pm2 status
pm2 logs fluxfeed-api --lines 50
```

### Check Nginx Status:
```bash
ssh root@206.189.66.139
systemctl status nginx
nginx -t
```

### Restart Everything:
```bash
ssh root@206.189.66.139
pm2 restart fluxfeed-api
systemctl restart nginx
```

### View Error Logs:
```bash
ssh root@206.189.66.139
pm2 logs fluxfeed-api --err --lines 100
tail -f /var/log/nginx/error.log
```

---

## 🔑 **Important File Locations**

| What | Location |
|------|----------|
| Backend Code | `/var/www/fluxfeed-api/` |
| Environment Variables | `/var/www/fluxfeed-api/.env` |
| Nginx Config | `/etc/nginx/sites-available/fluxfeed-api` |
| SSL Certificates | `/etc/letsencrypt/live/api.fluxfeed.news/` |
| PM2 Logs | `/root/.pm2/logs/` |

---

## 🌐 **Your Live URLs**

| Service | URL | Hosting |
|---------|-----|---------|
| Frontend (Landing) | https://fluxfeed.news | Vercel |
| Frontend (App) | https://app.fluxfeed.news | Vercel |
| Backend API | https://api.fluxfeed.news | DigitalOcean |
| Database | PostgreSQL | DigitalOcean Managed DB |

---

## 💡 **Pro Tips**

✅ **Always test locally before deploying**
- Frontend: `npm run dev`
- Backend: `npm run server`
- Full stack: `npm run dev:all`

✅ **Use descriptive commit messages**
- `feat:` for new features
- `fix:` for bug fixes
- `chore:` for maintenance
- `docs:` for documentation

✅ **Check logs after deployment**
```bash
pm2 logs fluxfeed-api --lines 30
```

✅ **Monitor your droplet**
- CPU/Memory usage in DigitalOcean dashboard
- Set up alerts for high resource usage

✅ **Backup before major changes**
- Database: Use DigitalOcean automated backups
- Code: Git commits are your backup!

---

## 🆘 **Emergency Rollback**

### If something breaks after deployment:

#### **Frontend (Vercel):**
1. Go to Vercel dashboard → Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"

#### **Backend (DigitalOcean):**
```bash
ssh root@206.189.66.139
cd /var/www/fluxfeed-api

# Reset to previous commit
git log --oneline -10
git reset --hard <commit-hash>

# Restart
pm2 restart fluxfeed-api
exit
```

---

## 📞 **Server Access Info**

**Droplet IP:** `206.189.66.139`
**SSH Command:** `ssh root@206.189.66.139`
**Project Path:** `/var/www/fluxfeed-api`

---

## 🎯 **Quick Copy-Paste Commands**

### Deploy Backend Update:
```bash
ssh root@206.189.66.139 "cd /var/www/fluxfeed-api && git pull origin main && npm install && pm2 restart fluxfeed-api && pm2 logs fluxfeed-api --lines 20"
```

### Check Backend Status:
```bash
ssh root@206.189.66.139 "pm2 status && pm2 logs fluxfeed-api --lines 10"
```

### View Environment Variables:
```bash
ssh root@206.189.66.139 "cat /var/www/fluxfeed-api/.env"
```

---

**Last Updated:** October 29, 2025  
**Repository:** https://github.com/dreyxd/Fluxfeed

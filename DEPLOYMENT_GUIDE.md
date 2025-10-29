# 🚀 Fluxfeed Deployment Guide

## ✅ Production-Ready Changes Complete!

Your codebase is now configured for production deployment with support for:
- `fluxfeed.news` - Main landing page
- `app.fluxfeed.news` - App subdomain (optional)  
- `api.fluxfeed.news` - Backend API server

---

## 📦 What Was Changed

### Frontend Changes:
1. ✅ **`src/config/api.ts`** - Created centralized API URL config
2. ✅ **`src/contexts/AuthContext.tsx`** - Updated to use dynamic API URL
3. ✅ **`src/components/Auth/Login.tsx`** - Uses AuthContext (already updated)
4. ✅ **`src/components/Auth/Register.tsx`** - Uses AuthContext (already updated)
5. ✅ **`src/components/FluxfeedLanding.tsx`** - Updated news API calls
6. ✅ **`src/pages/FluxfeedSignals.tsx`** - Updated signal API calls
7. ✅ **`src/pages/Token.tsx`** - Updated waitlist API call
8. ✅ **`vercel.json`** - Added for SPA routing support

### Backend Changes:
9. ✅ **`server/index.ts`** - Updated CORS to allow production domains
10. ✅ **`server/routes/auth.ts`** - Updated cookies for cross-subdomain support
11. ✅ **`.env.example`** - Created with all required environment variables

---

## 🎯 Deployment Steps

### **Step 1: Push Code to GitHub**

```powershell
git add .
git commit -m "feat: production-ready deployment config"
git push origin main
```

---

### **Step 2: Deploy Frontend to Vercel**

#### A. Create Vercel Account
1. Go to https://vercel.com
2. Sign up with GitHub
3. Authorize Vercel to access your repositories

#### B. Import Project
1. Click "Add New..." → "Project"
2. Select your GitHub repo: `dreyxd/Fluxfeed`
3. Click "Import"

#### C. Configure Build Settings
```
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Root Directory: ./
```

#### D. Add Environment Variables
Click "Environment Variables" and add:
```
Name: VITE_API_URL
Value: https://api.fluxfeed.news
```

#### E. Deploy
1. Click "Deploy"
2. Wait 2-3 minutes for build to complete

#### F. Add Custom Domains
1. Go to project → Settings → Domains
2. Add domains:
   - `fluxfeed.news`
   - `www.fluxfeed.news` (redirect to fluxfeed.news)
   - `app.fluxfeed.news` (optional)

Vercel will show you DNS instructions for each domain.

---

### **Step 3: Configure Namecheap DNS**

1. Login to Namecheap → Manage `fluxfeed.news`
2. Go to "Advanced DNS" tab
3. Delete all existing records (parking page, etc.)
4. Add these records:

**If Vercel tells you to use CNAME (most common):**
```
Type: CNAME Record
Host: www
Value: cname.vercel-dns.com.
TTL: Automatic

Type: CNAME Record
Host: app
Value: cname.vercel-dns.com.
TTL: Automatic
```

**For root domain (@), you may need to:**
- Use ALIAS record (if Namecheap supports it)
- OR use Vercel's A records (they'll provide IPs)
- OR set up redirect from @ to www

**Example with A records (Vercel will provide IPs):**
```
Type: A Record
Host: @
Value: 76.76.21.21  (Vercel will give you actual IP)
TTL: Automatic

Type: A Record
Host: @
Value: 76.76.21.98  (Vercel usually gives 2 IPs)
TTL: Automatic
```

5. Wait 10-30 minutes for DNS propagation
6. Vercel will auto-provision SSL certificates (HTTPS)

---

### **Step 4: Create DigitalOcean Droplet for API**

#### A. Create Droplet
1. Go to https://cloud.digitalocean.com
2. Create → Droplets
3. Choose:
   - **Image:** Ubuntu 22.04 LTS
   - **Plan:** Basic - $6/month (1GB RAM) or $12/month (2GB recommended)
   - **Datacenter:** Choose closest to your users (San Francisco, New York, London, etc.)
   - **Authentication:** SSH Key (recommended) or Password
4. Click "Create Droplet"
5. Note the IP address (e.g., `167.172.xxx.xxx`)

#### B. Add Droplet IP to Namecheap DNS
```
Type: A Record
Host: api
Value: <your-droplet-ip>
TTL: Automatic
```

#### C. SSH into Droplet
```powershell
ssh root@<your-droplet-ip>
```

#### D. Install Dependencies
```bash
# Update system
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PM2 (process manager)
npm install -g pm2

# Install Nginx (web server / reverse proxy)
apt install -y nginx

# Install Certbot (for SSL certificates)
apt install -y certbot python3-certbot-nginx

# Install Git
apt install -y git
```

#### E. Clone Your Repository
```bash
# Create app directory
mkdir -p /var/www/fluxfeed-api
cd /var/www/fluxfeed-api

# Clone repo
git clone https://github.com/dreyxd/Fluxfeed.git .

# Install packages
npm install

# Build TypeScript (if needed)
npm run build
```

#### F. Create Environment File
```bash
nano .env
```

Paste your environment variables (copy from `.env.example`):
```bash
NODE_ENV=production
PORT=8787

DB_HOST=db-fluxfeednews-v1-do-user-26683588-0.d.db.ondigitalocean.com
DB_PORT=25060
DB_USER=doadmin
DB_PASSWORD=<your-actual-password>
DB_NAME=defaultdb
DB_SSL=true

JWT_SECRET=<generate-a-strong-secret-key>
JWT_EXPIRES_IN=7d

OPENAI_API_KEY=<your-key>
OPENAI_MODEL=gpt-4-turbo-preview
CRYPTONEWS_API_KEY=<your-key>
```

Press `Ctrl+X`, then `Y`, then `Enter` to save.

#### G. Start API with PM2
```bash
# Start server
pm2 start server/index.ts --name fluxfeed-api --interpreter tsx

# Save PM2 process list
pm2 save

# Set PM2 to start on boot
pm2 startup systemd
# Run the command it gives you (starts with sudo)

# Check status
pm2 status
pm2 logs fluxfeed-api
```

#### H. Configure Nginx Reverse Proxy
```bash
nano /etc/nginx/sites-available/fluxfeed-api
```

Paste this configuration:
```nginx
server {
    listen 80;
    server_name api.fluxfeed.news;

    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Save and enable:
```bash
# Enable site
ln -s /etc/nginx/sites-available/fluxfeed-api /etc/nginx/sites-enabled/

# Test config
nginx -t

# Restart Nginx
systemctl restart nginx
```

#### I. Setup SSL Certificate
```bash
# Get SSL certificate (replace api.fluxfeed.news with your domain)
certbot --nginx -d api.fluxfeed.news

# Follow prompts:
# - Enter email address
# - Agree to terms
# - Choose redirect HTTP to HTTPS: Yes

# Test auto-renewal
certbot renew --dry-run
```

---

### **Step 5: Test Your Deployment**

#### Test API:
```powershell
# Health check (create this endpoint if needed)
curl https://api.fluxfeed.news/api/news/general?items=1

# Should return JSON with news items
```

#### Test Frontend:
1. Visit `https://fluxfeed.news` - Should load landing page
2. Visit `https://app.fluxfeed.news` - Should redirect to `/app` or load app
3. Try registering a new account
4. Try logging in
5. Try viewing signals page

---

## 🔄 Future Deployments

### Update Frontend (Vercel):
```powershell
git add .
git commit -m "Update feature"
git push origin main
```
Vercel auto-deploys! ✅

### Update Backend (Droplet):
```bash
# SSH into droplet
ssh root@<droplet-ip>
cd /var/www/fluxfeed-api

# Pull latest changes
git pull origin main

# Install new dependencies (if any)
npm install

# Restart PM2
pm2 restart fluxfeed-api

# Check logs
pm2 logs fluxfeed-api --lines 50
```

---

## 🔧 Troubleshooting

### Frontend Issues:
- **404 errors:** Check `vercel.json` is committed
- **CORS errors:** Check `server/index.ts` has correct origins
- **API not loading:** Check `VITE_API_URL` in Vercel env vars

### Backend Issues:
```bash
# Check PM2 status
pm2 status

# View logs
pm2 logs fluxfeed-api

# Restart if needed
pm2 restart fluxfeed-api

# Check Nginx status
systemctl status nginx

# View Nginx logs
tail -f /var/log/nginx/error.log
```

### DNS Issues:
- Wait 30 minutes after DNS changes
- Check propagation: https://dnschecker.org
- Verify DNS in Namecheap dashboard

---

## 📊 Cost Breakdown

- Vercel Hobby (Frontend): **Free** ✅
- DigitalOcean Droplet (Backend): **$6-12/month**
- DigitalOcean PostgreSQL: **$15/month** (you already have)
- Namecheap Domain: **$10/year**

**Total: ~$21-27/month + $10/year domain**

---

## ✅ Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel account created
- [ ] Frontend deployed to Vercel
- [ ] Custom domains added in Vercel
- [ ] DNS configured in Namecheap
- [ ] DigitalOcean droplet created
- [ ] Node.js, PM2, Nginx installed
- [ ] Backend code deployed
- [ ] Environment variables set
- [ ] PM2 started and saved
- [ ] Nginx configured
- [ ] SSL certificate installed
- [ ] Test registration/login
- [ ] Test all API endpoints
- [ ] Monitor PM2 logs

---

## 🎉 You're Live!

Your Fluxfeed app is now deployed and accessible at:
- **Landing:** https://fluxfeed.news
- **App:** https://app.fluxfeed.news (or https://fluxfeed.news/app)
- **API:** https://api.fluxfeed.news

**Next steps:** Monitor usage, collect user feedback, and iterate! 🚀

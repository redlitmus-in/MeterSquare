# 🚀 Build Instructions for Dual-Domain Deployment

## 📋 Overview

Your project supports **TWO deployment environments:**

1. **STAGING** (`msq.ath.cx`) - For testing new features
2. **PRODUCTION** (`msq.kol.tel`) - For stable releases

---

## 🏗️ Build Commands

### For STAGING (msq.ath.cx) - Testing Server

```bash
cd frontend
npm run build:staging
```

**What this does:**
- Uses `.env.production.ath` file
- API calls go to: `https://msq.ath.cx/api`
- Builds to `dist/` folder
- Takes ~30 seconds

**When to use:** When testing new features before going live

---

### For PRODUCTION (msq.kol.tel) - Main Server

```bash
cd frontend
npm run build:production
```

**What this does:**
- Uses `.env.production` file
- API calls go to: `https://msq.kol.tel/api`
- Builds to `dist/` folder
- Takes ~30 seconds

**When to use:** When deploying stable, tested features to production

---

## 📁 Environment Files

### `.env` - Local Development
```env
VITE_API_BASE_URL=http://127.0.0.1:5000/api
```
Used when running `npm run dev`

### `.env.production.ath` - Staging
```env
VITE_API_BASE_URL=https://msq.ath.cx/api
```
Used when running `npm run build:staging`

### `.env.production` - Production
```env
VITE_API_BASE_URL=https://msq.kol.tel/api
```
Used when running `npm run build:production`

---

## 🔄 Typical Workflow

### Step 1: Develop Locally
```bash
npm run dev
# Test at http://localhost:3000
# API calls go to http://127.0.0.1:5000/api
```

### Step 2: Build for Staging
```bash
npm run build:staging
```

Upload `dist/` to `msq.ath.cx` server:
```bash
# Zip the build
cd frontend
zip -r dist-staging-$(date +%Y%m%d-%H%M).zip dist/

# Or use SCP/FTP to upload
scp -r dist/* user@msq.ath.cx:/var/www/html/
```

### Step 3: Test on Staging
- Open `https://msq.ath.cx`
- Test all new features
- Verify no bugs
- Get team approval

### Step 4: Build for Production
```bash
npm run build:production
```

Upload `dist/` to `msq.kol.tel` server:
```bash
# Zip the build
cd frontend
zip -r dist-production-$(date +%Y%m%d-%H%M).zip dist/

# Or use SCP/FTP to upload
scp -r dist/* user@msq.kol.tel:/var/www/html/
```

### Step 5: Verify Production
- Open `https://msq.kol.tel`
- Test critical features
- Monitor for errors

---

## ✅ Verification Checklist

### After Building for Staging:

```bash
# Check the API URL in the build
grep -r "msq.ath.cx" dist/assets/js/ | head -1

# Should output:
# ✅ const API_URL = "https://msq.ath.cx/api";
```

### After Building for Production:

```bash
# Check the API URL in the build
grep -r "msq.kol.tel" dist/assets/js/ | head -1

# Should output:
# ✅ const API_URL = "https://msq.kol.tel/api";
```

---

## 📦 Build Output

**Successful build should show:**
```
✓ 3921 modules transformed
✓ built in ~31s

dist/
├── index.html           (6.5 KB)
├── stats.html          (1.6 MB - bundle analyzer)
└── assets/
    ├── css/            (stylesheets)
    ├── js/             (234 JavaScript files)
    ├── logo.png
    └── logofavi.png

Total: ~24 MB (includes source maps)
```

---

## 🐛 Troubleshooting

### Issue: Wrong API URL after deployment

**Problem:** Built for staging but deployed to production (or vice versa)

**Solution:** Rebuild with correct command:
```bash
# For staging
npm run build:staging

# For production
npm run build:production
```

---

### Issue: "npm: command not found"

**Solution:** Make sure you're in the frontend directory:
```bash
cd frontend
npm run build:staging
```

---

### Issue: Build takes too long or fails

**Solution:** Clean cache and rebuild:
```bash
cd frontend
rm -rf dist node_modules/.vite
npm run build:staging  # or build:production
```

---

## 📝 Quick Reference

| Command | Environment | API URL | Use Case |
|---------|-------------|---------|----------|
| `npm run dev` | Development | `127.0.0.1:5000` | Local testing |
| `npm run build:staging` | Staging | `msq.ath.cx/api` | Test new features |
| `npm run build:production` | Production | `msq.kol.tel/api` | Deploy stable version |

---

## 🔒 Security Notes

1. **Never commit `.env` files to git** - They contain sensitive configuration
2. **Always use HTTPS** in production (`https://msq.kol.tel`)
3. **Test on staging first** - Never deploy untested code to production
4. **Keep backups** - Keep previous `dist.zip` files in case rollback is needed

---

## 📞 Need Help?

If you encounter issues:
1. Check browser console (F12) for errors
2. Verify you used the correct build command
3. Check server logs for API errors
4. Verify `dist/` folder was uploaded completely

---

**Last Updated:** November 2024

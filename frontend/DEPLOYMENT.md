# Frontend Deployment Instructions

## ⚠️ CRITICAL FIX APPLIED

**Problem:** Build was only generating 0.71 kB JS file (just the Vite preload polyfill)
**Cause:** `moduleSideEffects: false` in vite.config.ts was removing all app code
**Fix:** Changed to `moduleSideEffects: true` on line 151

---

## 📦 How to Build for Production

```bash
cd frontend
npm run build
```

This creates a `dist` folder with:
- `index.html` (entry point)
- `assets/` folder (211 files, ~6.4 MB)
  - JavaScript chunks (code-split for performance)
  - CSS files
  - Images (logo.png, logofavi.png)
  - Compressed versions (.gz, .br for faster loading)

---

## 🚀 Deployment Steps

### Option 1: Deploy ONLY the `dist` Folder

**Upload these files to your web server:**

```
dist/
├── index.html          ← Main HTML file
└── assets/             ← All JavaScript, CSS, images
    ├── *.js            ← JavaScript chunks
    ├── *.css           ← Stylesheets
    ├── *.gz            ← Gzip compressed versions
    ├── *.br            ← Brotli compressed versions
    ├── logo.png        ← Company logo
    └── logofavi.png    ← Favicon
```

**Server Configuration:**

Point your web server root to the `dist` folder. For example:

**Nginx:**
```nginx
server {
    listen 80;
    server_name msq.ath.cx;

    root /path/to/MeterSquare/frontend/dist;
    index index.html;

    # Enable gzip/brotli compression
    gzip on;
    gzip_types text/css application/javascript application/json;

    # SPA routing - redirect all requests to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets for 1 year
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Apache (.htaccess):**
```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>

# Enable compression
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript
</IfModule>

# Cache static assets
<FilesMatch "\.(js|css|png|jpg|jpeg|gif|ico|svg)$">
  Header set Cache-Control "max-age=31536000, public, immutable"
</FilesMatch>
```

---

## ✅ Verification Checklist

After deployment, verify:

1. ✅ Main page loads (should show login or dashboard)
2. ✅ No 404 errors in browser console (F12 → Console)
3. ✅ Assets load from `/assets/` folder
4. ✅ Logo and favicon display correctly
5. ✅ JavaScript executes (no "Initializing..." stuck screen)
6. ✅ API calls work (check Network tab)

---

## 🐛 Troubleshooting

### Issue: Stuck on "Initializing..." screen

**Symptoms:**
- Page shows loading animation forever
- Console error: `GET /src/main.tsx 404 (Not Found)`

**Cause:** Wrong `index.html` is being served (source version instead of built version)

**Solution:**
1. Make sure web server points to `dist` folder, not `frontend` folder
2. Verify `dist/index.html` contains script tag like:
   ```html
   <script type="module" crossorigin src="/assets/[hash].js"></script>
   ```
   NOT:
   ```html
   <script type="module" src="/src/main.tsx"></script>
   ```

### Issue: White screen or JavaScript errors

**Symptoms:**
- Blank white page
- Console errors about missing modules

**Cause:** Incomplete build or cached old build

**Solution:**
```bash
cd frontend
rm -rf dist node_modules/.vite
npm run build
```

### Issue: Assets not loading (404 for /assets/*)

**Symptoms:**
- Console errors: `GET /assets/xyz.js 404`
- Blank page

**Cause:** `assets` folder not uploaded or wrong path

**Solution:**
1. Verify entire `dist/assets/` folder is uploaded
2. Check server configuration for correct root path
3. Ensure no URL rewriting is breaking asset paths

---

## 📝 Build Output Details

**Proper build should show:**
```
✓ 3921 modules transformed
✓ built in ~30s

dist/index.html              6.57 kB
dist/assets/6df26908.css   151.95 kB
dist/assets/[hash].js        [multiple chunks ranging from 0.5 KB to 992 KB]
```

**Total:** ~211 files, ~6.4 MB uncompressed

**If you see only:**
```
dist/assets/b2b24244.js    0.71 kB  ← THIS IS WRONG!
```
→ The build is broken. Re-run build or contact developer.

---

## 🔒 Security Notes

1. **NO source files in production**
   Only upload `dist` folder. Never upload `src`, `node_modules`, etc.

2. **Environment variables**
   API URL and other config should be in `.env` file:
   ```env
   VITE_API_BASE_URL=https://your-api.com/api
   ```
   Rebuild after changing `.env`.

3. **HTTPS required**
   Always use HTTPS in production for security.

---

## 📞 Support

If deployment issues persist:
1. Check browser console (F12) for errors
2. Check server error logs
3. Verify `dist` folder contents match checklist above
4. Contact development team with error screenshots

# Logic Crack Hub Backend

Logic Crack Hub is a V1 full-stack starter built from the SRS in `C:\Users\Ahsan\Desktop\New DOCX Document.docx`.

It follows the requested stack:

- Frontend: Next.js, TypeScript, Tailwind CSS
- Backend: Go REST API
- Database: Supabase PostgreSQL, with local PostgreSQL available through Docker
- File storage path: URL fields ready for Supabase ZIPs, thumbnails, and gallery screenshots

## What Is Included

- Asset catalog with search, categories, sorting, detail pages, reviews, favorites, and credit-based downloads
- 7-day daily reward streak: 10, 20, 30, 40, 50, 60, then 100 credits plus badge flag
- User auth with JWT, bcrypt passwords, register, login, logout, forgot/reset password, and email verification token endpoints
- Guest, user, and admin role boundaries
- Asset request board with voting and admin status updates
- Admin dashboard stats, asset publishing, notifications, and request status API
- PostgreSQL schema and seed data
- Local mock asset preview images for the catalog

## Backend Structure

```text
cmd/        API entrypoint
internal/   Go application packages
database/   PostgreSQL schema and seed SQL
docker-compose.yml
go.mod
```

The frontend lives separately at:

```text
..\frontend
```

## Start PostgreSQL Locally

From this `backend` folder:

```powershell
docker compose up -d postgres
```

The compose file loads:

```text
database/
  schema.sql
  seed.sql
```

Seed login:

```text
Admin: admin@logiccrack.studio / password123
User:  builder@example.com / password123
```

## Start The API

```powershell
cd "D:\web-devlopmnt\Go Lang\Logic Crack Hub\backend"
Copy-Item .env.example .env
go run .\cmd\api
```

For Supabase, set `DATABASE_URL` in `.env` to your project connection string with `sslmode=require`.

API URL:

```text
http://localhost:8080
```

Health check:

```powershell
Invoke-RestMethod http://localhost:8080/health
```

## Start The Web App

```powershell
cd "D:\web-devlopmnt\Go Lang\Logic Crack Hub\frontend"
Copy-Item .env.local.example .env.local
npm install
npm run dev
```

Web URL:

```text
http://localhost:3000
```

## Deploy On Netlify

The repo root contains `netlify.toml`, so Netlify builds the frontend and deploys the Go API as a Netlify Function from one site.

Netlify build settings:

```text
Base directory: leave empty, or use .
Build command: npm --prefix frontend ci && npm --prefix frontend run build
Publish directory: frontend/.next
Functions directory: backend/netlify/functions
```

Environment variables:

```text
DATABASE_URL=your Supabase PostgreSQL connection string
JWT_SECRET=use a long random secret
CORS_ALLOWED_ORIGINS=https://your-netlify-site.netlify.app
SUPABASE_POOLER_REGION=your Supabase project region, for example ap-southeast-2
```

For Netlify Functions, the Supabase pooler is recommended because direct database hosts can be IPv6-only. The Netlify function can retry a Supabase direct URL through the pooler when `SUPABASE_POOLER_REGION` is set.

Production URLs:

```text
https://your-netlify-site.netlify.app
https://your-netlify-site.netlify.app/api
https://your-netlify-site.netlify.app/health
```

## Important API Routes

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/email-verification
POST /api/auth/verify-email

GET  /api/categories
GET  /api/assets
GET  /api/assets/{id-or-slug}
POST /api/assets/{id}/download
POST /api/assets/{id}/favorite
POST /api/assets/{id}/reviews

POST /api/rewards/claim
GET  /api/credits/history

GET  /api/requests
POST /api/requests
POST /api/requests/{id}/vote

GET    /api/admin/stats
POST   /api/admin/assets
PUT    /api/admin/assets/{id}
DELETE /api/admin/assets/{id}
POST   /api/admin/notifications
PUT    /api/admin/requests/{id}/status
```

## V1 Notes

- The data model stores Supabase-ready URLs for ZIP downloads, thumbnails, and gallery screenshots.
- Forgot password and email verification return development tokens in JSON. In production, those tokens should be emailed instead.
- Google login is left out because the SRS says it can come later.

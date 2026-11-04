# Central WA Hub — Sabira IIBS

Node.js app sebagai pusat WhatsApp Bot multi-aplikasi sekolah. Menerima webhook dari semua app Laravel untuk mengirim notifikasi WA ke guru, wali murid, dan admin.

## Stack
- Node.js (ESM)
- @whiskeysockets/baileys v7 (WhatsApp Web API)
- Prisma ORM + SQLite
- EJS templating (admin dashboard)
- Express.js

## Paths
- **Local**: `/Users/ryand/Documents/LARAVEL/NODE/wa-hub-sabira`
- **Server**: `/home/ryand/wa-hub` on `ssh.sabira-iibs.id` (pm2 managed)

## Commands
- `npm run dev` — local dev (node --watch)
- `npm run setup` — prisma generate + db push + seed
- `sabira-ship central-wa-hub` — deploy ke server

## Important
- Session WA tersimpan di server (jangan hapus folder `auth_info`)
- Bot jalan 24/7 via pm2 di server production
- Semua app Laravel mengirim webhook ke endpoint `/api/send` di bot ini

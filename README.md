# GolfChallenge

Mobile-first home putting practice for a **3.0 m indoor putting mat**. Three quick-logging games — **Distance Rounds**, **Putting Ladder** and **Pace Control** — with local session history, comparable personal bests and JSON backup/restore.

> Scores are practice aids for tracking personal consistency on a home mat. They are not validated measures of on-course ability or handicap.

## Develop

```bash
npm install
npm run dev        # local dev server
npm test           # Vitest
npm run typecheck  # tsc --noEmit
npm run build      # type-check + production bundle in dist/
npm run preview    # serve dist/ locally to check the production build
```

## Deploy (static hosting)

`npm run build` produces a fully static site in `dist/`. `vite.config.ts` sets `base: './'`, so assets use relative URLs and the site works from the domain root or any sub-path (GitHub Pages project sites, Netlify, Cloudflare Pages, S3, a plain web server). There is no router and no server component: upload the contents of `dist/`.

## Data and privacy

- Everything is stored in your browser's `localStorage` (key `golf_challenge_app_v1`); nothing is sent anywhere.
- The browser can clear this data (site data cleared, private browsing, storage pressure). Use **History & Data → Export JSON backup** regularly.
- Imports are validated in memory and need explicit confirmation before replacing saved data.
- **Demo data** (History & Data → *Preview with demo data*) shows made-up sample sessions held in memory only. They are never written to storage and never included in an export.

## Accessibility

Keyboard-operable tabs (arrow keys, Home/End), visible focus outlines, focus moved to the new view's heading, polite screen-reader announcements for logging/undo/completion, and `prefers-reduced-motion` support.

## Project docs

See `GEMINI.md` (conventions), `architecture.md` (domain and storage design) and `project_plan.md` (milestones and status).

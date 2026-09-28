# Next.js migration: first working route

Build the existing `/loading` surface as native React so the owner can begin migrating the site while preserving its current design and working authentication service.

## Run

Use Node.js 20.9 or newer (CI uses Node 22). From the repository root:

```sh
cd next-app
npm ci
npm run dev
```

Open http://localhost:3000/loading. The root `/` intentionally redirects to the existing production Worker, which chooses login or home from its signed session.

```sh
npm run build
npx playwright install chromium
npm test
# Or serve the production build manually instead of running the tests:
npm start
```

Next.js, React and Playwright versions are pinned in package.json and package-lock.json. No environment secrets are needed for this public route.

## What is migrated

- `app/loading/page.jsx`: native JSX converted from the current `loading.html`, preserving the copy, links and section structure.
- `app/layout.jsx`: metadata, document shell and ordered styles.
- `components/site-header.jsx` and `site-footer.jsx`: reusable structure.
- `components/theme-toggle.jsx`: React state with the existing normal/docs preference key.
- `components/code-window.jsx`: React copy interaction and existing syntax tokenization.
- `styles/`: the existing page styles copied as the migration starting point.
- `public/logo.svg`: existing brand asset. The page uses two brand logos.

There is no iframe or HTML-string injection. Existing static pages remain the production source until their own migration is complete; subsequent design edits must be reconciled between both versions during this transition.

## Route and data contract

| Field | Type | Source | Rule |
| --- | --- | --- | --- |
| heading, sections | static JSX/string | loading.html at d84645e | Existing editorial content |
| color_mode | normal or docs | localStorage: lsuperagent-color-mode | Validate stored value; default normal; black canvas |
| code | string | Existing quickstart example | Render as text; copy exactly; never execute |
| workspace links | HTTPS URL | Existing agents-sdk.space routes | Full navigation to the existing Worker |
| brand | SVG | Repository logo.svg | Public static asset |
| secret_values_exposed | boolean | No runtime credentials used | false |

Only `/loading` is migrated. `/` redirects to https://agents-sdk.space/. Links to `/chat`, `/docs`, `/guide`, `/keys` and other unmigrated pages use the existing production origin explicitly; fragment links stay local. This keeps login and cookies on their current origin rather than forwarding credentials through an unverified proxy. Direct local protected/API URLs return 404. No auth or API implementation is duplicated.

The migration app MUST remain on a separate local/preview origin at this stage. Pointing agents-sdk.space to it would cause a root redirect loop and break unmigrated routes. Before domain cutover, replace the temporary absolute navigation and implement verified session-aware routes and backend integration. Do not infer shared localStorage between preview and production origins.

## Verification

- Next.js production build passed locally.
- HTTP smoke passed: `/loading` and referenced CSS/logo return 200; `/` returns 307 to the existing Worker; local `/chat` and `/api/chat` return 404.
- Existing repository Node tests: 75/75 passed.
- Playwright desktop/mobile suite covers theme persistence, copy behavior (clipboard stub only), horizontal overflow, console errors and workspace links.
- Local browser execution is not yet verified: Chromium downloads returned truncated archives. The PR workflow installs Chromium and runs the browser suite.
- No live AI request, deployment or domain cutover has been performed.

## Next migration stages

1. Verify the first route visually at mobile and desktop widths.
2. Move login/signup/reset UI and connect the existing auth contract on a reviewed preview origin; verify cookies, OAuth callback URLs and CSRF protections.
3. Migrate home, chat, tools, Exa and keys using reusable components and the existing server API contracts.
4. Migrate docs and guide, preserving SDK examples and authenticated access.
5. Choose and test the Next.js production runtime, migrate routing, then verify all public/protected/API paths before switching the domain.

Rollback for this first step is simply to stop using the preview: production HTML and Worker files were not modified. `.assetsignore` prevents the migration source, dependencies and build output from being uploaded as legacy static assets.

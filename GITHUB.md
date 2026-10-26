# Put RepCount on GitHub (and your iPhone)

Your account: **https://github.com/Darker20121995** — the repo will be:

| What | URL |
| --- | --- |
| Repository | https://github.com/Darker20121995/repcount |
| Live app (after step 3) | **https://darker20121995.github.io/repcount/** |
| Pages settings | https://github.com/Darker20121995/repcount/settings/pages |

You need: this `repcount` folder, your GitHub login, ~5 minutes.

---

## 1. Create the repository

1. Open **https://github.com/new**
2. **Repository name:** `repcount`
3. **Visibility:** **Public** ← required for free GitHub Pages
4. Do **not** tick “Add a README”, “.gitignore” or “license” — they already exist here.
5. **Create repository**.

You land on an empty repo page.

---

## 2. Upload the files

### Option A — one command (Windows, recommended)

In this folder, right-click **`publish.ps1`** → **Run with PowerShell**.

It will:
- initialise git and commit everything,
- ask for your name/email once (only if git has none),
- push to `https://github.com/Darker20121995/repcount.git`.

A browser window opens for GitHub sign-in the first time. When it finishes, come back
here and continue with step 3.

If PowerShell blocks the script, run it from a terminal opened in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\publish.ps1
```

### Option B — git commands by hand

```powershell
cd "C:\Users\tempadmin\OneDrive\Documents\deepseek-harness\default-workspace\repcount"

git init -b main
git add .
git commit -m "RepCount: interval rep trainer PWA"

git remote add origin https://github.com/Darker20121995/repcount.git
git push -u origin main
```

If git asks who you are:

```powershell
git config --global user.name "Darker20121995"
git config --global user.email "your-github-email@example.com"
```

When prompted for a password, use a **Personal Access Token**
(GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
*Contents: Read and write*), or let the Git Credential Manager window sign you in.
Your normal GitHub password will **not** work.

### Option C — drag & drop in the browser (no git)

1. On the empty repo page click **“uploading an existing file”** (or **Add file → Upload files**).
2. From this folder select the **contents** — not the folder itself:
   `index.html`, `styles.css`, `app.js`, `manifest.webmanifest`, `sw.js`,
   `icons/`, `screenshots/`, `tools/`, `README.md`, `GITHUB.md`, `LICENSE`, `publish.ps1`.
3. Drag them into the page, wait for the list, then **Commit changes**.

> ⚠️ Files must be at the **repo root**. If the repo shows a `repcount/` folder
> containing `index.html`, you uploaded the folder instead of its contents — Pages will
> show 404. Delete and re-upload the contents, or move them up.

---

## 3. Turn on GitHub Pages

1. Open **https://github.com/Darker20121995/repcount/settings/pages**
2. **Build and deployment**
   - **Source:** `Deploy from a branch`
   - **Branch:** `main` — folder `/ (root)`
3. **Save**.
4. Wait 1–3 minutes and reload the page. The banner shows
   *“Your site is live at https://darker20121995.github.io/repcount/”*.

Open **https://darker20121995.github.io/repcount/** on the PC first — you should see the
setup screen with the orange **Start workout** button.

---

## 4. Make the repo look good (30 seconds)

**Settings → General → Social preview → Edit** → upload
[`screenshots/banner.png`](screenshots/banner.png) → **Save**.

Then on the repo main page press the ⚙ next to **About**:

- **Description:** `Interval rep trainer PWA — work timer, rest timer, tap-to-count reps. Installs on iPhone and Android, works offline.`
- **Website:** `https://darker20121995.github.io/repcount/`
- **Topics:** `pwa`, `fitness`, `workout`, `interval-timer`, `rep-counter`,
  `vanilla-javascript`, `ios`, `android`, `offline-first`

---

## 5. Install it on the iPhone

1. Open **https://darker20121995.github.io/repcount/** in **Safari**.
2. Tap **Share** (square with an arrow) → **Add to Home Screen** → **Add**.
3. Launch RepCount from the home screen — full screen, no address bar.
4. First launch caches everything; after that it works in airplane mode.

Android: open in **Chrome** → **Install app** (or the Install card inside the app).

---

## Updating the app later

```powershell
# edit files…
# bump the cache version so installed copies pick up the change:
#   sw.js  →  const VERSION = 'v3';

git add .
git commit -m "Tweak the rest timer"
git push
```

Pages redeploys in about a minute. On the phone, close and reopen the app twice so the
new service worker takes over.

> Bump `VERSION` in `sw.js` whenever `app.js`, `styles.css` or icons change — otherwise
> installed copies keep serving the old cached files.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **404** on the Pages URL | Pages not built yet (wait 2 min); source not `main` / `/ (root)`; or files are nested in a `repcount/` folder. |
| Page loads but **no styles or buttons work** | `styles.css`, `app.js`, `icons/` must sit next to `index.html` at the repo root. |
| **Install** option missing on iPhone | Use **Safari**, not Chrome — iOS only installs from Safari. |
| Old version still showing | Bump `VERSION` in `sw.js`, push, close/reopen the app twice. |
| Pages settings missing | Repo is private — switch it to **Public** for free Pages. |
| Renamed the repo | The URL follows the repo name; update the README and re-add the home-screen icon. |
| Push rejected / auth loop | Create a Personal Access Token and use it as the password, or run `git credential-manager configure`. |
| Push rejected (`fetch first`) | The repo was created **with** a README. Run `git pull --rebase origin main`, then `git push`, or delete the repo and recreate it empty. |
| Want a shorter URL | Rename the repo to `Darker20121995.github.io` → app moves to the domain root. |

---

## Optional: custom domain

1. Buy a domain (e.g. `repcount.app`).
2. **Settings → Pages → Custom domain** → enter it → **Save** (creates a `CNAME` file).
3. At your DNS provider, add a `CNAME` for `www` pointing to `darker20121995.github.io`.
4. Wait for the certificate, then enable **Enforce HTTPS**.

---

## Checklist

- [ ] Repo `Darker20121995/repcount` created and **public**
- [ ] `index.html` visible at the repo root
- [ ] **Settings → Pages**: `main` / `/ (root)` saved
- [ ] https://darker20121995.github.io/repcount/ opens the setup screen
- [ ] About section: description, website, topics, social preview
- [ ] iPhone: Safari → Share → **Add to Home Screen**
- [ ] Airplane-mode test: app still opens and counts reps

# Deploying to Firebase Hosting + Cloud Run

This doc walks you through deploying `claudetovideo` to Firebase.

**Stack**

- **Firebase Hosting** — serves static HTML/CSS/JS at the CDN edge
- **Cloud Run** — runs the Express backend in a container (Chromium + ffmpeg baked in)
- **Firebase Hosting rewrites** — route `/api/*` to Cloud Run so both share one URL

The server still uses in-memory job state and `/tmp` for file storage.
Jobs survive only while the container is warm. That's fine for a single
user / light traffic — ramp to Firestore + Storage in phase 2b if you
need persistent jobs or multi-instance scaling.

---

## 0. One-time prerequisites

Install these locally:

- **Node 18+** — already have it
- **Google Cloud SDK** — <https://cloud.google.com/sdk/docs/install>
- **Firebase CLI** — `npm install -g firebase-tools`
- **Docker** — <https://www.docker.com/products/docker-desktop/>

Log in:

```bash
gcloud auth login
gcloud auth configure-docker
firebase login
```

Create (or pick) a Firebase project at <https://console.firebase.google.com/>
and note its Project ID. Enable billing on the underlying GCP project —
Cloud Run requires it (free tier still covers typical usage; set budget
alerts at $5 so you can't get surprised).

Put the Project ID in `.firebaserc`:

```json
{ "projects": { "default": "YOUR-PROJECT-ID" } }
```

Enable the APIs:

```bash
gcloud config set project YOUR-PROJECT-ID
gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
```

---

## 1. Build and push the container image

```bash
PROJECT_ID=YOUR-PROJECT-ID
REGION=us-central1

# Build via Cloud Build — no local Docker required; the image lands in
# Google's Artifact Registry automatically.
gcloud builds submit \
  --tag "$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/claudetovideo"
```

First build creates the Artifact Registry repo if it doesn't exist.

## 2. Deploy to Cloud Run

```bash
gcloud run deploy claudetovideo \
  --image "$REGION-docker.pkg.dev/$PROJECT_ID/cloud-run-source-deploy/claudetovideo" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 1 \
  --max-instances 5 \
  --port 8080
```

Why these flags:

- `--memory 2Gi --cpu 2` — Chromium needs the RAM, render uses both cores.
- `--timeout 900` — 15 min HTTP timeout matches typical max render time.
- `--concurrency 1` — one render per container so Chromium doesn't thrash.
- `--max-instances 5` — caps cost. Raise if you expect traffic.
- `--allow-unauthenticated` — Firebase Hosting can reach it directly.

On success, Cloud Run prints a URL like
`https://claudetovideo-xxxxx-uc.a.run.app`. You can hit that directly to
sanity-check, but you normally want to use Firebase Hosting in front.

## 3. Point Firebase Hosting at Cloud Run

The repo already contains `firebase.json` with the correct rewrite. Just
deploy hosting:

```bash
firebase deploy --only hosting
```

Firebase prints your site URL, e.g. `https://YOUR-PROJECT-ID.web.app`.
That serves `public/index.html` from the CDN and forwards `/api/*` to
Cloud Run.

## 4. Smoke test

```bash
curl -s https://YOUR-PROJECT-ID.web.app/api/jobs
# → []

curl -s -X POST -F "file=@codaro.html" https://YOUR-PROJECT-ID.web.app/api/convert
# → {"id":"..."}
```

Then open the site in a browser and drop your HTML in.

---

## Updating

- **Code/UI change**: rebuild and redeploy the container (step 1 + 2).
  Static-only changes (`public/**`) also need `firebase deploy --only hosting`.
- **Static-only change** (e.g. tweak UI copy): `firebase deploy --only hosting`.
  Cloud Run stays untouched.

---

## Costs worth knowing

| Resource                   | Free tier             | After                |
| -------------------------- | --------------------- | -------------------- |
| Cloud Run CPU              | 180k vCPU-sec / month | $0.000024 / vCPU-sec |
| Cloud Run memory           | 360k GiB-sec / month  | $0.0000025 / GiB-sec |
| Cloud Run requests         | 2M / month            | $0.40 / M            |
| Hosting bandwidth          | 10 GB / month         | $0.15 / GB           |
| Container Registry storage | 0.5 GB                | $0.10 / GB / month   |

One 15s render uses ~90s × 2 vCPU × 2 GiB = 180 vCPU-sec + 360 GiB-sec.
That's ~1000 free renders per month. Beyond that it's roughly **$0.004
per render**. Budget alerts at $5/month will cover anything short of
genuine abuse.

## Abuse prevention (do before going live)

The app currently has no rate limiting. Before sharing the URL publicly:

- Set a **Cloud Billing budget alert** in the GCP console.
- Lower `--max-instances` to `1` if you only need it for yourself.
- Or add `express-rate-limit` with a per-IP cap (~5 req/hour) and
  rebuild — see `server.js` for where to wire it in.

---

## Phase 2b (when you need it)

When in-memory jobs and `/tmp` aren't enough — e.g. you want multiple
container instances or jobs to survive cold starts:

1. Swap the `jobs` Map for a Firestore collection.
2. Swap `fs.writeFileSync` / `fs.readFileSync` in the job flow for
   Firebase Storage SDK calls.
3. Move the upload to a direct client → Storage upload (Firebase SDK in
   the browser, saves bandwidth through Cloud Run).
4. Replace SSE with Firestore realtime listeners on the client.

That migration is a few hundred lines of surgical changes to `server.js`
and `public/app.js`.

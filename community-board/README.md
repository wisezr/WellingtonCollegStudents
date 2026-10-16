# Wellington community board

Visitors can share notes and one attachment per post. Everyone using this service sees the same board. All posts and uploads clear together every five days, anchored to the first server start and saved across restarts. A live countdown shows the next reset.

## Local use

Install Node.js 24 or newer. Open a terminal in this folder, run `node server.js`, and open http://localhost:3000/board.html. No packages or API keys are required. `npm start` is an equivalent start command. Run `npm test` for the integration checks.

The files are `board.html`, `style.css`, `script.js` and `server.js`. The server explicitly serves the board at both `/` and `/board.html`. The brand link returns to https://wellingtoncollegestudents.com/.

## Deployment status

These source files prepare the board for deployment; they do not make its shared API live on GitHub Pages. The existing website and its `CNAME` are retained. No homepage link is activated until the backend has a working public URL.

GitHub Pages serves static files and cannot run `server.js`. Do not use the GitHub Pages URL of this folder as the live board: posting requires the Node.js service below.

## Deploy to a Node.js host

1. Connect this GitHub repository to a host that supports a continuously running Node.js process and persistent disk.
2. Select the branch containing this change for an initial deployment. Once merged, select `main`.
3. Set the service's root directory to `community-board`.
4. Select Node.js 24 or newer. No dependency installation is required; use `node server.js` as the start command.
5. Attach persistent storage and set `DATA_DIR` to its absolute writable mount path. The application honours `PORT`, defaulting to 3000, and listens on `0.0.0.0`.
6. Run one instance. Multiple processes must not share this file-backed store. Ensure the service keeps running while visitors are away; hosts that pause services can delay physical file cleanup until the next start.
7. Open the host's HTTPS URL, publish a test note, upload and download a file, and restart the service. Confirm the note and original countdown survive.
8. In the host's custom-domain settings, add `board.wellingtoncollegestudents.com`. Use exactly the DNS record supplied by that host. Change only the `board` subdomain; leave existing root-domain DNS and `CNAME` in this repository intact. Enable HTTPS through the host.
9. After the custom domain works, add the homepage link shown below.

Hosting, persistent disk and DNS setup depend on the chosen provider. No hosting account, paid plan or DNS records are created by this source change.

### Homepage link after deployment

Add this card inside the existing `.link-grid` in the repository-root `index.html` only after the board URL works:

```html
<a href="https://board.wellingtoncollegestudents.com/" class="link-card">
  <h3>Community Notes Board</h3>
  <p>Share paragraphs, revision notes and useful files. The board resets every five days.</p>
  <span class="open-link">Open Community Board →</span>
</a>
```

Alternatively, link to the hosting provider's working URL until custom DNS is ready. Keep the whole board on the Node.js host so its same-origin `/api/` requests and downloads work without cross-origin changes.

## Optional Docker deployment

From this folder:

```bash
docker build -t wellington-board .
docker volume create wellington-board-data
docker run -d --name wellington-board --restart unless-stopped -p 3000:3000 -v wellington-board-data:/app/data wellington-board
```

The image runs as the non-root `node` user. For a bind mount, make the mounted directory writable by container UID 1000. Put an HTTPS reverse proxy in front for public use. Keep the persistent volume when replacing a container.

## Retention and limits

- Reset periods are exactly 120 hours. Every post expires at the shared deadline, including posts added shortly beforehand.
- A background timer deletes active notes and uploads. Each API request also checks the deadline. Failed upload cleanup retries every minute; expired files are removed from the downloadable index as soon as the new cycle is saved.
- A stopped server catches up before accepting requests, preserving the original cadence. Downloaded copies and external hosting backups are outside the reset.
- One file per post, at most 2 MiB; text at most 5,000 characters; at most 200 posts and 50 MiB of files in each cycle.
- File extensions allowed: PDF, TXT, MD, CSV, DOCX, PPTX, XLSX, PNG, JPG, JPEG and WEBP. Files are forced to download, never rendered inline. File contents are not virus-scanned.
- The board is public to anyone who can reach it. Names are self-entered. There are no accounts or moderation tools.
- Basic upload rate limit: 20 submission attempts per connecting IP per ten minutes. Visitors behind a reverse proxy may share a limit; forwarded IP headers are not trusted automatically.
- User content is rendered as text, downloads expire server-side, responses are not cached, and storage operations are serialized to avoid upload/reset races.
- `data/` and environment files are excluded from commits. Never publish the data directory, uploaded files or hosting credentials to GitHub.

The integration tests cover multi-request sharing, persistence, file bytes, automatic reset without browser requests, reset cadence, input validation, oversized uploads, concurrent posts and inaccessible internal server/data paths.

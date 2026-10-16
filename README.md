# Common Room — shared notes and files

A responsive noticeboard in HTML, CSS and JavaScript, plus a small Node.js server.

## Run it

1. Install Node.js 24 or newer from https://nodejs.org/ if you do not have it.
2. Extract this ZIP and open a terminal in the `notes-board` folder containing `server.js`.
3. Run:

   ```bash
   node server.js
   ```

4. Open http://localhost:3000 in your browser. Keep the terminal running.

No npm packages, API keys or database accounts are required. Opening `index.html` directly, or using VS Code Live Server, will show the design but cannot run the shared board. Use the Node.js server above.

## Files

- `index.html`: page layout and posting form.
- `style.css`: navy and light-blue styling, including mobile layouts.
- `script.js`: posting, uploads, filters, search, polling and countdown.
- `server.js`: shared data, upload validation, downloads and the five-day reset.

## Let other people use it

Deploy this whole folder to a service that runs a persistent Node.js process, with the start command `node server.js`. Give everyone that server's website URL. A static-only host cannot run this backend. This package has not been deployed.

Use one server instance and a persistent writable disk. The server honours the host's `PORT` variable. Set `DATA_DIR` to an absolute directory on the persistent disk; otherwise data is stored in the `data` folder beside `server.js`. Keep that directory outside any public static file directory. Restarting or redeploying with the same data preserves the board and its reset schedule. Replacing an ephemeral disk loses them.

The board is shared with everyone who can reach the website, without accounts. Display names are self-entered. It does not connect automatically to an existing school website: link to its deployed URL from your menu. For a public deployment, use your host's HTTPS address. Access restrictions, if wanted, can be applied by your host.

## How the five-day reset works

- The first server start creates a common reset deadline exactly five days (120 hours) later.
- All notes and files clear together at that deadline, even if someone posted just before it. This is a whole-board reset, not five days of retention for each post.
- The server saves the deadline on disk. Refreshing a browser or restarting the server does not restart the five-day clock.
- A server-side timer clears posts and deletes uploads without a visitor needing to open the website. Each API request also checks expiry before serving data. Failed upload cleanup is retried every minute; expired attachments are inaccessible immediately after the saved board clears.
- If the server is switched off at the deadline, it clears expired data on its next start before accepting requests, keeping the original five-day cadence. A powered-off server cannot physically delete files until it runs again.
- Browsers refresh the board every 15 seconds and hide expired content when their countdown reaches zero. Existing downloaded copies cannot be erased remotely.
- This deletes the application's active files; any separate hosting backups follow the host's retention settings.

## Limits and editing

Each post needs a title and either text or an attachment. Text is limited to 5,000 characters. One non-empty attachment per post, up to 2 MiB (shown as 2 MB), is accepted. Supported extensions: PDF, TXT, MD, CSV, DOCX, PPTX, XLSX, PNG, JPG, JPEG and WEBP. Attachments are downloaded rather than executed or embedded; file contents are not virus-scanned.

There are at most 200 posts and 50 MiB of attachments per cycle. The server limits each connecting IP address to 20 submission attempts per ten minutes. Behind a reverse proxy, visitors may share the same limit because forwarded IP headers are deliberately not trusted.

Edit the colours at the top of `style.css`. Change the `FIVE_DAYS` constant at the top of `server.js` to change future interval lengths. Stop the server and intentionally remove the `data` folder to erase all content and start a completely new schedule. Ordinary changes to the page do not require deleting data.

Do not run several server processes against the same data directory. For a large public community, extend the server with accounts, moderation and database/object storage as needed.

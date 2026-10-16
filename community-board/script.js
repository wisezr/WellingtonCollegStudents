/* All posts come from the shared server, so every visitor sees the same board. */
"use strict";
const $ = (selector) => document.querySelector(selector);
const form = $("#post-form");
const attachment = $("#attachment");
const MAX_FILE_BYTES = 2 * 1024 * 1024;
let posts = [];
let filter = "all";
let nextResetAt = 0;
let serverOffset = 0;
let connected = false;
let refreshing = false;
let requestVersion = 0;
let expired = false;

function setStatus(message, type = "") {
  $("#form-status").textContent = message;
  $("#form-status").className = `status ${type}`;
}

async function api(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) throw new Error("Start the included server with node server.js to use this page.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed. Please try again.");
  return result;
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content; // User content is never interpreted as HTML.
  return node;
}

function renderPosts() {
  const query = $("#search").value.trim().toLowerCase();
  const visible = posts.filter((post) => {
    const matchesType = filter === "all" || (filter === "files" ? !!post.file : !!post.body);
    const text = [post.title, post.body, post.author, post.file?.name || ""].join(" ").toLowerCase();
    return matchesType && text.includes(query);
  });
  $("#post-count").textContent = posts.length;
  const fragment = document.createDocumentFragment();
  for (const post of visible) {
    const card = element("article", "post panel");
    const top = element("div", "post-top");
    const time = element("time", "post-date", new Date(post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    time.dateTime = new Date(post.createdAt).toISOString();
    time.title = new Date(post.createdAt).toLocaleString();
    top.append(element("span", "post-type", post.file ? "FILE + RESOURCE" : "NOTE"), time);
    card.append(top, element("h3", "", post.title));
    if (post.body) card.append(element("p", "post-body", post.body));
    if (post.file) {
      const link = element("a", "attachment-link");
      link.href = `/api/files/${encodeURIComponent(post.id)}`;
      link.download = post.file.name;
      const detail = element("span", "", post.file.name);
      detail.append(element("span", "attachment-size", `${Math.max(1, Math.round(post.file.size / 1024))} KB · Download attachment`));
      link.append(detail, element("span", "", "↓"));
      card.append(link);
    }
    card.append(element("p", "post-author", `Shared by ${post.author}`));
    fragment.append(card);
  }
  $("#posts").replaceChildren(fragment);
  $("#empty-state").hidden = visible.length > 0 || (!connected && !expired);
  const hasPosts = posts.length > 0;
  $("#empty-title").textContent = hasPosts ? "Nothing matches just yet." : "A clean page. A new idea.";
  $("#empty-description").textContent = hasPosts ? "Try another search or filter." : "Be the first to share something with the room.";
}

function applyBoard(board) {
  nextResetAt = board.nextResetAt;
  serverOffset = board.serverTime - Date.now();
  posts = board.posts;
  connected = true;
  expired = false;
  $("#connection-status").textContent = "● Connected";
  $("#connection-status").className = "connection online";
  $("#board-status").textContent = "";
  $("#reset-date").textContent = `Next reset: ${new Date(nextResetAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
  renderPosts();
  updateCountdown();
}

async function refreshBoard() {
  if (refreshing) return;
  refreshing = true;
  const version = requestVersion;
  try {
    const board = await api("/api/board");
    if (version === requestVersion) applyBoard(board);
  } catch (error) {
    if (version !== requestVersion) return;
    connected = false;
    $("#connection-status").textContent = "● Reconnecting…";
    $("#connection-status").className = "connection";
    $("#board-status").textContent = `${error.message} Reconnecting automatically.`;
    $("#board-status").className = "status error";
  } finally { refreshing = false; }
}

function updateCountdown() {
  if (!nextResetAt) return;
  const seconds = Math.max(0, Math.ceil((nextResetAt - (Date.now() + serverOffset)) / 1000));
  if (seconds === 0) {
    $("#countdown").textContent = "Starting fresh…";
    if (!expired) {
      expired = true;
      posts = [];
      renderPosts(); // Hide expired posts even if this browser is temporarily offline.
    }
    return;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remaining = seconds % 60;
  $("#countdown").textContent = `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(remaining).padStart(2, "0")}s`;
}

function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(new Error("This file could not be read. Please choose it again."));
    reader.readAsDataURL(file);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("#title").value.trim();
  const body = $("#body").value.trim();
  const file = attachment.files[0];
  if (!title) return setStatus("Please give your post a title.", "error");
  if (!body && !file) return setStatus("Write a note or attach a file first.", "error");
  if (file && (file.size > MAX_FILE_BYTES || file.size === 0)) return setStatus("Choose a non-empty file up to 2 MB.", "error");
  const button = $("#submit-button");
  button.disabled = true;
  setStatus("Publishing…");
  try {
    const payload = { title, body, author: $("#author").value.trim() };
    if (file) payload.file = { name: file.name, data: await fileAsBase64(file) };
    const board = await api("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    requestVersion++; // An older in-flight poll must not overwrite this successful publish.
    applyBoard(board);
    form.reset();
    $("#character-count").textContent = "0 / 5,000";
    $("#remove-file").hidden = true;
    setStatus("Your post is on the board. Thanks for sharing!", "success");
  } catch (error) { setStatus(error.message, "error"); }
  finally { button.disabled = false; }
});

$("#body").addEventListener("input", () => { $("#character-count").textContent = `${$("#body").value.length.toLocaleString()} / 5,000`; });
attachment.addEventListener("change", () => {
  $("#remove-file").hidden = !attachment.files.length;
  if (attachment.files[0]?.size > MAX_FILE_BYTES) setStatus("That file exceeds 2 MB. Please choose a smaller one.", "error");
  else setStatus("");
});
$("#remove-file").addEventListener("click", () => { attachment.value = ""; $("#remove-file").hidden = true; setStatus(""); });
$("#search").addEventListener("input", renderPosts);
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
  filter = tab.dataset.filter;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button === tab);
    button.setAttribute("aria-pressed", String(button === tab));
  });
  renderPosts();
}));
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { updateCountdown(); refreshBoard(); }
});
refreshBoard();
setInterval(refreshBoard, 15000);
setInterval(updateCountdown, 1000);

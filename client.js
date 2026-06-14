import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { storageApiBaseUrl } from "./storage-config.js";

const emailInput = document.querySelector("#emailInput");
const passwordInput = document.querySelector("#passwordInput");
const loginButton = document.querySelector("#loginButton");
const openRegisterButton = document.querySelector("#openRegisterButton");
const registerOverlay = document.querySelector("#registerOverlay");
const registerEmailInput = document.querySelector("#registerEmailInput");
const registerPasswordInput = document.querySelector("#registerPasswordInput");
const registerButton = document.querySelector("#registerButton");
const closeRegisterButton = document.querySelector("#closeRegisterButton");
const registerMessage = document.querySelector("#registerMessage");
const loginPanel = document.querySelector("#loginPanel");
const loginMessage = document.querySelector("#loginMessage");
const storageArea = document.querySelector("#storageArea");
const logoutButton = document.querySelector("#logoutButton");
const serverState = document.querySelector("#serverState");
const quotaUsedText = document.querySelector("#quotaUsedText");
const quotaLimitText = document.querySelector("#quotaLimitText");
const quotaPercentText = document.querySelector("#quotaPercentText");
const quotaFill = document.querySelector("#quotaFill");
const folderGrid = document.querySelector("#folderGrid");
const currentPathLabel = document.querySelector("#currentPath");
const fileList = document.querySelector("#fileList");
const fileInput = document.querySelector("#fileInput");
const folderInput = document.querySelector("#folderInput");
const folderButton = document.querySelector("#folderButton");
const backButton = document.querySelector("#backButton");
const forwardButton = document.querySelector("#forwardButton");
const homeButton = document.querySelector("#homeButton");
const refreshButton = document.querySelector("#refreshButton");

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let currentPath = "";
let rootFolders = [];
let pathHistory = [""];
let historyIndex = 0;

function setMessage(element, text, isError = false) {
  if (!element) {
    return;
  }

  element.textContent = text;
  element.classList.toggle("error", isError);
}

function updateNavButtons() {
  backButton.disabled = historyIndex <= 0;
  forwardButton.disabled = historyIndex >= pathHistory.length - 1;
  homeButton.disabled = currentPath === "";
}

function showStorage(user) {
  loginPanel.classList.add("hidden");
  storageArea.classList.remove("hidden");
  logoutButton.classList.remove("hidden");
  serverState.textContent = user.email || "已登录";
  serverState.classList.add("online");
  updateNavButtons();
}

function showLogin() {
  loginPanel.classList.remove("hidden");
  storageArea.classList.add("hidden");
  logoutButton.classList.add("hidden");
  serverState.textContent = "未登录";
  serverState.classList.remove("online");
  quotaUsedText.textContent = "--";
  quotaLimitText.textContent = "--";
  quotaPercentText.textContent = "--";
  quotaFill.style.width = "0%";
  folderGrid.innerHTML = "";
}

function openRegister() {
  registerOverlay.classList.remove("hidden");
  registerOverlay.setAttribute("aria-hidden", "false");
  registerEmailInput.value = emailInput.value.trim();
  registerPasswordInput.value = "";
  setMessage(registerMessage, "");
  registerEmailInput.focus();
}

function closeRegister() {
  registerOverlay.classList.add("hidden");
  registerOverlay.setAttribute("aria-hidden", "true");
}

function joinPath(base, name) {
  return [base, name].filter(Boolean).join("/");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isImageFile(file) {
  return /\.(png|jpe?g|gif|webp)$/i.test(file.name || file.path || "");
}

function formatSize(bytes) {
  if (!bytes) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function apiUrl(path) {
  if (!storageApiBaseUrl) {
    return path;
  }

  return `${storageApiBaseUrl.replace(/\/$/, "")}${path}`;
}

async function getIdToken() {
  if (!auth.currentUser) {
    throw new Error("请先登录");
  }

  return auth.currentUser.getIdToken();
}

async function authHeaders(extra = {}) {
  return {
    ...extra,
    "x-firebase-token": await getIdToken()
  };
}

async function request(url, options = {}) {
  const response = await fetch(apiUrl(url), {
    ...options,
    headers: await authHeaders(options.headers)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "请求失败");
  }

  return response;
}

async function previewUrl(path) {
  const idToken = await getIdToken();
  return apiUrl(`/api/preview?path=${encodeURIComponent(path)}&idToken=${encodeURIComponent(idToken)}`);
}

async function refreshQuota() {
  const response = await request("/api/quota");
  const quota = await response.json();
  const limitText = quota.limit ? formatSize(quota.limit) : "不限";
  const percent = quota.limit ? Math.min((quota.used / quota.limit) * 100, 100) : 0;

  quotaUsedText.textContent = formatSize(quota.used);
  quotaLimitText.textContent = limitText;
  quotaPercentText.textContent = quota.limit ? `已使用 ${percent.toFixed(1)}%` : "不限容量";
  quotaFill.style.width = `${percent}%`;
  quotaFill.classList.toggle("warning", percent >= 85);
}

async function login() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage(loginMessage, "请输入邮箱和密码", true);
    return;
  }

  loginButton.disabled = true;
  setMessage(loginMessage, "正在登录...");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    setMessage(loginMessage, "");
  } catch (error) {
    setMessage(loginMessage, error.message, true);
  } finally {
    loginButton.disabled = false;
  }
}

async function register() {
  const email = registerEmailInput.value.trim();
  const password = registerPasswordInput.value;

  if (!email || !password) {
    setMessage(registerMessage, "请输入邮箱和密码", true);
    return;
  }

  registerButton.disabled = true;
  setMessage(registerMessage, "正在注册...");

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    setMessage(registerMessage, "");
    closeRegister();
  } catch (error) {
    setMessage(registerMessage, error.message, true);
  } finally {
    registerButton.disabled = false;
  }
}

async function logout() {
  await signOut(auth);
  fileList.innerHTML = "";
  currentPath = "";
  rootFolders = [];
  pathHistory = [""];
  historyIndex = 0;
  showLogin();
}

function folderIcon() {
  return `
    <svg class="folder-icon" viewBox="0 0 64 52" aria-hidden="true">
      <path d="M3 13c0-3.3 2.7-6 6-6h14.4c2 0 3.8 1 4.9 2.7l2.1 3.3H55c3.3 0 6 2.7 6 6v28c0 3.3-2.7 6-6 6H9c-3.3 0-6-2.7-6-6Z" fill="#55a7ff"/>
      <path d="M3 22c0-3.3 2.7-6 6-6h46c3.3 0 6 2.7 6 6v25c0 3.3-2.7 6-6 6H9c-3.3 0-6-2.7-6-6Z" fill="#2f8cff"/>
      <path d="M7 24c0-2 1.6-3.6 3.6-3.6h42.8c2 0 3.6 1.6 3.6 3.6v2H7Z" fill="#7fc0ff" opacity=".65"/>
    </svg>
  `;
}

async function loadRootFolders() {
  const response = await request("/api/files?path=");
  const data = await response.json();
  rootFolders = data.files.filter((file) => file.type === "folder");
  renderRootFolders();
}

function renderRootFolders() {
  if (rootFolders.length === 0) {
    folderGrid.innerHTML = `<div class="folder-empty">还没有文件夹</div>`;
    return;
  }

  folderGrid.innerHTML = rootFolders.map((folder) => `
    <article class="folder-tile ${folder.path === currentPath ? "active" : ""}" data-folder-path="${escapeHtml(folder.path)}">
      <button class="folder-open" type="button" data-open-folder>
        ${folderIcon()}
        <span>${escapeHtml(folder.name)}</span>
      </button>
      <button class="folder-delete" type="button" data-delete-folder aria-label="删除 ${escapeHtml(folder.name)}">×</button>
    </article>
  `).join("");
}

async function loadFiles(path = currentPath) {
  currentPath = path;
  currentPathLabel.textContent = `/${currentPath}`;

  const response = await request(`/api/files?path=${encodeURIComponent(currentPath)}`);
  const data = await response.json();
  const visibleFiles = currentPath ? data.files : data.files.filter((file) => file.type !== "folder");

  await renderFiles(visibleFiles);
  renderRootFolders();
  updateNavButtons();
  await refreshQuota();
}

async function navigateTo(path) {
  if (path !== currentPath) {
    pathHistory = pathHistory.slice(0, historyIndex + 1);
    pathHistory.push(path);
    historyIndex = pathHistory.length - 1;
  }

  await loadFiles(path);
}

async function goBack() {
  if (historyIndex <= 0) {
    return;
  }

  historyIndex -= 1;
  await loadFiles(pathHistory[historyIndex]);
}

async function goForward() {
  if (historyIndex >= pathHistory.length - 1) {
    return;
  }

  historyIndex += 1;
  await loadFiles(pathHistory[historyIndex]);
}

async function goHome() {
  await navigateTo("");
}

async function refreshCurrentView() {
  await loadRootFolders();
  await loadFiles(currentPath);
}

async function filePreview(file) {
  if (file.type === "folder") {
    return `<div class="file-thumb folder-thumb">${folderIcon()}</div>`;
  }

  if (isImageFile(file)) {
    const url = await previewUrl(file.path);
    return `<img class="file-thumb image-thumb" src="${url}" alt="${escapeHtml(file.name)}" loading="lazy">`;
  }

  return `<div class="file-thumb file-thumb-generic">文件</div>`;
}

async function renderFiles(files) {
  if (files.length === 0) {
    fileList.innerHTML = `<div class="empty">这里还没有文件</div>`;
    return;
  }

  const rows = await Promise.all(files.map(async (file) => `
    <article class="file-row" data-path="${escapeHtml(file.path)}" data-type="${file.type}">
      ${await filePreview(file)}
      <div class="file-name">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${file.type === "folder" ? "文件夹" : formatSize(file.size)} · ${new Date(file.modifiedAt).toLocaleString()}</span>
      </div>
      <div class="file-actions">
        ${file.type === "folder" ? `<button data-open type="button">打开</button>` : `<button data-download type="button">下载</button>`}
        <button class="danger" data-delete type="button">删除</button>
      </div>
    </article>
  `));

  fileList.innerHTML = rows.join("");
}

async function uploadFiles(files) {
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const targetPath = joinPath(currentPath, relativePath.replaceAll("\\", "/"));

    await request(`/api/files?path=${encodeURIComponent(targetPath)}`, {
      method: "PUT",
      body: file
    });
  }

  await refreshCurrentView();
}

async function createFolder() {
  const name = window.prompt("文件夹名称");
  const folderName = name?.trim();

  if (!folderName) {
    return;
  }

  await request("/api/folders", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      path: folderName
    })
  });

  await loadRootFolders();
  await navigateTo(folderName);
}

async function deleteItem(path) {
  const confirmed = window.confirm("确定要删除吗？");

  if (!confirmed) {
    return;
  }

  await request(`/api/files?path=${encodeURIComponent(path)}`, {
    method: "DELETE"
  });

  if (currentPath === path || currentPath.startsWith(`${path}/`)) {
    pathHistory = [""];
    historyIndex = 0;
    await loadRootFolders();
    await loadFiles("");
    return;
  }

  await refreshCurrentView();
}

async function downloadItem(path) {
  const idToken = await getIdToken();
  const url = apiUrl(`/api/download?path=${encodeURIComponent(path)}&idToken=${encodeURIComponent(idToken)}`);
  window.open(url, "_blank");
}

folderGrid.addEventListener("click", async (event) => {
  const tile = event.target.closest(".folder-tile");

  if (!tile) {
    return;
  }

  const folderPath = tile.dataset.folderPath;

  if (event.target.closest("[data-delete-folder]")) {
    await deleteItem(folderPath);
    return;
  }

  if (event.target.closest("[data-open-folder]")) {
    await navigateTo(folderPath);
  }
});

fileList.addEventListener("click", async (event) => {
  const row = event.target.closest(".file-row");

  if (!row) {
    return;
  }

  const path = row.dataset.path;

  if (event.target.matches("[data-open]")) {
    await navigateTo(path);
  }

  if (event.target.matches("[data-download]")) {
    await downloadItem(path);
  }

  if (event.target.matches("[data-delete]")) {
    await deleteItem(path);
  }
});

loginButton.addEventListener("click", login);
openRegisterButton.addEventListener("click", openRegister);
registerButton.addEventListener("click", register);
closeRegisterButton.addEventListener("click", closeRegister);
registerOverlay.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-register]")) {
    closeRegister();
  }
});

passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    login();
  }
});

registerPasswordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    register();
  }
});

logoutButton.addEventListener("click", () => logout().catch((error) => alert(error.message)));
backButton.addEventListener("click", () => goBack().catch((error) => alert(error.message)));
forwardButton.addEventListener("click", () => goForward().catch((error) => alert(error.message)));
homeButton.addEventListener("click", () => goHome().catch((error) => alert(error.message)));
refreshButton.addEventListener("click", () => refreshCurrentView().catch((error) => alert(error.message)));

fileInput.addEventListener("change", async () => {
  try {
    await uploadFiles(Array.from(fileInput.files));
  } catch (error) {
    alert(error.message === "Storage quota exceeded" ? "容量已超过 3GB，无法继续上传。" : error.message);
    await refreshQuota().catch(() => {});
  } finally {
    fileInput.value = "";
  }
});

folderInput.addEventListener("change", async () => {
  try {
    await uploadFiles(Array.from(folderInput.files));
  } catch (error) {
    alert(error.message === "Storage quota exceeded" ? "容量已超过 3GB，无法继续上传。" : error.message);
    await refreshQuota().catch(() => {});
  } finally {
    folderInput.value = "";
  }
});

folderButton.addEventListener("click", () => createFolder().catch((error) => {
  alert(error.message);
}));

onAuthStateChanged(auth, (user) => {
  if (!user) {
    showLogin();
    return;
  }

  currentPath = "";
  pathHistory = [""];
  historyIndex = 0;
  showStorage(user);
  Promise.all([loadRootFolders(), refreshQuota()])
    .then(() => loadFiles(""))
    .catch((error) => {
      setMessage(loginMessage, error.message, true);
    });
});

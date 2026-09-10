import {
  initFirebase,
  isFirebaseConfigured,
  ref,
  get,
  set,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp
} from "./firebase.js";
import {
  extractYouTubeVideoId,
  youtubeThumbnail,
  sortQueueEntries,
  escapeHtml
} from "./queue.js?v=20260909-singerremote1";
import {
  isYouTubeSearchConfigured,
  searchYouTubeVideos
} from "./youtube.js";

const GUEST_BUILD = "20260910-stylepack20";

function uniqueReservationId(guestId, videoId) {
  const randomPart = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replaceAll("-", "")
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
  return `${guestId}_${Date.now().toString(36)}_${randomPart}_${videoId}`;
}

const joinPanel = document.querySelector("#joinPanel");
const roomPanel = document.querySelector("#roomPanel");
const joinForm = document.querySelector("#joinForm");
const sessionInput = document.querySelector("#sessionInput");
const nameInput = document.querySelector("#nameInput");
const guestMessage = document.querySelector("#guestMessage");
const configWarning = document.querySelector("#configWarning");
const connectionStatus = document.querySelector("#connectionStatus");
const displayName = document.querySelector("#displayName");
const displaySession = document.querySelector("#displaySession");
const roomHostStatus = document.querySelector("#roomHostStatus");
const roomGuestCount = document.querySelector("#roomGuestCount");
const leaveBtn = document.querySelector("#leaveBtn");
const reserveForm = document.querySelector("#reserveForm");
const reserveBtn = document.querySelector("#reserveBtn");
const reserveMessage = document.querySelector("#reserveMessage");
const songTitleInput = document.querySelector("#songTitleInput");
const youtubeInput = document.querySelector("#youtubeInput");
const reservationState = document.querySelector("#reservationState");
const reservationLockedNotice = document.querySelector("#reservationLockedNotice");
const guestQueue = document.querySelector("#guestQueue");
const mySongs = document.querySelector("#mySongs");
const queueCount = document.querySelector("#queueCount");
const guestNowTitle = document.querySelector("#guestNowTitle");
const guestNowBody = document.querySelector("#guestNowBody");
const guestPlaybackState = document.querySelector("#guestPlaybackState");
const guestOwnControls = document.querySelector("#guestOwnControls");
const guestPlayPauseBtn = document.querySelector("#guestPlayPauseBtn");
const guestSkipBtn = document.querySelector("#guestSkipBtn");
const youtubeSearchWarning = document.querySelector("#youtubeSearchWarning");
const searchForm = document.querySelector("#searchForm");
const searchInput = document.querySelector("#searchInput");
const searchBtn = document.querySelector("#searchBtn");
const searchMessage = document.querySelector("#searchMessage");
const searchResults = document.querySelector("#searchResults");
const previewModal = document.querySelector("#previewModal");
const previewFrame = document.querySelector("#previewFrame");
const previewTitle = document.querySelector("#previewTitle");
const previewChannel = document.querySelector("#previewChannel");
const previewReserveBtn = document.querySelector("#previewReserveBtn");
const closePreviewBtn = document.querySelector("#closePreviewBtn");
const guestMobileTabs = document.querySelector("#guestMobileTabs");
const guestTabButtons = [...document.querySelectorAll("[data-guest-tab]")];
const guestTabPanels = [...document.querySelectorAll("[data-guest-panel]")];
const guestThemeBadge = document.querySelector("#guestThemeBadge");
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

const TV_THEME_IDS = new Set(["classic", "neon", "studio", "disco", "ocean", "christmas", "spider", "gold", "pink", "minimal", "maximal", "futuristic", "vector", "collage", "retro", "cyberpunk", "popart", "glass", "clay", "pixel", "editorial", "y2k", "swiss", "surreal", "bohemian", "victorian", "graffiti", "aurora", "handwritten"]);
const TV_THEME_LABELS = {
  classic: "Classic Videoke",
  neon: "Neon Night",
  studio: "Light Studio",
  disco: "Disco RGB",
  ocean: "Ocean Blue",
  christmas: "Christmas",
  spider: "Spider Hero",
  gold: "Gold Luxury",
  pink: "Pink Cute",
  minimal: "Minimalism",
  maximal: "Maximalism",
  futuristic: "Futuristic",
  vector: "Vector Art",
  collage: "Collage Art",
  retro: "Retro",
  cyberpunk: "Cyberpunk",
  popart: "Pop Art",
  glass: "Glass Morphism",
  clay: "Clay Style",
  pixel: "Pixel Art",
  editorial: "Editorial",
  y2k: "Y2K",
  swiss: "Swiss Design",
  surreal: "Surreal Design",
  bohemian: "Bohemian",
  victorian: "Victorian Style",
  graffiti: "Graffiti",
  aurora: "Aurora",
  handwritten: "Handwritten"
};
const TV_THEME_META_COLORS = {
  classic: "#090a0e",
  neon: "#08051a",
  studio: "#f7efe2",
  disco: "#170022",
  ocean: "#082b3a",
  christmas: "#0b2418",
  spider: "#071b36",
  gold: "#17120a",
  pink: "#3a1730",
  minimal: "#f2f1ed",
  maximal: "#43114f",
  futuristic: "#06131c",
  vector: "#143d6b",
  collage: "#e8dcc7",
  retro: "#5b321c",
  cyberpunk: "#0b0b12",
  popart: "#ffd93b",
  glass: "#18243e",
  clay: "#f4d7c9",
  pixel: "#111022",
  editorial: "#f4f0e8",
  y2k: "#d7e7f4",
  swiss: "#f7f7f5",
  surreal: "#331b63",
  bohemian: "#6f3f2f",
  victorian: "#241613",
  graffiti: "#191a20",
  aurora: "#071521",
  handwritten: "#f1ead8"
};

let db;
let user;
let activeSessionId = null;
let activeName = null;
let activeJoinedAt = null;
let guestRef = null;
let reservationsLocked = false;
let currentQueue = [];
let currentSong = null;
let currentSearchResults = new Map();
let previewVideo = null;
let lastSearchAt = 0;
let unsubscribeConnection = null;
let unsubscribeHost = null;
let unsubscribeGuestCount = null;
let unsubscribeSettings = null;
let unsubscribeQueue = null;
let unsubscribeCurrentSong = null;
let singerControlBusy = false;
let guestDisconnectAction = null;
let roomResyncTimer = null;
let roomResyncInFlight = false;
let roomListenerGeneration = 0;
let activeGuestTheme = "classic";
let guestThemeTransitionTimer = null;

function normalizeGuestTheme(value) {
  return TV_THEME_IDS.has(value) ? value : "classic";
}

function savedGuestTheme() {
  return normalizeGuestTheme(localStorage.getItem("openKaraokeGuestTheme") || "classic");
}

function applyGuestTheme(theme, { animate = true } = {}) {
  const normalized = normalizeGuestTheme(theme);
  const changed = normalized !== activeGuestTheme;
  activeGuestTheme = normalized;
  document.body.dataset.tvTheme = normalized;
  document.body.dataset.guestTheme = normalized;
  localStorage.setItem("openKaraokeGuestTheme", normalized);

  if (guestThemeBadge) guestThemeBadge.textContent = TV_THEME_LABELS[normalized] || "Karaoke Theme";
  if (themeColorMeta) themeColorMeta.setAttribute("content", TV_THEME_META_COLORS[normalized] || "#0b1020");

  if (changed && animate) {
    document.body.classList.remove("guest-theme-switching");
    void document.body.offsetWidth;
    document.body.classList.add("guest-theme-switching");
    window.clearTimeout(guestThemeTransitionTimer);
    guestThemeTransitionTimer = window.setTimeout(() => {
      document.body.classList.remove("guest-theme-switching");
    }, 680);
  }
}

function normalizeSession(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  // QR scanners can pass either the room code, a full URL, or an encoded URL.
  for (let i = 0; i < 2; i += 1) {
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded === raw) break;
      raw = decoded;
    } catch {
      break;
    }
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      raw = parsed.searchParams.get("session") || raw;
    }
  } catch {
    // Keep the original value and normalize it below.
  }

  let code = raw
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "");

  if (code && !code.startsWith("KARAOKE-")) code = `KARAOKE-${code}`;
  return code;
}

function isValidSessionCode(value) {
  return /^KARAOKE-[A-Z0-9]{4,12}$/.test(String(value || ""));
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `form-message ${type}`.trim();
}

function setConnection(isOnline) {
  connectionStatus.textContent = isOnline ? "Online" : "Offline";
  connectionStatus.dataset.state = isOnline ? "online" : "offline";
}

function setGuestTab(tabName, { scroll = false } = {}) {
  const valid = ["search", "queue", "mine"].includes(tabName) ? tabName : "search";
  guestTabButtons.forEach(button => {
    const active = button.dataset.guestTab === valid;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  guestTabPanels.forEach(panel => {
    const active = panel.dataset.guestPanel === valid;
    panel.classList.toggle("is-active", active);
  });
  if (scroll && guestMobileTabs && window.matchMedia("(max-width: 620px)").matches) {
    guestMobileTabs.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderQueue() {
  const waiting = currentQueue.filter(([, item]) => item?.status === "waiting");
  queueCount.textContent = `${waiting.length} ${waiting.length === 1 ? "song" : "songs"}`;

  if (!waiting.length) {
    guestQueue.className = "song-list empty-state";
    guestQueue.textContent = currentSong ? "No more songs waiting after the current song." : "No songs reserved yet.";
  } else {
    guestQueue.className = "song-list";
    guestQueue.innerHTML = waiting.map(([id, item], index) => {
      const isMine = item.guestId === user?.uid;
      return `
        <div class="song-item ${isMine ? "is-mine" : ""}">
          <div class="song-position">${index + 1}</div>
          <img class="song-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
          <div class="song-info">
            <strong>${escapeHtml(item.title)}</strong>
            <span>👤 ${escapeHtml(item.singerName)} ${isMine ? '<b class="mine-badge">YOU</b>' : ""}</span>
          </div>
        </div>`;
    }).join("");
  }

  const mine = waiting.filter(([, item]) => item.guestId === user?.uid);
  if (!mine.length) {
    mySongs.className = "song-list empty-state";
    mySongs.textContent = "You have no waiting songs.";
  } else {
    mySongs.className = "song-list";
    mySongs.innerHTML = mine.map(([id, item]) => {
      const overallIndex = waiting.findIndex(([queueId]) => queueId === id) + 1;
      return `
        <div class="song-item my-song-item">
          <img class="song-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
          <div class="song-info">
            <strong>${escapeHtml(item.title)}</strong>
            <span>#${overallIndex} in queue</span>
          </div>
          <button class="btn btn-danger btn-small" data-cancel-song="${escapeHtml(id)}">Cancel</button>
        </div>`;
    }).join("");
  }
}

function renderSingerControls(state = "idle") {
  const ownsCurrentSong = Boolean(currentSong && user?.uid && currentSong.guestId === user.uid);
  guestOwnControls.hidden = !ownsCurrentSong;

  if (!ownsCurrentSong) {
    singerControlBusy = false;
    guestPlayPauseBtn.disabled = false;
    guestSkipBtn.disabled = false;
    guestSkipBtn.textContent = "⏭ Skip My Song";
    return;
  }

  const isPlaying = state === "playing";
  guestPlayPauseBtn.textContent = isPlaying ? "⏸ Pause" : "▶ Play";
  guestPlayPauseBtn.dataset.action = isPlaying ? "pause" : "play";
  guestPlayPauseBtn.disabled = singerControlBusy;
  guestSkipBtn.disabled = singerControlBusy;
  guestSkipBtn.textContent = singerControlBusy ? "Please wait…" : "⏭ Skip My Song";
}
function singerRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll("-", "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

async function sendSingerControl(action) {
  if (!activeSessionId || !user?.uid || !currentSong) {
    throw new Error("No active song to control.");
  }
  if (currentSong.guestId !== user.uid) {
    throw new Error("You can only control your own current song.");
  }
  if (!["play", "pause", "skip"].includes(action)) {
    throw new Error("Invalid singer control.");
  }

  const requestId = singerRequestId();
  const requestRef = ref(db, `sessions/${activeSessionId}/controlRequests/${user.uid}/${requestId}`);
  await set(requestRef, {
    action,
    queueItemId: currentSong.queueItemId,
    requestId,
    createdAt: Date.now()
  });
}

function renderCurrentSong(song) {
  const previousQueueItemId = currentSong?.queueItemId || null;
  currentSong = song || null;
  const nextQueueItemId = currentSong?.queueItemId || null;

  if (previousQueueItemId !== nextQueueItemId) {
    singerControlBusy = false;
  }

  if (!currentSong) {
    guestNowTitle.textContent = "Nothing playing yet";
    guestPlaybackState.textContent = "IDLE";
    guestPlaybackState.dataset.state = "idle";
    guestNowBody.innerHTML = '<div class="guest-now-placeholder">The current song will appear here when the Host starts playback.</div>';
    renderSingerControls("idle");
    renderQueue();
    return;
  }

  const state = ["playing", "paused", "stopped", "error"].includes(currentSong.playbackState)
    ? currentSong.playbackState
    : "playing";

  guestNowTitle.textContent = currentSong.title || "Untitled song";
  guestPlaybackState.textContent = state.toUpperCase();
  guestPlaybackState.dataset.state = state;
  guestNowBody.innerHTML = `
    <img class="guest-now-thumb" src="${escapeHtml(currentSong.thumbnail || youtubeThumbnail(currentSong.youtubeVideoId))}" alt="">
    <div class="guest-now-info">
      <strong>${escapeHtml(currentSong.title || "Untitled song")}</strong>
      <span>👤 ${escapeHtml(currentSong.singerName || "Guest")}</span>
    </div>`;
  renderSingerControls(state);
  renderQueue();
}

function setReservationLockState(locked) {
  reservationsLocked = locked === true;
  reservationLockedNotice.hidden = !reservationsLocked;
  reservationState.textContent = reservationsLocked ? "🔒 Locked" : "● Open";
  reservationState.dataset.locked = String(reservationsLocked);
  reserveBtn.disabled = reservationsLocked;
  songTitleInput.disabled = reservationsLocked;
  youtubeInput.disabled = reservationsLocked;
  searchResults.querySelectorAll("[data-reserve-id]").forEach(button => {
    button.disabled = reservationsLocked;
  });
  previewReserveBtn.disabled = reservationsLocked;
}

function setYouTubeSearchState() {
  const configured = isYouTubeSearchConfigured();
  youtubeSearchWarning.hidden = configured;
  searchBtn.disabled = !configured;
  searchInput.disabled = !configured;
  if (!configured) {
    setMessage(searchMessage, "Search needs a YouTube Data API key. The direct-link reservation below still works.");
  }
}

async function registerDisconnectCleanup(reference) {
  // Keep the guest record during temporary mobile disconnects so Firebase
  // read permissions remain valid. Only flip online=false on disconnect.
  try {
    try { await guestDisconnectAction?.cancel?.(); } catch {}
    const disconnect = onDisconnect(reference);
    await disconnect.update({
      online: false,
      lastSeen: serverTimestamp()
    });
    guestDisconnectAction = disconnect;
  } catch (error) {
    console.warn("Guest disconnect presence could not be registered.", error);
  }
}
async function joinSession(sessionId, singerName) {
  const context = await initFirebase();
  const database = context?.db;
  const currentUser = context?.user;

  if (!database || !currentUser?.uid) {
    throw new Error("Firebase is not ready yet. Refresh the page and try again.");
  }

  const sessionMetaRef = ref(database, `sessions/${sessionId}/meta`);
  const sessionSnapshot = await get(sessionMetaRef);

  if (!sessionSnapshot.exists()) {
    throw new Error("Session not found. Check the code or ask the host for a new QR code.");
  }

  const thisGuestRef = ref(database, `sessions/${sessionId}/guests/${currentUser.uid}`);
  const now = Date.now();

  await set(thisGuestRef, {
    name: singerName,
    joinedAt: now,
    lastSeen: now,
    online: true
  });

  // Assign the active room context BEFORE listeners are attached. This avoids
  // first-snapshot races where Queue/My Songs render before user/session state.
  db = database;
  user = currentUser;
  activeSessionId = sessionId;
  activeName = singerName;
  activeJoinedAt = now;
  guestRef = thisGuestRef;

  restartRoomListeners();
  await registerDisconnectCleanup(thisGuestRef);

  localStorage.setItem("openKaraokeSingerName", singerName);
  localStorage.setItem("openKaraokeGuestSession", sessionId);

  displayName.textContent = singerName;
  displaySession.textContent = sessionId;
  joinPanel.hidden = true;
  roomPanel.hidden = false;
  setGuestTab("search");
  setYouTubeSearchState();
}
function unsubscribeRoomListeners() {
  unsubscribeHost?.();
  unsubscribeGuestCount?.();
  unsubscribeSettings?.();
  unsubscribeQueue?.();
  unsubscribeCurrentSong?.();
  unsubscribeHost = null;
  unsubscribeGuestCount = null;
  unsubscribeSettings = null;
  unsubscribeQueue = null;
  unsubscribeCurrentSong = null;
}

function scheduleRoomResync(delay = 120) {
  if (!activeSessionId || !db || !user?.uid) return;
  window.clearTimeout(roomResyncTimer);
  roomResyncTimer = window.setTimeout(() => {
    resyncRoomState().catch(error => console.error("Guest realtime resync failed:", error));
  }, delay);
}

function roomListenerError(scope, generation) {
  return error => {
    console.error(`Guest ${scope} realtime listener stopped:`, error);
    if (generation !== roomListenerGeneration) return;
    scheduleRoomResync(350);
  };
}

function restartRoomListeners() {
  if (!activeSessionId || !db || !user?.uid) return;
  unsubscribeRoomListeners();
  const generation = ++roomListenerGeneration;
  const sessionId = activeSessionId;

  const hostRef = ref(db, `sessions/${sessionId}/meta/hostOnline`);
  const guestsRef = ref(db, `sessions/${sessionId}/guests`);
  const settingsRef = ref(db, `sessions/${sessionId}/settings`);
  const queueRef = ref(db, `sessions/${sessionId}/queue`);
  const currentSongRef = ref(db, `sessions/${sessionId}/currentSong`);

  unsubscribeHost = onValue(hostRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    roomHostStatus.textContent = snapshot.val() === true ? "Online" : "Offline";
  }, roomListenerError("host", generation));

  unsubscribeGuestCount = onValue(guestsRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    const guests = snapshot.val() || {};
    const onlineGuests = Object.values(guests).filter(guest => guest?.online === true);
    roomGuestCount.textContent = String(onlineGuests.length);
  }, roomListenerError("guest-count", generation));

  unsubscribeSettings = onValue(settingsRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    const settings = snapshot.val() || {};
    setReservationLockState(settings.reservationsLocked === true);
    applyGuestTheme(settings.tvTheme || savedGuestTheme());
  }, roomListenerError("settings", generation));

  unsubscribeQueue = onValue(queueRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    currentQueue = sortQueueEntries(snapshot.val());
    renderQueue();
  }, roomListenerError("queue", generation));

  unsubscribeCurrentSong = onValue(currentSongRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    renderCurrentSong(snapshot.val());
  }, roomListenerError("current-song", generation));
}

async function refreshGuestPresence() {
  if (!guestRef || !activeName) return;
  const now = Date.now();
  await set(guestRef, {
    name: activeName,
    joinedAt: activeJoinedAt || now,
    lastSeen: now,
    online: true
  });
  await registerDisconnectCleanup(guestRef);
}

async function resyncRoomState() {
  if (!activeSessionId || !db || !user?.uid || roomResyncInFlight) return;
  roomResyncInFlight = true;
  try {
    // Restore presence first because room read permission is tied to this UID's
    // guest record. Then recreate all realtime listeners from a clean state.
    await refreshGuestPresence();
    restartRoomListeners();
  } finally {
    roomResyncInFlight = false;
  }
}
async function reserveSongById(title, videoId, thumbnail = "") {
  if (!activeSessionId || !user) throw new Error("Join a karaoke session first.");
  if (reservationsLocked) throw new Error("Reservations are currently locked by the Host.");

  const cleanTitle = String(title || "").trim();
  if (!cleanTitle || cleanTitle.length > 120) {
    throw new Error("Song title must be 1 to 120 characters.");
  }
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId || "")) {
    throw new Error("This YouTube video ID is invalid.");
  }

  // Every reservation gets its own unique queue ID. This intentionally allows
  // the same YouTube song to be reserved again by the same or another singer,
  // even when an earlier reservation still exists or was already completed.
  const itemId = uniqueReservationId(user.uid, videoId);
  const itemRef = ref(db, `sessions/${activeSessionId}/queue/${itemId}`);
  await set(itemRef, {
    youtubeVideoId: videoId,
    title: cleanTitle,
    thumbnail: thumbnail || youtubeThumbnail(videoId),
    singerName: activeName,
    guestId: user.uid,
    addedAt: Date.now(),
    status: "waiting"
  });
}

async function reserveSongFromInput(title, rawYoutubeValue) {
  const videoId = extractYouTubeVideoId(rawYoutubeValue);
  if (!videoId) throw new Error("Enter a valid YouTube link or YouTube video ID.");
  await reserveSongById(title, videoId, youtubeThumbnail(videoId));
}

function renderSearchResults(results) {
  currentSearchResults = new Map(results.map(item => [item.videoId, item]));

  if (!results.length) {
    searchResults.className = "search-results empty-state";
    searchResults.textContent = "No videos found. Try a different search.";
    return;
  }

  searchResults.className = "search-results";
  searchResults.innerHTML = results.map(item => `
    <article class="search-result-card">
      <img class="search-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
      <div class="search-result-info">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.channelTitle)}</span>
        <div class="search-result-actions">
          <button class="btn btn-secondary btn-small" type="button" data-preview-id="${escapeHtml(item.videoId)}">▶ Preview</button>
          <button class="btn btn-primary btn-small" type="button" data-reserve-id="${escapeHtml(item.videoId)}" ${reservationsLocked ? "disabled" : ""}>＋ Reserve</button>
        </div>
      </div>
    </article>`).join("");
}

function openPreview(item) {
  if (!item) return;
  previewVideo = item;
  previewTitle.textContent = item.title;
  previewChannel.textContent = item.channelTitle;
  previewFrame.src = `https://www.youtube.com/embed/${encodeURIComponent(item.videoId)}?playsinline=1&rel=0`;
  previewReserveBtn.disabled = reservationsLocked;
  previewModal.hidden = false;
  document.body.classList.add("modal-open");
}

function closePreview() {
  previewModal.hidden = true;
  previewFrame.src = "about:blank";
  previewVideo = null;
  document.body.classList.remove("modal-open");
}

async function reserveSearchResult(item, button = null) {
  if (!item) return;
  if (button) button.disabled = true;
  try {
    await reserveSongById(item.title, item.videoId, item.thumbnail);
    setMessage(reserveMessage, `Added “${item.title}” to the queue!`, "success");
    if (!previewModal.hidden) closePreview();
  } catch (error) {
    console.error(error);
    setMessage(reserveMessage, error.message || "Could not reserve this song.", "error");
  } finally {
    if (button && !reservationsLocked) button.disabled = false;
  }
}

async function init() {
  const urlSession = new URLSearchParams(window.location.search).get("session");
  if (urlSession) sessionInput.value = normalizeSession(urlSession);

  const savedName = localStorage.getItem("openKaraokeSingerName");
  if (savedName) nameInput.value = savedName;

  if (!isFirebaseConfigured()) {
    configWarning.hidden = false;
    joinForm.querySelector("button").disabled = true;
    connectionStatus.textContent = "Needs Setup";
    connectionStatus.dataset.state = "offline";
    return;
  }

  try {
    ({ db, user } = await initFirebase());

    unsubscribeConnection = onValue(ref(db, ".info/connected"), async snapshot => {
      const connected = snapshot.val() === true;
      setConnection(connected);
      if (connected && activeSessionId) {
        scheduleRoomResync(40);
      }
    });
  } catch (error) {
    console.error(error);
    setMessage(guestMessage, "Could not connect to Firebase. Ask the host to check the Firebase setup.", "error");
    connectionStatus.textContent = "Connection Error";
    connectionStatus.dataset.state = "offline";
  }
}

joinForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = joinForm.querySelector("button");
  const sessionId = normalizeSession(sessionInput.value);
  const singerName = nameInput.value.trim();

  if (!isValidSessionCode(sessionId)) {
    setMessage(guestMessage, "Enter a valid session code such as KARAOKE-AB12CD.", "error");
    return;
  }
  if (singerName.length < 1 || singerName.length > 30) {
    setMessage(guestMessage, "Enter a singer name from 1 to 30 characters.", "error");
    return;
  }

  sessionInput.value = sessionId;
  button.disabled = true;
  setMessage(guestMessage, "Joining room…");
  try {
    await joinSession(sessionId, singerName);
    setMessage(guestMessage, "");
  } catch (error) {
    console.error("Guest join failed:", error);
    const rawMessage = String(error?.message || "");
    const friendlyMessage = rawMessage.includes("_checkNotDeleted")
      ? "Firebase connection refreshed unexpectedly. Reload this page once, then tap Join Session again."
      : (rawMessage || "Could not join this session.");
    setMessage(guestMessage, friendlyMessage, "error");
    button.disabled = false;
  }
});

guestMobileTabs?.addEventListener("click", event => {
  const button = event.target.closest("[data-guest-tab]");
  if (!button) return;
  setGuestTab(button.dataset.guestTab);
});

searchForm.addEventListener("submit", async event => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) {
    setMessage(searchMessage, "Type a song, artist, or karaoke title first.", "error");
    return;
  }

  const now = Date.now();
  if (now - lastSearchAt < 1500) {
    setMessage(searchMessage, "Please wait a moment before searching again.");
    return;
  }
  lastSearchAt = now;

  searchBtn.disabled = true;
  setMessage(searchMessage, "Searching YouTube…");
  searchResults.className = "search-results empty-state";
  searchResults.textContent = "Loading results…";

  try {
    const { results, cached } = await searchYouTubeVideos(query, 8);
    renderSearchResults(results);
    setMessage(searchMessage, cached ? "Showing cached results to save API usage." : `${results.length} result${results.length === 1 ? "" : "s"} found.`, "success");
  } catch (error) {
    console.error(error);
    searchResults.className = "search-results empty-state";
    searchResults.textContent = "Search unavailable. You can still use a direct YouTube link below.";
    setMessage(searchMessage, error.message || "YouTube search failed.", "error");
  } finally {
    searchBtn.disabled = !isYouTubeSearchConfigured();
  }
});

searchResults.addEventListener("click", event => {
  const previewButton = event.target.closest("[data-preview-id]");
  if (previewButton) {
    openPreview(currentSearchResults.get(previewButton.dataset.previewId));
    return;
  }

  const reserveButton = event.target.closest("[data-reserve-id]");
  if (reserveButton) {
    reserveSearchResult(currentSearchResults.get(reserveButton.dataset.reserveId), reserveButton);
  }
});

reserveForm.addEventListener("submit", async event => {
  event.preventDefault();
  reserveBtn.disabled = true;
  setMessage(reserveMessage, "Adding song…");

  try {
    await reserveSongFromInput(songTitleInput.value, youtubeInput.value);
    songTitleInput.value = "";
    youtubeInput.value = "";
    setMessage(reserveMessage, "Song added to the shared queue!", "success");
  } catch (error) {
    console.error(error);
    setMessage(reserveMessage, error.message || "Could not reserve this song.", "error");
  } finally {
    reserveBtn.disabled = reservationsLocked;
  }
});

previewReserveBtn.addEventListener("click", () => {
  if (previewVideo) reserveSearchResult(previewVideo, previewReserveBtn);
});

closePreviewBtn.addEventListener("click", closePreview);
previewModal.addEventListener("click", event => {
  if (event.target.closest("[data-close-preview]")) closePreview();
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && !previewModal.hidden) closePreview();
});

mySongs.addEventListener("click", async event => {
  const button = event.target.closest("[data-cancel-song]");
  if (!button || !activeSessionId) return;

  button.disabled = true;
  const itemId = button.dataset.cancelSong;
  try {
    await remove(ref(db, `sessions/${activeSessionId}/queue/${itemId}`));
    setMessage(reserveMessage, "Reservation cancelled.", "success");
  } catch (error) {
    console.error(error);
    setMessage(reserveMessage, "Could not cancel that reservation.", "error");
    button.disabled = false;
  }
});

guestPlayPauseBtn?.addEventListener("click", async () => {
  if (singerControlBusy || guestOwnControls.hidden) return;
  const action = guestPlayPauseBtn.dataset.action || "pause";
  singerControlBusy = true;
  guestPlayPauseBtn.disabled = true;
  guestSkipBtn.disabled = true;
  try {
    await sendSingerControl(action);
  } catch (error) {
    console.error(error);
    setMessage(reserveMessage, error.message || "Could not control your song.", "error");
  } finally {
    window.setTimeout(() => {
      singerControlBusy = false;
      renderSingerControls(currentSong?.playbackState || "idle");
    }, 500);
  }
});

guestSkipBtn?.addEventListener("click", async () => {
  if (singerControlBusy || guestOwnControls.hidden) return;
  const requestedQueueItemId = currentSong?.queueItemId || null;
  singerControlBusy = true;
  renderSingerControls(currentSong?.playbackState || "playing");

  try {
    await sendSingerControl("skip");
    // If the Host is slow/offline, never leave the phone controls permanently
    // disabled. A successful song change will reset busy immediately.
    window.setTimeout(() => {
      if (singerControlBusy && currentSong?.queueItemId === requestedQueueItemId) {
        singerControlBusy = false;
        renderSingerControls(currentSong?.playbackState || "idle");
        setMessage(reserveMessage, "Skip request sent. Waiting for the Host…");
      }
    }, 2200);
  } catch (error) {
    console.error(error);
    singerControlBusy = false;
    renderSingerControls(currentSong?.playbackState || "idle");
    setMessage(reserveMessage, error.message || "Could not skip your song.", "error");
  }
});

leaveBtn.addEventListener("click", async () => {
  leaveBtn.disabled = true;
  closePreview();
  window.clearTimeout(roomResyncTimer);
  unsubscribeRoomListeners();
  roomListenerGeneration += 1;
  try { await guestDisconnectAction?.cancel?.(); } catch {}
  guestDisconnectAction = null;
  try {
    if (guestRef) await remove(guestRef);
  } catch (error) {
    console.error(error);
  }
  activeSessionId = null;
  activeName = null;
  activeJoinedAt = null;
  guestRef = null;
  currentQueue = [];
  currentSong = null;
  roomPanel.hidden = true;
  joinPanel.hidden = false;
  applyGuestTheme("classic");
  setGuestTab("search");
  joinForm.querySelector("button").disabled = false;
  leaveBtn.disabled = false;
  setMessage(guestMessage, "You left the session. Your waiting reservations remain in the queue until you cancel them or the Host removes them.", "success");
});


document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && activeSessionId) {
    scheduleRoomResync(60);
  }
});

window.addEventListener("pageshow", () => {
  if (activeSessionId) scheduleRoomResync(60);
});

window.addEventListener("online", () => {
  if (activeSessionId) scheduleRoomResync(40);
});


applyGuestTheme(savedGuestTheme(), { animate: false });

init();

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
} from "./queue.js?v=20260909-repeat-audio2";
import {
  isYouTubeSearchConfigured,
  searchYouTubeVideos
} from "./youtube.js";

const GUEST_BUILD = "20260909-repeat-audio2";

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

let db;
let user;
let activeSessionId = null;
let activeName = null;
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
  connectionStatus.textContent = isOnline ? "Firebase Online" : "Offline";
  connectionStatus.dataset.state = isOnline ? "online" : "offline";
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

function renderCurrentSong(song) {
  currentSong = song || null;

  if (!currentSong) {
    guestNowTitle.textContent = "Nothing playing yet";
    guestPlaybackState.textContent = "IDLE";
    guestPlaybackState.dataset.state = "idle";
    guestNowBody.innerHTML = '<div class="guest-now-placeholder">The current song will appear here when the Host starts playback.</div>';
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
  // Presence cleanup is helpful but must never block a guest from joining.
  // Some mobile browsers can fail while registering onDisconnect during a
  // connection transition, so treat it as a best-effort enhancement.
  try {
    const disconnect = onDisconnect(reference);
    await disconnect.remove();
  } catch (error) {
    console.warn("Guest disconnect cleanup could not be registered.", error);
  }
}

async function joinSession(sessionId, singerName) {
  // Always obtain a fresh, explicit Firebase context for the join action.
  // This avoids relying on a mutable page-level Database reference during
  // mobile reconnects / cached module reloads.
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
    lastSeen: now
  });

  // Install listeners using the same explicit Database instance that was used
  // for the successful read/write above. If a listener cannot be created, the
  // join stays on the form instead of entering a half-connected state.
  const subscriptions = watchRoom(sessionId, database, currentUser);

  db = database;
  user = currentUser;
  activeSessionId = sessionId;
  activeName = singerName;
  guestRef = thisGuestRef;

  unsubscribeHost = subscriptions.unsubscribeHost;
  unsubscribeGuestCount = subscriptions.unsubscribeGuestCount;
  unsubscribeSettings = subscriptions.unsubscribeSettings;
  unsubscribeQueue = subscriptions.unsubscribeQueue;
  unsubscribeCurrentSong = subscriptions.unsubscribeCurrentSong;

  registerDisconnectCleanup(thisGuestRef);

  localStorage.setItem("openKaraokeSingerName", singerName);
  localStorage.setItem("openKaraokeGuestSession", sessionId);

  displayName.textContent = singerName;
  displaySession.textContent = sessionId;
  joinPanel.hidden = true;
  roomPanel.hidden = false;

  setYouTubeSearchState();
}

function watchRoom(sessionId, database, currentUser) {
  unsubscribeHost?.();
  unsubscribeGuestCount?.();
  unsubscribeSettings?.();
  unsubscribeQueue?.();
  unsubscribeCurrentSong?.();

  if (!database || !currentUser?.uid) {
    throw new Error("Firebase connection is not ready.");
  }

  const hostRef = ref(database, `sessions/${sessionId}/meta/hostOnline`);
  const guestsRef = ref(database, `sessions/${sessionId}/guests`);
  const settingsRef = ref(database, `sessions/${sessionId}/settings/reservationsLocked`);
  const queueRef = ref(database, `sessions/${sessionId}/queue`);
  const currentSongRef = ref(database, `sessions/${sessionId}/currentSong`);

  const nextUnsubscribeHost = onValue(hostRef, snapshot => {
    roomHostStatus.textContent = snapshot.val() === true ? "Online" : "Offline";
  });

  const nextUnsubscribeGuestCount = onValue(guestsRef, snapshot => {
    const guests = snapshot.val() || {};
    roomGuestCount.textContent = String(Object.keys(guests).length);
  });

  const nextUnsubscribeSettings = onValue(settingsRef, snapshot => {
    setReservationLockState(snapshot.val() === true);
  });

  const nextUnsubscribeQueue = onValue(queueRef, snapshot => {
    currentQueue = sortQueueEntries(snapshot.val());
    renderQueue();
  });

  const nextUnsubscribeCurrentSong = onValue(currentSongRef, snapshot => {
    renderCurrentSong(snapshot.val());
  });

  return {
    unsubscribeHost: nextUnsubscribeHost,
    unsubscribeGuestCount: nextUnsubscribeGuestCount,
    unsubscribeSettings: nextUnsubscribeSettings,
    unsubscribeQueue: nextUnsubscribeQueue,
    unsubscribeCurrentSong: nextUnsubscribeCurrentSong
  };
}

async function refreshGuestPresence() {
  if (!guestRef || !activeName) return;
  const now = Date.now();
  await set(guestRef, {
    name: activeName,
    joinedAt: now,
    lastSeen: now
  });
  registerDisconnectCleanup(guestRef);
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
        try { await refreshGuestPresence(); } catch (error) { console.error(error); }
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

leaveBtn.addEventListener("click", async () => {
  leaveBtn.disabled = true;
  closePreview();
  try {
    if (guestRef) await remove(guestRef);
  } catch (error) {
    console.error(error);
  }
  activeSessionId = null;
  activeName = null;
  guestRef = null;
  currentQueue = [];
  currentSong = null;
  unsubscribeHost?.();
  unsubscribeGuestCount?.();
  unsubscribeSettings?.();
  unsubscribeQueue?.();
  unsubscribeCurrentSong?.();
  roomPanel.hidden = true;
  joinPanel.hidden = false;
  joinForm.querySelector("button").disabled = false;
  leaveBtn.disabled = false;
  setMessage(guestMessage, "You left the session. Your waiting reservations remain in the queue until you cancel them or the Host removes them.", "success");
});

init();

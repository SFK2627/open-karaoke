import {
  initFirebase,
  isFirebaseConfigured,
  ref,
  get,
  set,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
  runTransaction
} from "./firebase.js";
import {
  extractYouTubeVideoId,
  makeQueueItemId,
  youtubeThumbnail,
  sortQueueEntries,
  escapeHtml
} from "./queue.js";
import {
  isYouTubeSearchConfigured,
  searchYouTubeVideos
} from "./youtube.js";

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
  let code = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (code && !code.startsWith("KARAOKE-")) code = `KARAOKE-${code}`;
  return code;
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

async function joinSession(sessionId, singerName) {
  const sessionMetaRef = ref(db, `sessions/${sessionId}/meta`);
  const sessionSnapshot = await get(sessionMetaRef);

  if (!sessionSnapshot.exists()) {
    throw new Error("Session not found. Check the code or ask the host for a new QR code.");
  }

  activeSessionId = sessionId;
  activeName = singerName;
  guestRef = ref(db, `sessions/${sessionId}/guests/${user.uid}`);

  await set(guestRef, {
    name: singerName,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp()
  });

  await onDisconnect(guestRef).remove();
  localStorage.setItem("openKaraokeSingerName", singerName);
  localStorage.setItem("openKaraokeGuestSession", sessionId);

  displayName.textContent = singerName;
  displaySession.textContent = sessionId;
  joinPanel.hidden = true;
  roomPanel.hidden = false;

  setYouTubeSearchState();
  watchRoom(sessionId);
}

function watchRoom(sessionId) {
  unsubscribeHost?.();
  unsubscribeGuestCount?.();
  unsubscribeSettings?.();
  unsubscribeQueue?.();
  unsubscribeCurrentSong?.();

  unsubscribeHost = onValue(ref(db, `sessions/${sessionId}/meta/hostOnline`), snapshot => {
    roomHostStatus.textContent = snapshot.val() === true ? "Online" : "Offline";
  });

  unsubscribeGuestCount = onValue(ref(db, `sessions/${sessionId}/guests`), snapshot => {
    roomGuestCount.textContent = String(snapshot.exists() ? snapshot.size : 0);
  });

  unsubscribeSettings = onValue(ref(db, `sessions/${sessionId}/settings/reservationsLocked`), snapshot => {
    setReservationLockState(snapshot.val() === true);
  });

  unsubscribeQueue = onValue(ref(db, `sessions/${sessionId}/queue`), snapshot => {
    currentQueue = sortQueueEntries(snapshot.val());
    renderQueue();
  });

  unsubscribeCurrentSong = onValue(ref(db, `sessions/${sessionId}/currentSong`), snapshot => {
    renderCurrentSong(snapshot.val());
  });
}

async function refreshGuestPresence() {
  if (!guestRef || !activeName) return;
  await set(guestRef, {
    name: activeName,
    joinedAt: serverTimestamp(),
    lastSeen: serverTimestamp()
  });
  await onDisconnect(guestRef).remove();
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

  const itemId = makeQueueItemId(user.uid, videoId);
  const itemRef = ref(db, `sessions/${activeSessionId}/queue/${itemId}`);
  const result = await runTransaction(itemRef, current => {
    if (current !== null) return;
    return {
      youtubeVideoId: videoId,
      title: cleanTitle,
      thumbnail: thumbnail || youtubeThumbnail(videoId),
      singerName: activeName,
      guestId: user.uid,
      addedAt: serverTimestamp(),
      status: "waiting"
    };
  }, { applyLocally: false });

  if (!result.committed) {
    throw new Error("You already reserved this YouTube video.");
  }
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

  if (!/^KARAOKE-[A-Z2-9]{4,8}$/.test(sessionId)) {
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
    console.error(error);
    setMessage(guestMessage, error.message || "Could not join this session.", "error");
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

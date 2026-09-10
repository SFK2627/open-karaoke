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
  searchYouTubeVideos,
  createYouTubePlayer,
  youtubePlayerErrorMessage
} from "./youtube.js?v=20260910-watchidentity1";

const GUEST_BUILD = "20260910-featurepack4";

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
const queueTabBadge = document.querySelector("#queueTabBadge");
const mySongsTabBadge = document.querySelector("#mySongsTabBadge");
const queueTabButton = document.querySelector('[data-guest-tab="queue"]');
const mySongsTabButton = document.querySelector('[data-guest-tab="mine"]');
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
const guestWatchStage = document.querySelector("#guestWatchStage");
const watchEmpty = document.querySelector("#watchEmpty");
const watchTitle = document.querySelector("#watchTitle");
const watchSinger = document.querySelector("#watchSinger");
const watchRoleChip = document.querySelector("#watchRoleChip");
const watchSyncState = document.querySelector("#watchSyncState");
const watchTimeCurrent = document.querySelector("#watchTimeCurrent");
const watchTimeDuration = document.querySelector("#watchTimeDuration");
const watchProgressFill = document.querySelector("#watchProgressFill");
const watchResyncBtn = document.querySelector("#watchResyncBtn");
const watchFocusBtn = document.querySelector("#watchFocusBtn");
const watchSingerControls = document.querySelector("#watchSingerControls");
const watchPlayPauseBtn = document.querySelector("#watchPlayPauseBtn");
const watchSkipBtn = document.querySelector("#watchSkipBtn");
const watchNowSingerPreview = document.querySelector("#watchNowSingerPreview");
const watchNextSingerPreview = document.querySelector("#watchNextSingerPreview");
const dedicationInput = document.querySelector("#dedicationInput");
const guestReactionDock = document.querySelector("#guestReactionDock");
const guestTurnAlert = document.querySelector("#guestTurnAlert");
const guestTurnAlertIcon = document.querySelector("#guestTurnAlertIcon");
const guestTurnAlertTitle = document.querySelector("#guestTurnAlertTitle");
const guestTurnAlertText = document.querySelector("#guestTurnAlertText");
const guestTurnAlertClose = document.querySelector("#guestTurnAlertClose");

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
let playbackSync = null;
let unsubscribePlaybackSync = null;
let unsubscribeServerTimeOffset = null;
let serverTimeOffsetMs = 0;
let watchPlayer = null;
let watchPlayerReady = false;
let watchLoadedVideoId = null;
let watchSyncTickTimer = null;
let watchApplyTimer = null;
let watchFocusActive = false;
let watchWakeLock = null;
let watchLoadRetryTimer = null;
let watchLastLoadAttemptAt = 0;
let watchPlayerErrorCode = null;
let watchAutoplayBlocked = false;
let watchRecoveryAttempts = 0;
let watchRecoveryTimer = null;
let watchPlayerState = null;
let watchLoadStartedAt = 0;
let watchLastPlayCommandAt = 0;
let watchLastCorrectionAt = 0;
let watchAppliedPlaybackRate = 1;
let lastReactionAt = 0;
let lastTurnAwareness = "idle";
let turnAlertTimer = null;
let queueSnapshotReady = false;
let currentSongSnapshotReady = false;
// Precision thresholds are intentionally much tighter than the first Watch
// build. Soft drift is corrected by briefly nudging the muted Guest player's
// playback rate; larger drift uses a single seek. This avoids visible 1s+ lag
// without hammering YouTube while it is buffering.
const WATCH_SYNCED_DRIFT_SECONDS = 0.14;
const WATCH_RATE_NUDGE_DRIFT_SECONDS = 0.20;
const WATCH_HARD_SEEK_SECONDS = 0.58;
const WATCH_TARGET_LEAD_SECONDS = 0.08;
const WATCH_LOAD_GRACE_MS = 1500;
const WATCH_PLAY_RETRY_MS = 1200;
const WATCH_CORRECTION_COOLDOWN_MS = 850;
const WATCH_HEARTBEAT_STALE_MS = 4500;
const WATCH_MAX_AUTO_RECOVERY_ATTEMPTS = 2;
const WATCH_SYNC_TICK_MS = 300;

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
  const valid = ["watch", "search", "queue", "mine"].includes(tabName) ? tabName : "watch";
  document.body.dataset.guestSection = valid;
  guestTabButtons.forEach(button => {
    const active = button.dataset.guestTab === valid;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  guestTabPanels.forEach(panel => {
    const active = panel.dataset.guestPanel === valid;
    panel.classList.toggle("is-active", active);
  });
  if (valid === "watch") {
    ensureWatchPlayer().then(() => forceWatchResync()).catch(error => console.debug("Watch player init:", error?.message || error));
  } else if (watchPlayerReady && watchPlayer && !watchFocusActive) {
    // Save mobile data/CPU when the guest is using Search/Queue/My Songs.
    try { watchPlayer.pauseVideo?.(); } catch {}
  }
  if (scroll && guestMobileTabs && window.matchMedia("(max-width: 620px)").matches) {
    guestMobileTabs.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function cleanDedication(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function updateGuestSingerPreview() {
  const waiting = currentQueue.filter(([, item]) => item?.status === "waiting");
  if (watchNowSingerPreview) watchNowSingerPreview.textContent = currentSong?.singerName || "—";
  if (watchNextSingerPreview) watchNextSingerPreview.textContent = waiting[0]?.[1]?.singerName || "Waiting…";
}

function showTurnAlert(kind) {
  if (!guestTurnAlert) return;
  window.clearTimeout(turnAlertTimer);
  const yourTurn = kind === "turn";
  if (guestTurnAlertIcon) guestTurnAlertIcon.textContent = yourTurn ? "🎤" : "🔔";
  if (guestTurnAlertTitle) guestTurnAlertTitle.textContent = yourTurn ? "YOUR TURN!" : "You’re next!";
  if (guestTurnAlertText) guestTurnAlertText.textContent = yourTurn ? "Your song is playing now." : "Get ready — one song before your turn.";
  guestTurnAlert.dataset.kind = kind;
  guestTurnAlert.hidden = false;
  guestTurnAlert.classList.remove("is-showing");
  void guestTurnAlert.offsetWidth;
  guestTurnAlert.classList.add("is-showing");
  try {
    navigator.vibrate?.(yourTurn ? [220, 90, 220, 90, 360] : [160, 80, 190]);
  } catch {}
  turnAlertTimer = window.setTimeout(() => {
    guestTurnAlert.classList.remove("is-showing");
    window.setTimeout(() => { if (guestTurnAlert) guestTurnAlert.hidden = true; }, 220);
  }, yourTurn ? 9000 : 7000);
}

function updateTurnAwareness() {
  updateGuestSingerPreview();
  if (!queueSnapshotReady || !currentSongSnapshotReady || !user?.uid || !activeSessionId) return;
  const waiting = currentQueue.filter(([, item]) => item?.status === "waiting");
  let stateKey = "idle";
  let alertKind = null;
  if (currentSong?.guestId === user.uid) {
    alertKind = "turn";
    stateKey = `turn:${currentSong.queueItemId || currentSong.youtubeVideoId || "current"}`;
  } else if (currentSong && waiting[0]?.[1]?.guestId === user.uid) {
    alertKind = "next";
    stateKey = `next:${waiting[0][0]}`;
  }
  if (stateKey !== lastTurnAwareness) {
    lastTurnAwareness = stateKey;
    if (alertKind) showTurnAlert(alertKind);
  }
}

async function sendLiveReaction(emoji) {
  if (!activeSessionId || !db || !user?.uid || !activeName) return;
  const allowed = new Set(["👏", "❤️", "🔥", "🎤", "😂"]);
  if (!allowed.has(emoji)) return;
  const now = Date.now();
  if (now - lastReactionAt < 1200) return;
  lastReactionAt = now;
  const nonce = `${now.toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  await set(ref(db, `sessions/${activeSessionId}/reactions/${user.uid}`), {
    emoji,
    guestId: user.uid,
    singerName: activeName,
    nonce,
    createdAt: serverTimestamp()
  });
}

function renderQueue() {
  const waiting = currentQueue.filter(([, item]) => item?.status === "waiting");
  const mine = waiting.filter(([, item]) => item.guestId === user?.uid);
  queueCount.textContent = `${waiting.length} ${waiting.length === 1 ? "song" : "songs"}`;
  if (queueTabBadge) {
    queueTabBadge.textContent = String(waiting.length);
    queueTabBadge.dataset.empty = String(waiting.length === 0);
    queueTabBadge.setAttribute("aria-label", `${waiting.length} ${waiting.length === 1 ? "song" : "songs"} in queue`);
  }
  if (mySongsTabBadge) {
    mySongsTabBadge.textContent = String(mine.length);
    mySongsTabBadge.dataset.empty = String(mine.length === 0);
    mySongsTabBadge.setAttribute("aria-label", `${mine.length} of your waiting ${mine.length === 1 ? "song" : "songs"}`);
  }
  if (queueTabButton) queueTabButton.setAttribute("aria-label", `Queue, ${waiting.length} ${waiting.length === 1 ? "song" : "songs"}`);
  if (mySongsTabButton) mySongsTabButton.setAttribute("aria-label", `My Songs, ${mine.length} waiting`);

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
            ${item.dedication ? `<small class="song-dedication">💬 ${escapeHtml(item.dedication)}</small>` : ""}
          </div>
        </div>`;
    }).join("");
  }

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
            ${item.dedication ? `<small class="song-dedication">💬 ${escapeHtml(item.dedication)}</small>` : ""}
          </div>
          <button class="btn btn-danger btn-small" data-cancel-song="${escapeHtml(id)}">Cancel</button>
        </div>`;
    }).join("");
  }
  updateTurnAwareness();
}

function renderSingerControls(state = "idle") {
  const ownsCurrentSong = Boolean(currentSong && user?.uid && currentSong.guestId === user.uid);
  guestOwnControls.hidden = !ownsCurrentSong;
  if (watchSingerControls) watchSingerControls.hidden = !ownsCurrentSong;

  if (!ownsCurrentSong) {
    singerControlBusy = false;
    guestPlayPauseBtn.disabled = false;
    guestSkipBtn.disabled = false;
    guestSkipBtn.textContent = "⏭ Skip My Song";
    if (watchPlayPauseBtn) { watchPlayPauseBtn.disabled = false; watchPlayPauseBtn.textContent = "▶ Play"; watchPlayPauseBtn.dataset.action = "play"; }
    if (watchSkipBtn) { watchSkipBtn.disabled = false; watchSkipBtn.textContent = "⏭ Skip My Song"; }
    return;
  }

  const isPlaying = state === "playing";
  const playPauseText = isPlaying ? "⏸ Pause" : "▶ Play";
  const playPauseAction = isPlaying ? "pause" : "play";
  guestPlayPauseBtn.textContent = playPauseText;
  guestPlayPauseBtn.dataset.action = playPauseAction;
  guestPlayPauseBtn.disabled = singerControlBusy;
  guestSkipBtn.disabled = singerControlBusy;
  guestSkipBtn.textContent = singerControlBusy ? "Please wait…" : "⏭ Skip My Song";

  if (watchPlayPauseBtn) {
    watchPlayPauseBtn.textContent = playPauseText;
    watchPlayPauseBtn.dataset.action = playPauseAction;
    watchPlayPauseBtn.disabled = singerControlBusy;
  }
  if (watchSkipBtn) {
    watchSkipBtn.disabled = singerControlBusy;
    watchSkipBtn.textContent = singerControlBusy ? "Please wait…" : "⏭ Skip My Song";
  }
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

function formatWatchTime(value) {
  const seconds = Math.max(0, Math.floor(Number(value) || 0));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function serverNowMs() {
  return Date.now() + Number(serverTimeOffsetMs || 0);
}

function expectedWatchPosition(sync = playbackSync, stateOverride = null) {
  if (!sync || !Number.isFinite(Number(sync.position))) return 0;
  let position = Math.max(0, Number(sync.position));
  const effectiveState = stateOverride || sync.state;
  // `capturedAt` is generated on the Host from Firebase's server-time offset at
  // the same moment getCurrentTime() is sampled. Fall back to updatedAt for
  // rooms still running an older Host build.
  const anchorTime = Number.isFinite(Number(sync.capturedAt))
    ? Number(sync.capturedAt)
    : Number(sync.updatedAt);
  if (effectiveState === "playing" && Number.isFinite(anchorTime)) {
    const elapsed = Math.max(0, (serverNowMs() - anchorTime) / 1000);
    position += elapsed * (Number(sync.rate) || 1);
    // Aim a few frames ahead to compensate for the local seek/play command
    // taking effect after this calculation. The player is muted, so this does
    // not create echo or audio artifacts.
    position += WATCH_TARGET_LEAD_SECONDS;
  }
  const duration = Number(sync.duration) || 0;
  if (duration > 0) position = Math.min(duration, position);
  return position;
}

function resetWatchPlaybackRate() {
  if (!watchPlayerReady || !watchPlayer) {
    watchAppliedPlaybackRate = 1;
    return;
  }
  if (Math.abs(watchAppliedPlaybackRate - 1) < 0.001) return;
  try { watchPlayer.setPlaybackRate?.(1); } catch {}
  watchAppliedPlaybackRate = 1;
}

function setWatchCatchupRate(signedDrift) {
  if (!watchPlayerReady || !watchPlayer) return false;
  // signedDrift = local - expected. Negative means the phone is behind.
  const wanted = signedDrift < 0 ? 1.25 : 0.75;
  let available = [];
  try { available = watchPlayer.getAvailablePlaybackRates?.() || []; } catch {}
  if (!Array.isArray(available) || !available.includes(wanted)) return false;
  if (Math.abs(watchAppliedPlaybackRate - wanted) < 0.001) return true;
  try {
    watchPlayer.setPlaybackRate?.(wanted);
    watchAppliedPlaybackRate = wanted;
    return true;
  } catch {
    return false;
  }
}

function setWatchSyncUi(state, text) {
  if (!watchSyncState) return;
  watchSyncState.dataset.state = state;
  watchSyncState.textContent = text;
}

function updateWatchSongInfo() {
  const song = currentSong;
  if (!song) {
    if (watchTitle) watchTitle.textContent = "Waiting for a song…";
    if (watchSinger) watchSinger.textContent = "No singer yet";
    if (watchRoleChip) { watchRoleChip.textContent = "👀 WATCHING LIVE"; watchRoleChip.dataset.role = "viewer"; }
    if (watchEmpty) {
      watchEmpty.hidden = false;
      watchEmpty.innerHTML = '<span class="guest-watch-empty-icon">🎤</span><strong>Waiting for the Host</strong><small>The karaoke video will appear here automatically.</small>';
    }
    if (watchTimeCurrent) watchTimeCurrent.textContent = "0:00";
    if (watchTimeDuration) watchTimeDuration.textContent = "0:00";
    if (watchProgressFill) watchProgressFill.style.width = "0%";
    setWatchSyncUi("idle", "WAITING");
    return;
  }

  if (watchTitle) watchTitle.textContent = song.title || "Untitled song";
  if (watchSinger) watchSinger.textContent = `Reserved by ${song.singerName || "Guest"}`;
  const ownsSong = Boolean(user?.uid && song.guestId === user.uid);
  if (watchRoleChip) {
    watchRoleChip.textContent = ownsSong ? "🎤 YOUR TURN" : "👀 WATCHING LIVE";
    watchRoleChip.dataset.role = ownsSong ? "singer" : "viewer";
  }
  if (watchEmpty && (!watchPlayerReady || watchLoadedVideoId !== song.youtubeVideoId)) {
    watchEmpty.hidden = false;
    watchEmpty.innerHTML = '<span class="guest-watch-empty-icon">↻</span><strong>Syncing live display…</strong><small>Matching this phone to the karaoke TV.</small>';
  }
}

function ensureWatchPlayerMount() {
  let mount = document.querySelector("#guestWatchPlayer");
  if (mount) return mount;
  if (!guestWatchStage) return null;
  mount = document.createElement("div");
  mount.id = "guestWatchPlayer";
  mount.className = "guest-watch-player";
  mount.setAttribute("aria-label", "Synchronized karaoke video");
  guestWatchStage.insertBefore(mount, watchEmpty || guestWatchStage.firstChild);
  return mount;
}

function clearWatchPlayerError() {
  watchPlayerErrorCode = null;
  watchAutoplayBlocked = false;
}

function rebuildWatchPlayer({ preserveRecoveryCount = true } = {}) {
  window.clearTimeout(watchLoadRetryTimer);
  watchLoadRetryTimer = null;
  try { watchPlayer?.destroy?.(); } catch {}
  watchPlayer = null;
  watchPlayerReady = false;
  watchLoadedVideoId = null;
  watchLastLoadAttemptAt = 0;
  watchPlayerState = null;
  watchLoadStartedAt = 0;
  watchLastPlayCommandAt = 0;
  watchLastCorrectionAt = 0;
  watchAppliedPlaybackRate = 1;
  if (!preserveRecoveryCount) watchRecoveryAttempts = 0;
  ensureWatchPlayerMount();
}

function scheduleWatchPlayerRecovery(errorCode) {
  const code = Number(errorCode) || 0;
  if (![5, 153].includes(code)) return false;
  if (watchRecoveryAttempts >= WATCH_MAX_AUTO_RECOVERY_ATTEMPTS) return false;
  watchRecoveryAttempts += 1;
  window.clearTimeout(watchRecoveryTimer);
  setWatchSyncUi("adjusting", `RECOVERING ${watchRecoveryAttempts}/${WATCH_MAX_AUTO_RECOVERY_ATTEMPTS}`);
  watchRecoveryTimer = window.setTimeout(() => {
    rebuildWatchPlayer({ preserveRecoveryCount: true });
    watchPlayerErrorCode = null;
    ensureWatchPlayer()
      .then(() => scheduleWatchApply(60, true))
      .catch(() => setWatchSyncUi("error", `VIDEO ERROR ${code}`));
  }, 500 + (watchRecoveryAttempts * 250));
  return true;
}

async function ensureWatchPlayer() {
  if (watchPlayer) return watchPlayer;
  if (!ensureWatchPlayerMount()) return null;

  const initialVideoId = String(currentSong?.youtubeVideoId || "");
  const syncMatchesSong = Boolean(initialVideoId && playbackSync?.videoId === initialVideoId);
  const desiredState = currentSong?.playbackState || (syncMatchesSong ? playbackSync?.state : null) || "playing";
  const initialExpected = syncMatchesSong ? expectedWatchPosition(playbackSync, desiredState) : 0;

  try {
    watchPlayer = await createYouTubePlayer("guestWatchPlayer", {
      onReady: event => {
        watchPlayerReady = true;
        clearWatchPlayerError();
        try { event.target.mute?.(); } catch {}
        try { event.target.setVolume?.(0); } catch {}
        try {
          const iframe = event.target.getIframe?.();
          iframe?.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
          iframe?.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
          iframe?.setAttribute("title", "Live synchronized karaoke display");
        } catch {}
        forceWatchResync();
      },
      onStateChange: event => {
        if (document.body.dataset.guestSection === "watch") updateWatchProgressUi();
        const state = Number(event?.data);
        watchPlayerState = state;
        const YTPS = window.YT?.PlayerState || {};
        const hasRenderableVideo = Boolean(
          currentSong?.youtubeVideoId &&
          [YTPS.BUFFERING, YTPS.PLAYING, YTPS.PAUSED, YTPS.CUED].includes(state)
        );
        if (hasRenderableVideo) {
          clearWatchPlayerError();
          watchRecoveryAttempts = 0;
          if (watchEmpty) watchEmpty.hidden = true;
        }
        if (state === YTPS.PLAYING || state === YTPS.BUFFERING) {
          if (state === YTPS.PLAYING) watchAutoplayBlocked = false;
          setWatchSyncUi("synced", state === YTPS.PLAYING ? "● LIVE SYNCED" : "BUFFERING");
        } else if ((state === YTPS.CUED || state === YTPS.PAUSED || state === YTPS.UNSTARTED) && currentSong?.playbackState === "playing") {
          setWatchSyncUi("adjusting", watchAutoplayBlocked ? "TAP ▶ TO START" : "STARTING…");
        }
      },
      onAutoplayBlocked: () => {
        watchAutoplayBlocked = true;
        if (!watchPlayerErrorCode) setWatchSyncUi("adjusting", "TAP ▶ TO START");
      },
      onError: event => {
        const code = Number(event?.data) || 0;
        watchPlayerErrorCode = code || -1;
        watchAutoplayBlocked = false;
        if (scheduleWatchPlayerRecovery(code)) return;
        setWatchSyncUi("error", code ? `VIDEO ERROR ${code}` : "VIDEO ERROR");
        if (watchEmpty) {
          watchEmpty.hidden = false;
          const recoveryHint = code === 153
            ? "This phone/browser did not identify the embed correctly. Tap Re-sync; if privacy/referrer blocking is enabled, allow it for this site."
            : code === 5
              ? "The HTML5 YouTube player failed on this phone. Tap Re-sync to rebuild the player."
              : youtubePlayerErrorMessage(code);
          watchEmpty.innerHTML = `<span class="guest-watch-empty-icon">⚠️</span><strong>Watch video error${code ? ` ${code}` : ""}</strong><small>${escapeHtml(recoveryHint)}</small>`;
        }
      }
    }, {
      videoId: initialVideoId || undefined,
      playerVars: {
        // Start cued, then mute in onReady before requesting playback. This is
        // more reliable on mobile than asking YouTube to autoplay audibly first.
        autoplay: 0,
        controls: 1,
        fs: 1,
        ...(initialExpected > 0 ? { start: Math.max(0, Math.floor(initialExpected)) } : {})
      }
    });
    if (initialVideoId) {
      watchLoadedVideoId = initialVideoId;
      watchLastLoadAttemptAt = Date.now();
      watchLoadStartedAt = Date.now();
    }
  } catch (error) {
    console.error("Guest Watch player failed:", error);
    watchPlayer = null;
    watchPlayerReady = false;
    watchPlayerErrorCode = -1;
    setWatchSyncUi("error", "PLAYER ERROR");
    if (watchEmpty) {
      watchEmpty.hidden = false;
      watchEmpty.innerHTML = '<span class="guest-watch-empty-icon">⚠️</span><strong>Could not load the video player</strong><small>Tap Re-sync or reload this Guest page if your connection is online.</small>';
    }
  }
  return watchPlayer;
}

function updateWatchProgressUi() {
  const sync = playbackSync;
  const effectiveState = currentSong?.playbackState || sync?.state || "playing";
  const expected = expectedWatchPosition(sync, effectiveState);
  let duration = Math.max(0, Number(sync?.duration) || 0);
  if (!duration && watchPlayerReady && watchPlayer) {
    try { duration = Math.max(0, Number(watchPlayer.getDuration?.()) || 0); } catch {}
  }
  if (watchTimeCurrent) watchTimeCurrent.textContent = formatWatchTime(expected);
  if (watchTimeDuration) watchTimeDuration.textContent = formatWatchTime(duration);
  if (watchProgressFill) {
    const percent = duration > 0 ? Math.max(0, Math.min(100, (expected / duration) * 100)) : 0;
    watchProgressFill.style.width = `${percent.toFixed(2)}%`;
  }
}

function applyWatchSync({ force = false } = {}) {
  updateWatchSongInfo();
  updateWatchProgressUi();
  const watchVisible = document.body.dataset.guestSection === "watch" || watchFocusActive;
  if (!watchVisible && !force) return;
  if (!currentSong?.youtubeVideoId) {
    if (watchPlayerReady && watchPlayer && watchLoadedVideoId) {
      try { watchPlayer.stopVideo?.(); } catch {}
    }
    resetWatchPlaybackRate();
    watchLoadedVideoId = null;
    clearWatchPlayerError();
    watchRecoveryAttempts = 0;
    return;
  }

  if (watchPlayerErrorCode && !force) {
    const code = watchPlayerErrorCode > 0 ? watchPlayerErrorCode : 0;
    setWatchSyncUi("error", code ? `VIDEO ERROR ${code}` : "PLAYER ERROR");
    return;
  }

  ensureWatchPlayer().then(() => {
    if (!watchPlayerReady || !watchPlayer || !currentSong?.youtubeVideoId) return;
    const sync = playbackSync;
    // currentSong is authoritative for the video and playback state. playbackSync
    // only contributes the precise timestamp when it belongs to the same song.
    const targetVideoId = String(currentSong.youtubeVideoId || "");
    if (!targetVideoId) return;
    const syncMatchesSong = Boolean(sync?.videoId && sync.videoId === targetVideoId);
    const desiredState = currentSong.playbackState || (syncMatchesSong ? sync?.state : null) || "playing";
    const expected = syncMatchesSong ? expectedWatchPosition(sync, desiredState) : 0;

    try {
      watchPlayer.mute?.();
      watchPlayer.setVolume?.(0);

      if (watchLoadedVideoId !== targetVideoId) {
        clearWatchPlayerError();
        watchRecoveryAttempts = 0;
        watchLoadedVideoId = targetVideoId;
        watchLastLoadAttemptAt = Date.now();
        watchLoadStartedAt = Date.now();
        watchLastPlayCommandAt = 0;
        watchLastCorrectionAt = 0;
        watchAppliedPlaybackRate = 1;
        if (watchEmpty) watchEmpty.hidden = true;

        if (desiredState === "playing") {
          watchPlayer.loadVideoById({
            videoId: targetVideoId,
            startSeconds: Math.max(0, expected)
          });
          watchLastPlayCommandAt = Date.now();
        } else {
          watchPlayer.cueVideoById({
            videoId: targetVideoId,
            startSeconds: Math.max(0, expected)
          });
        }
        setWatchSyncUi("adjusting", desiredState === "playing" ? "STARTING…" : "SYNCING…");
        return;
      }

      if (watchEmpty) watchEmpty.hidden = true;

      let localTime = 0;
      try { localTime = Number(watchPlayer.getCurrentTime?.()) || 0; } catch {}
      const signedDrift = localTime - expected;
      const drift = Math.abs(signedDrift);
      const now = Date.now();
      const loadAge = watchLoadStartedAt ? now - watchLoadStartedAt : Infinity;
      let actualPlayerState = watchPlayerState;
      try { actualPlayerState = Number(watchPlayer.getPlayerState?.()); } catch {}
      const YTPS = window.YT?.PlayerState || {};
      const locallyPlaying = actualPlayerState === YTPS.PLAYING;
      const buffering = actualPlayerState === YTPS.BUFFERING;
      const pausedOrCued = actualPlayerState === YTPS.PAUSED || actualPlayerState === YTPS.CUED;
      const unstarted = actualPlayerState === YTPS.UNSTARTED || actualPlayerState == null || Number.isNaN(actualPlayerState);

      // Precision lock strategy:
      // 1) > ~0.6s drift: one hard seek to the projected Host frame.
      // 2) ~0.2-0.6s drift: briefly run the muted phone at 1.25x/0.75x.
      // 3) < ~0.14s drift: restore exactly 1x and treat it as locked.
      // We never seek repeatedly while BUFFERING, which preserves the playback
      // recovery fix from the previous build.
      if (desiredState === "playing") {
        if (locallyPlaying) {
          if (
            drift >= WATCH_HARD_SEEK_SECONDS &&
            loadAge > WATCH_LOAD_GRACE_MS &&
            now - watchLastCorrectionAt > WATCH_CORRECTION_COOLDOWN_MS
          ) {
            resetWatchPlaybackRate();
            watchPlayer.seekTo(Math.max(0, expected), true);
            watchLastCorrectionAt = now;
          } else if (drift >= WATCH_RATE_NUDGE_DRIFT_SECONDS && loadAge > WATCH_LOAD_GRACE_MS) {
            const rateAdjusted = setWatchCatchupRate(signedDrift);
            if (!rateAdjusted && now - watchLastCorrectionAt > WATCH_CORRECTION_COOLDOWN_MS) {
              // Some videos expose only 1x playback. In that case use a precise
              // seek rather than accepting a visible quarter/half-second lag.
              watchPlayer.seekTo(Math.max(0, expected), true);
              watchLastCorrectionAt = now;
            }
          } else if (drift <= WATCH_SYNCED_DRIFT_SECONDS) {
            resetWatchPlaybackRate();
          }
        } else if (!buffering && (pausedOrCued || unstarted) && !watchAutoplayBlocked) {
          resetWatchPlaybackRate();
          if (now - watchLastPlayCommandAt > WATCH_PLAY_RETRY_MS) {
            if (drift > WATCH_RATE_NUDGE_DRIFT_SECONDS && loadAge > WATCH_LOAD_GRACE_MS) {
              watchPlayer.seekTo(Math.max(0, expected), true);
              watchLastCorrectionAt = now;
            }
            watchPlayer.playVideo?.();
            watchLastPlayCommandAt = now;
          }
        }
      } else if (desiredState === "paused") {
        resetWatchPlaybackRate();
        if (locallyPlaying || buffering) watchPlayer.pauseVideo?.();
        if (
          drift > WATCH_RATE_NUDGE_DRIFT_SECONDS &&
          loadAge > WATCH_LOAD_GRACE_MS &&
          now - watchLastCorrectionAt > WATCH_CORRECTION_COOLDOWN_MS
        ) {
          watchPlayer.seekTo(Math.max(0, expected), true);
          watchLastCorrectionAt = now;
        }
      } else if (desiredState === "stopped" || desiredState === "error") {
        resetWatchPlaybackRate();
        if (locallyPlaying || buffering) watchPlayer.pauseVideo?.();
      }

      const heartbeatAnchor = Number.isFinite(Number(sync?.capturedAt)) ? Number(sync.capturedAt) : Number(sync?.updatedAt);
      const heartbeatAge = Number.isFinite(heartbeatAnchor) ? Math.max(0, serverNowMs() - heartbeatAnchor) : Infinity;
      const autoplayGraceElapsed = Date.now() - watchLastLoadAttemptAt > WATCH_LOAD_GRACE_MS;

      if (!syncMatchesSong || !sync?.updatedAt) {
        setWatchSyncUi("adjusting", "SYNCING…");
      } else if (desiredState === "playing" && heartbeatAge > WATCH_HEARTBEAT_STALE_MS) {
        setWatchSyncUi("reconnecting", "RECONNECTING");
      } else if (desiredState === "playing" && !locallyPlaying && !buffering && autoplayGraceElapsed) {
        // Do not say SYNCING forever when the only blocker is the browser's
        // autoplay policy. The YouTube iframe is clickable, so one direct tap
        // on its Play button starts the muted second display.
        setWatchSyncUi("adjusting", "TAP ▶ TO START");
      } else if (drift > WATCH_SYNCED_DRIFT_SECONDS) {
        setWatchSyncUi("adjusting", watchAppliedPlaybackRate === 1 ? "FINE-TUNING…" : "LOCKING…");
      } else if (desiredState === "paused") {
        setWatchSyncUi("paused", "PAUSED");
      } else if (desiredState === "stopped") {
        setWatchSyncUi("paused", "STOPPED");
      } else if (desiredState === "playing" && buffering) {
        setWatchSyncUi("adjusting", "BUFFERING");
      } else if (desiredState === "playing" && locallyPlaying) {
        setWatchSyncUi("synced", "● LIVE SYNCED");
      } else {
        setWatchSyncUi("adjusting", "STARTING…");
      }
    } catch (error) {
      console.debug("Guest Watch sync retry:", error?.message || error);
      if (watchPlayerErrorCode) {
        const code = watchPlayerErrorCode > 0 ? watchPlayerErrorCode : 0;
        setWatchSyncUi("error", code ? `VIDEO ERROR ${code}` : "PLAYER ERROR");
      } else {
        setWatchSyncUi("adjusting", "SYNCING…");
      }
    }
  }).catch(() => {});
}

function scheduleWatchApply(delay = 80, force = false) {
  window.clearTimeout(watchApplyTimer);
  watchApplyTimer = window.setTimeout(() => applyWatchSync({ force }), delay);
}

function forceWatchResync() {
  if (document.body.dataset.guestSection !== "watch" && !watchFocusActive) return;
  scheduleWatchApply(0, true);
}

function startWatchSyncTicker() {
  if (watchSyncTickTimer) return;
  watchSyncTickTimer = window.setInterval(() => {
    if (!activeSessionId || document.visibilityState === "hidden") return;
    updateWatchProgressUi();
    if (document.body.dataset.guestSection === "watch" || watchFocusActive) applyWatchSync();
  }, WATCH_SYNC_TICK_MS);
}

function stopWatchSyncTicker() {
  if (watchSyncTickTimer) window.clearInterval(watchSyncTickTimer);
  watchSyncTickTimer = null;
  window.clearTimeout(watchApplyTimer);
  watchApplyTimer = null;
  window.clearTimeout(watchLoadRetryTimer);
  watchLoadRetryTimer = null;
  window.clearTimeout(watchRecoveryTimer);
  watchRecoveryTimer = null;
}

async function requestWatchWakeLock() {
  if (!watchFocusActive || !navigator.wakeLock?.request) return;
  try {
    watchWakeLock = await navigator.wakeLock.request("screen");
    watchWakeLock.addEventListener?.("release", () => { watchWakeLock = null; });
  } catch {}
}

async function setWatchFocus(active) {
  watchFocusActive = Boolean(active);
  document.body.classList.toggle("guest-watch-focus", watchFocusActive);
  if (watchFocusBtn) watchFocusBtn.textContent = watchFocusActive ? "✕ Exit Focus" : "⛶ Focus";

  if (watchFocusActive) {
    await requestWatchWakeLock();
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
    } catch {}
    forceWatchResync();
  } else {
    try { await watchWakeLock?.release?.(); } catch {}
    watchWakeLock = null;
    try { if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  }
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
    updateWatchSongInfo();
    scheduleWatchApply(20);
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
      ${currentSong.dedication ? `<small class="song-dedication">💬 ${escapeHtml(currentSong.dedication)}</small>` : ""}
    </div>`;
  renderSingerControls(state);
  updateWatchSongInfo();
  scheduleWatchApply(30);
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
  setGuestTab("watch");
  startWatchSyncTicker();
  setYouTubeSearchState();
}
function unsubscribeRoomListeners() {
  unsubscribeHost?.();
  unsubscribeGuestCount?.();
  unsubscribeSettings?.();
  unsubscribeQueue?.();
  unsubscribeCurrentSong?.();
  unsubscribePlaybackSync?.();
  unsubscribeHost = null;
  unsubscribeGuestCount = null;
  unsubscribeSettings = null;
  unsubscribeQueue = null;
  unsubscribeCurrentSong = null;
  unsubscribePlaybackSync = null;
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
  queueSnapshotReady = false;
  currentSongSnapshotReady = false;
  const generation = ++roomListenerGeneration;
  const sessionId = activeSessionId;

  const hostRef = ref(db, `sessions/${sessionId}/meta/hostOnline`);
  const guestsRef = ref(db, `sessions/${sessionId}/guests`);
  const settingsRef = ref(db, `sessions/${sessionId}/settings`);
  const queueRef = ref(db, `sessions/${sessionId}/queue`);
  const currentSongRef = ref(db, `sessions/${sessionId}/currentSong`);
  const playbackSyncRef = ref(db, `sessions/${sessionId}/playbackSync`);

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
    queueSnapshotReady = true;
    renderQueue();
  }, roomListenerError("queue", generation));

  unsubscribeCurrentSong = onValue(currentSongRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    currentSongSnapshotReady = true;
    renderCurrentSong(snapshot.val());
  }, roomListenerError("current-song", generation));

  unsubscribePlaybackSync = onValue(playbackSyncRef, snapshot => {
    if (generation !== roomListenerGeneration) return;
    playbackSync = snapshot.val() || null;
    scheduleWatchApply(25);
  }, roomListenerError("playback-sync", generation));
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
async function reserveSongById(title, videoId, thumbnail = "", dedication = cleanDedication(dedicationInput?.value)) {
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
    dedication,
    addedAt: Date.now(),
    status: "waiting"
  });
  if (dedicationInput) dedicationInput.value = "";
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

    unsubscribeServerTimeOffset?.();
    unsubscribeServerTimeOffset = onValue(ref(db, ".info/serverTimeOffset"), snapshot => {
      serverTimeOffsetMs = Number(snapshot.val()) || 0;
      if (activeSessionId) scheduleWatchApply(20);
    });

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
  if (button.dataset.guestTab === "watch") {
    // Use the actual tab tap as an autoplay-safe user gesture when possible.
    nudgeWatchPlaybackFromGesture();
    applyWatchSync({ force: true });
  }
});

function nudgeWatchPlaybackFromGesture() {
  if (!currentSong?.youtubeVideoId) return;

  if (watchPlayerErrorCode) {
    rebuildWatchPlayer({ preserveRecoveryCount: false });
    clearWatchPlayerError();
    setWatchSyncUi("adjusting", "REBUILDING…");
    ensureWatchPlayer().then(() => scheduleWatchApply(40, true)).catch(() => {});
    return;
  }

  // Remove our cover immediately so a guest can tap YouTube's native Play
  // control if the browser blocked programmatic autoplay.
  if (watchEmpty) watchEmpty.hidden = true;

  if (!watchPlayerReady || !watchPlayer) {
    setWatchSyncUi("adjusting", "PLAYER LOADING");
    ensureWatchPlayer().then(() => scheduleWatchApply(20, true)).catch(() => {});
    return;
  }

  try {
    watchPlayer.mute?.();
    watchPlayer.setVolume?.(0);
    const targetVideoId = String(currentSong.youtubeVideoId || "");
    const syncMatchesSong = Boolean(playbackSync?.videoId && playbackSync.videoId === targetVideoId);
    const desiredState = currentSong.playbackState || (syncMatchesSong ? playbackSync?.state : null) || "playing";
    const expected = syncMatchesSong ? expectedWatchPosition(playbackSync, desiredState) : 0;

    if (watchLoadedVideoId !== targetVideoId) {
      watchLoadedVideoId = targetVideoId;
      watchLastLoadAttemptAt = Date.now();
      watchLoadStartedAt = Date.now();
      watchPlayer.loadVideoById?.({ videoId: targetVideoId, startSeconds: Math.max(0, expected) });
      watchLastPlayCommandAt = Date.now();
    } else if (desiredState === "playing") {
      let localTime = 0;
      try { localTime = Number(watchPlayer.getCurrentTime?.()) || 0; } catch {}
      if (Math.abs(localTime - expected) > WATCH_DRIFT_SEEK_SECONDS) watchPlayer.seekTo?.(Math.max(0, expected), true);
      // Called directly from the tap handler: this preserves the browser user
      // gesture and fixes phones that ignore asynchronous playVideo() calls.
      watchPlayer.playVideo?.();
      watchLastPlayCommandAt = Date.now();
    }
    setWatchSyncUi("adjusting", "STARTING…");
    scheduleWatchApply(220, true);
  } catch (error) {
    console.debug("Watch tap-to-start retry:", error?.message || error);
    setWatchSyncUi("adjusting", "TAP ▶ TO START");
  }
}

watchEmpty?.addEventListener("click", nudgeWatchPlaybackFromGesture);

watchResyncBtn?.addEventListener("click", () => {
  nudgeWatchPlaybackFromGesture();
  applyWatchSync({ force: true });
});

watchFocusBtn?.addEventListener("click", () => {
  setWatchFocus(!watchFocusActive).catch(() => {});
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && watchFocusActive) {
    watchFocusActive = false;
    document.body.classList.remove("guest-watch-focus");
    if (watchFocusBtn) watchFocusBtn.textContent = "⛶ Focus";
    try { watchWakeLock?.release?.(); } catch {}
    watchWakeLock = null;
  }
});

guestReactionDock?.addEventListener("click", event => {
  const button = event.target.closest("[data-reaction]");
  if (!button) return;
  sendLiveReaction(button.dataset.reaction).then(() => {
    button.classList.remove("is-popped");
    void button.offsetWidth;
    button.classList.add("is-popped");
    window.setTimeout(() => button.classList.remove("is-popped"), 300);
  }).catch(error => console.debug("Reaction skipped:", error?.message || error));
});

guestTurnAlertClose?.addEventListener("click", () => {
  window.clearTimeout(turnAlertTimer);
  guestTurnAlert?.classList.remove("is-showing");
  if (guestTurnAlert) guestTurnAlert.hidden = true;
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

watchPlayPauseBtn?.addEventListener("click", async () => {
  if (singerControlBusy || watchSingerControls?.hidden) return;
  const action = watchPlayPauseBtn.dataset.action || "pause";
  singerControlBusy = true;
  renderSingerControls(currentSong?.playbackState || "idle");
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

watchSkipBtn?.addEventListener("click", async () => {
  if (singerControlBusy || watchSingerControls?.hidden) return;
  const requestedQueueItemId = currentSong?.queueItemId || null;
  singerControlBusy = true;
  renderSingerControls(currentSong?.playbackState || "playing");
  try {
    await sendSingerControl("skip");
    window.setTimeout(() => {
      if (singerControlBusy && currentSong?.queueItemId === requestedQueueItemId) {
        singerControlBusy = false;
        renderSingerControls(currentSong?.playbackState || "idle");
      }
    }, 2200);
  } catch (error) {
    console.error(error);
    singerControlBusy = false;
    renderSingerControls(currentSong?.playbackState || "idle");
    setMessage(reserveMessage, error.message || "Could not skip your song.", "error");
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
  playbackSync = null;
  queueSnapshotReady = false;
  currentSongSnapshotReady = false;
  lastTurnAwareness = "idle";
  window.clearTimeout(turnAlertTimer);
  if (guestTurnAlert) guestTurnAlert.hidden = true;
  renderQueue();
  stopWatchSyncTicker();
  if (watchFocusActive) await setWatchFocus(false);
  try { watchPlayer?.stopVideo?.(); } catch {}
  watchLoadedVideoId = null;
  updateWatchSongInfo();
  roomPanel.hidden = true;
  joinPanel.hidden = false;
  applyGuestTheme("classic");
  setGuestTab("watch");
  joinForm.querySelector("button").disabled = false;
  leaveBtn.disabled = false;
  setMessage(guestMessage, "You left the session. Your waiting reservations remain in the queue until you cancel them or the Host removes them.", "success");
});


document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && activeSessionId) {
    scheduleRoomResync(60);
    forceWatchResync();
    if (watchFocusActive) requestWatchWakeLock();
  }
});

window.addEventListener("pageshow", () => {
  if (activeSessionId) scheduleRoomResync(60);
});

window.addEventListener("online", () => {
  if (activeSessionId) scheduleRoomResync(40);
});


document.body.dataset.guestSection = "watch";
applyGuestTheme(savedGuestTheme(), { animate: false });

init();

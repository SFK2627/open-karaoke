import {
  initFirebase,
  isFirebaseConfigured,
  ref,
  get,
  onValue,
  onDisconnect,
  update,
  remove,
  serverTimestamp,
  runTransaction
} from "./firebase.js";
import { renderQrCode } from "./qr.js";
import {
  sortQueueEntries,
  sortFinishedEntries,
  queueSortValue,
  escapeHtml
} from "./queue.js";
import {
  createYouTubePlayer,
  youtubePlayerErrorMessage
} from "./youtube.js";

const createPanel = document.querySelector("#createPanel");
const createForm = document.querySelector("#createSessionForm");
const createPinInput = document.querySelector("#createPinInput");
const unlockPanel = document.querySelector("#unlockPanel");
const unlockForm = document.querySelector("#unlockForm");
const unlockPinInput = document.querySelector("#unlockPinInput");
const unlockSessionCode = document.querySelector("#unlockSessionCode");
const unlockMessage = document.querySelector("#unlockMessage");
const forgetRecoveredBtn = document.querySelector("#forgetRecoveredBtn");
const sessionPanel = document.querySelector("#sessionPanel");
const createBtn = document.querySelector("#createSessionBtn");
const configWarning = document.querySelector("#configWarning");
const hostMessage = document.querySelector("#hostMessage");
const connectionStatus = document.querySelector("#connectionStatus");
const sessionCodeEl = document.querySelector("#sessionCode");
const guestLinkInput = document.querySelector("#guestLink");
const guestCountEl = document.querySelector("#guestCount");
const guestListEl = document.querySelector("#guestList");
const hostStatusText = document.querySelector("#hostStatusText");
const hostQueueCount = document.querySelector("#hostQueueCount");
const hostQueue = document.querySelector("#hostQueue");
const hostQueueNotice = document.querySelector("#hostQueueNotice");
const historyList = document.querySelector("#historyList");
const lockReservationsBtn = document.querySelector("#lockReservationsBtn");
const clearQueueBtn = document.querySelector("#clearQueueBtn");
const clearHistoryBtn = document.querySelector("#clearHistoryBtn");
const endSessionBtn = document.querySelector("#endSessionBtn");
const lockHostBtn = document.querySelector("#lockHostBtn");
const fullscreenBtn = document.querySelector("#fullscreenBtn");
const copyCodeBtn = document.querySelector("#copyCodeBtn");
const copyLinkBtn = document.querySelector("#copyLinkBtn");
const playerEmpty = document.querySelector("#playerEmpty");
const nowPlayingTitle = document.querySelector("#nowPlayingTitle");
const nowPlayingSinger = document.querySelector("#nowPlayingSinger");
const playbackStateEl = document.querySelector("#playbackState");
const playBtn = document.querySelector("#playBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const stopBtn = document.querySelector("#stopBtn");
const previousBtn = document.querySelector("#previousBtn");
const nextBtn = document.querySelector("#nextBtn");
const volumeSlider = document.querySelector("#volumeSlider");
const volumeValue = document.querySelector("#volumeValue");
const playerError = document.querySelector("#playerError");
const playerMessage = document.querySelector("#playerMessage");
const tvQueueStrip = document.querySelector("#tvQueueStrip");
const tvQrToggleBtn = document.querySelector("#tvQrToggleBtn");
const tvExitBtn = document.querySelector("#tvExitBtn");
const tvQrOverlay = document.querySelector("#tvQrOverlay");
const tvQrBackdrop = document.querySelector("#tvQrBackdrop");
const tvQrCloseBtn = document.querySelector("#tvQrCloseBtn");
const tvQrCode = document.querySelector("#tvQrCode");
const tvQrSessionCode = document.querySelector("#tvQrSessionCode");

let db;
let user;
let activeSessionId = null;
let reservationsLocked = false;
let queueEntries = [];
let currentSong = null;
let player = null;
let playerReady = false;
let loadedVideoId = null;
let advancing = false;
let suppressPlayerEventsUntil = 0;
let hostDisconnectAction = null;
let unsubscribeGuests = null;
let unsubscribeConnected = null;
let unsubscribeQueue = null;
let unsubscribeSettings = null;
let unsubscribeCurrentSong = null;
let autoStartTimer = null;
let autoStartInFlight = false;

function setMessage(text, type = "") {
  hostMessage.textContent = text;
  hostMessage.className = `form-message ${type}`.trim();
}

function setUnlockMessage(text, type = "") {
  unlockMessage.textContent = text;
  unlockMessage.className = `form-message ${type}`.trim();
}

function setPlayerMessage(text, type = "") {
  playerMessage.textContent = text;
  playerMessage.className = `form-message player-message ${type}`.trim();
}

function showPlayerError(text) {
  playerError.hidden = !text;
  playerError.textContent = text || "";
}

function setConnection(isOnline) {
  connectionStatus.textContent = isOnline ? "Firebase Online" : "Offline";
  connectionStatus.dataset.state = isOnline ? "online" : "offline";
  if (hostStatusText) hostStatusText.textContent = isOnline ? "Online" : "Offline";
}

function makeSessionCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `KARAOKE-${code}`;
}

async function createUniqueSession() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const sessionId = makeSessionCode();
    const sessionRef = ref(db, `sessions/${sessionId}`);
    const result = await runTransaction(sessionRef, current => {
      if (current !== null) return;
      return {
        meta: {
          sessionId,
          hostUid: user.uid,
          hostOnline: true,
          createdAt: serverTimestamp(),
          hostLastSeen: serverTimestamp()
        },
        settings: {
          reservationsLocked: false
        }
      };
    }, { applyLocally: false });

    if (result.committed) return sessionId;
  }
  throw new Error("Could not create a unique session. Please try again.");
}

function buildGuestUrl(sessionId) {
  const url = new URL("./guest.html", window.location.href);
  url.search = "";
  url.searchParams.set("session", sessionId);
  url.searchParams.set("v", "20260909-repeat-audio2");
  return url.toString();
}

function pinStorageKey(sessionId) {
  return `openKaraokeHostPin:${sessionId}`;
}

function randomSalt() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function readPinRecord(sessionId) {
  try {
    const raw = localStorage.getItem(pinStorageKey(sessionId));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.salt && parsed?.hash ? parsed : null;
  } catch {
    return null;
  }
}

async function saveHostPin(sessionId, pin) {
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  localStorage.setItem(pinStorageKey(sessionId), JSON.stringify({ salt, hash }));
}

async function verifyHostPin(sessionId, pin) {
  const record = readPinRecord(sessionId);
  if (!record) return null;
  const candidate = await hashPin(pin, record.salt);
  return candidate === record.hash;
}

function validPin(pin) {
  return /^\d{4,8}$/.test(String(pin || ""));
}

function renderGuests(guests) {
  const entries = Object.entries(guests || {});
  guestCountEl.textContent = String(entries.length);

  if (!entries.length) {
    guestListEl.className = "guest-list empty-state";
    guestListEl.textContent = "No guests connected yet.";
    return;
  }

  guestListEl.className = "guest-list";
  guestListEl.innerHTML = entries
    .sort((a, b) => (a[1]?.joinedAt || 0) - (b[1]?.joinedAt || 0))
    .map(([, guest], index) => {
      const safeName = escapeHtml(guest?.name || "Guest");
      return `<div class="guest-item"><strong>${index + 1}. ${safeName}</strong><span>connected</span></div>`;
    })
    .join("");
}

function waitingEntries() {
  return queueEntries.filter(([, item]) => item?.status === "waiting");
}

function finishedEntries() {
  return sortFinishedEntries(Object.fromEntries(queueEntries));
}

function renderTvQueueStrip() {
  if (!tvQueueStrip) return;
  const waiting = waitingEntries();

  if (!waiting.length) {
    tvQueueStrip.innerHTML = `<span class="tv-queue-empty">${currentSong ? "Waiting for more reservations…" : "Reserve a song — the first one starts automatically."}</span>`;
    return;
  }

  const visible = waiting.slice(0, 7);
  const extra = waiting.length - visible.length;
  tvQueueStrip.innerHTML = visible.map(([, item], index) => `
    <div class="tv-queue-card" title="${escapeHtml(item.title)} — ${escapeHtml(item.singerName)}">
      <span class="tv-queue-number">${index + 1}</span>
      <img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
      <span class="tv-queue-text">
        <strong>${escapeHtml(item.title)}</strong>
        <small>👤 ${escapeHtml(item.singerName)}</small>
      </span>
    </div>
  `).join("") + (extra > 0 ? `<span class="tv-queue-more">+${extra} more</span>` : "");
}

function renderHostQueue() {
  const waiting = waitingEntries();
  hostQueueCount.textContent = String(waiting.length);
  clearQueueBtn.disabled = waiting.length === 0;
  renderTvQueueStrip();

  if (!waiting.length) {
    hostQueue.className = "song-list empty-state";
    hostQueue.textContent = currentSong ? "No more songs waiting after the current song." : "No songs reserved yet.";
    return;
  }

  hostQueue.className = "song-list";
  hostQueue.innerHTML = waiting.map(([id, item], index) => `
    <div class="song-item host-song-item">
      <div class="song-position">${index + 1}</div>
      <img class="song-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
      <div class="song-info">
        <strong>${escapeHtml(item.title)}</strong>
        <span>👤 ${escapeHtml(item.singerName)}</span>
      </div>
      <div class="queue-edit-actions">
        <button class="btn btn-secondary btn-small icon-action" type="button" data-move-song="${escapeHtml(id)}" data-direction="up" ${index === 0 ? "disabled" : ""} aria-label="Move song up">↑</button>
        <button class="btn btn-secondary btn-small icon-action" type="button" data-move-song="${escapeHtml(id)}" data-direction="down" ${index === waiting.length - 1 ? "disabled" : ""} aria-label="Move song down">↓</button>
        <button class="btn btn-danger btn-small" type="button" data-remove-song="${escapeHtml(id)}">Remove</button>
      </div>
    </div>
  `).join("");
}

function renderHistory() {
  const finished = finishedEntries();
  clearHistoryBtn.disabled = finished.length === 0;
  previousBtn.disabled = !currentSong && finished.length === 0;

  if (!finished.length) {
    historyList.className = "song-list empty-state";
    historyList.textContent = "No finished songs yet.";
    return;
  }

  historyList.className = "song-list history-list";
  historyList.innerHTML = finished.slice(0, 12).map(([, item]) => `
    <div class="history-item">
      <img class="song-thumb" src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
      <div class="song-info">
        <strong>${escapeHtml(item.title)}</strong>
        <span>👤 ${escapeHtml(item.singerName)}</span>
      </div>
      <span class="history-status" data-status="${escapeHtml(item.status)}">${item.status === "completed" ? "Completed" : "Skipped"}</span>
    </div>
  `).join("");
}

function renderReservationState(locked) {
  reservationsLocked = locked === true;
  lockReservationsBtn.textContent = reservationsLocked ? "🔓 Open Reservations" : "🔒 Lock Reservations";
  hostQueueNotice.hidden = !reservationsLocked;
  hostQueueNotice.textContent = reservationsLocked ? "🔒 New guest reservations are currently locked. Existing songs remain in the queue." : "";
}

function renderPlaybackState(state) {
  const normalized = ["playing", "paused", "stopped", "error"].includes(state) ? state : "idle";
  playbackStateEl.dataset.state = normalized;
  playbackStateEl.textContent = normalized.toUpperCase();
}

function renderCurrentSong(song) {
  currentSong = song || null;
  showPlayerError("");
  renderTvQueueStrip();

  if (!currentSong) {
    nowPlayingTitle.textContent = "Waiting for a song…";
    nowPlayingSinger.textContent = "Queue is ready when guests add songs.";
    playerEmpty.hidden = false;
    renderPlaybackState("idle");
    renderHistory();
    return;
  }

  nowPlayingTitle.textContent = currentSong.title || "Untitled song";
  nowPlayingSinger.textContent = `👤 ${currentSong.singerName || "Guest"}`;
  playerEmpty.hidden = true;
  renderPlaybackState(currentSong.playbackState || "playing");
  renderHistory();
}

async function setupHostPresence(sessionId) {
  const connectedRef = ref(db, ".info/connected");
  const hostMetaRef = ref(db, `sessions/${sessionId}/meta`);
  const hostOnlineRef = ref(db, `sessions/${sessionId}/meta/hostOnline`);

  unsubscribeConnected?.();
  try { await hostDisconnectAction?.cancel?.(); } catch {}
  hostDisconnectAction = onDisconnect(hostOnlineRef);

  unsubscribeConnected = onValue(connectedRef, async snapshot => {
    const connected = snapshot.val() === true;
    setConnection(connected);
    if (!connected) return;

    try {
      await hostDisconnectAction.set(false);
      await update(hostMetaRef, {
        hostOnline: true,
        hostLastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error("Host presence error:", error);
    }
  });
}

function watchGuests(sessionId) {
  unsubscribeGuests?.();
  unsubscribeGuests = onValue(ref(db, `sessions/${sessionId}/guests`), snapshot => {
    renderGuests(snapshot.val());
  });
}

function watchQueue(sessionId) {
  unsubscribeQueue?.();
  unsubscribeQueue = onValue(ref(db, `sessions/${sessionId}/queue`), snapshot => {
    queueEntries = sortQueueEntries(snapshot.val());
    renderHostQueue();
    renderHistory();
    scheduleAutoStart();
  });
}

function watchSettings(sessionId) {
  unsubscribeSettings?.();
  unsubscribeSettings = onValue(ref(db, `sessions/${sessionId}/settings/reservationsLocked`), snapshot => {
    renderReservationState(snapshot.val() === true);
  });
}

function watchCurrentSong(sessionId) {
  unsubscribeCurrentSong?.();
  unsubscribeCurrentSong = onValue(ref(db, `sessions/${sessionId}/currentSong`), snapshot => {
    const nextCurrent = snapshot.val();
    const previousVideoId = currentSong?.youtubeVideoId || null;
    renderCurrentSong(nextCurrent);
    syncPlayerToFirebase(previousVideoId).catch(error => console.error(error));
  });
}

function scheduleAutoStart() {
  window.clearTimeout(autoStartTimer);
  autoStartTimer = window.setTimeout(() => {
    autoStartFirstWaitingSong().catch(error => {
      console.error("Auto-start error:", error);
      setPlayerMessage("A song is waiting. Press Space or Play if the browser blocked autoplay.", "error");
    });
  }, 180);
}

async function autoStartFirstWaitingSong() {
  if (!activeSessionId || advancing || autoStartInFlight || currentSong || !waitingEntries().length) return;
  autoStartInFlight = true;
  try {
    const currentSnapshot = await get(ref(db, `sessions/${activeSessionId}/currentSong`));
    if (currentSnapshot.exists()) return;

    const queueSnapshot = await get(ref(db, `sessions/${activeSessionId}/queue`));
    const hasWaiting = sortQueueEntries(queueSnapshot.val()).some(([, item]) => item?.status === "waiting");
    if (!hasWaiting) return;

    await advanceToNext("skipped");
  } finally {
    autoStartInFlight = false;
  }
}

function currentVolume() {
  const value = Number(volumeSlider.value || 100);
  return Math.min(100, Math.max(0, value));
}

function makePlayerAudible({ resetIfSilent = false } = {}) {
  if (!playerReady || !player) return;

  let volume = currentVolume();
  if (resetIfSilent && volume <= 0) {
    volume = 100;
    volumeSlider.value = "100";
    volumeValue.textContent = "100%";
    localStorage.setItem("openKaraokeVolume", "100");
  }

  try { player.unMute?.(); } catch {}
  try { player.setVolume?.(volume); } catch {}
}

async function ensurePlayer() {
  if (player) return player;

  try {
    player = await createYouTubePlayer("youtubePlayer", {
      onReady: event => {
        playerReady = true;
        try { event.target.unMute?.(); } catch {}
        event.target.setVolume(currentVolume() || 100);
        try {
          event.target.getIframe()?.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture; fullscreen");
        } catch {}
        syncPlayerToFirebase(null).catch(error => console.error(error));
        scheduleAutoStart();
      },
      onStateChange: event => handlePlayerStateChange(event),
      onError: event => handlePlayerError(event)
    });
  } catch (error) {
    console.error(error);
    showPlayerError("Could not load the YouTube player. Check the Host computer's internet connection and reload the page.");
  }

  return player;
}

async function syncPlayerToFirebase(previousVideoId) {
  if (!playerReady || !player) return;

  if (!currentSong?.youtubeVideoId) {
    if (loadedVideoId) {
      suppressPlayerEventsUntil = Date.now() + 900;
      try { player.stopVideo(); } catch {}
      loadedVideoId = null;
    }
    return;
  }

  const videoChanged = loadedVideoId !== currentSong.youtubeVideoId || previousVideoId !== currentSong.youtubeVideoId;
  const desiredState = currentSong.playbackState || "playing";

  if (videoChanged) {
    loadedVideoId = currentSong.youtubeVideoId;
    if (desiredState === "playing") {
      makePlayerAudible({ resetIfSilent: true });
      player.loadVideoById(currentSong.youtubeVideoId);
      window.setTimeout(() => {
        try {
          makePlayerAudible({ resetIfSilent: true });
          player?.playVideo?.();
        } catch {}
      }, 220);
      window.setTimeout(() => {
        try { makePlayerAudible({ resetIfSilent: true }); } catch {}
      }, 900);
    } else {
      player.cueVideoById(currentSong.youtubeVideoId);
    }
  }

  if (!videoChanged) {
    try {
      if (desiredState === "playing") { makePlayerAudible({ resetIfSilent: true }); player.playVideo(); }
      if (desiredState === "paused") player.pauseVideo();
      if (desiredState === "stopped") {
        suppressPlayerEventsUntil = Date.now() + 900;
        player.stopVideo();
      }
    } catch (error) {
      console.error(error);
    }
  }
}

async function updateCurrentPlaybackState(state) {
  if (!activeSessionId || !currentSong) return;
  try {
    await update(ref(db, `sessions/${activeSessionId}/currentSong`), {
      playbackState: state
    });
  } catch (error) {
    console.error(error);
  }
}

function handlePlayerStateChange(event) {
  if (!window.YT || !currentSong) return;
  const state = event.data;

  if (state === window.YT.PlayerState.ENDED) {
    if (Date.now() < suppressPlayerEventsUntil) return;
    advanceToNext("completed").catch(error => {
      console.error(error);
      setPlayerMessage("Could not start the next song.", "error");
    });
    return;
  }

  if (Date.now() < suppressPlayerEventsUntil) return;

  if (state === window.YT.PlayerState.PLAYING) {
    makePlayerAudible({ resetIfSilent: true });
    renderPlaybackState("playing");
    if (currentSong.playbackState !== "playing") updateCurrentPlaybackState("playing");
  } else if (state === window.YT.PlayerState.PAUSED) {
    renderPlaybackState("paused");
    if (currentSong.playbackState !== "paused") updateCurrentPlaybackState("paused");
  }
}

function handlePlayerError(event) {
  const message = youtubePlayerErrorMessage(event.data);
  showPlayerError(`⚠️ ${message}`);
  renderPlaybackState("error");
  updateCurrentPlaybackState("error");
}

async function findWaitingSongs() {
  const snapshot = await get(ref(db, `sessions/${activeSessionId}/queue`));
  const entries = sortQueueEntries(snapshot.val());
  return {
    all: entries,
    waiting: entries.filter(([, item]) => item?.status === "waiting")
  };
}

async function advanceToNext(finalStatus = "skipped") {
  if (!activeSessionId || advancing) return;
  advancing = true;
  nextBtn.disabled = true;
  playBtn.disabled = true;
  previousBtn.disabled = true;
  showPlayerError("");

  try {
    const { all, waiting } = await findWaitingSongs();
    const allMap = new Map(all);
    const currentId = currentSong?.queueItemId || null;
    const nextEntry = waiting.find(([id]) => id !== currentId) || null;
    const patch = {};

    if (currentId && allMap.has(currentId)) {
      patch[`queue/${currentId}/status`] = finalStatus;
      patch[`queue/${currentId}/finishedAt`] = serverTimestamp();
    }

    if (!nextEntry) {
      patch.currentSong = null;
      await update(ref(db, `sessions/${activeSessionId}`), patch);
      setPlayerMessage("Queue is empty. Waiting for the next reservation.");
      return;
    }

    const [nextId, nextItem] = nextEntry;
    patch[`queue/${nextId}/status`] = "playing";
    patch[`queue/${nextId}/startedAt`] = serverTimestamp();
    patch[`queue/${nextId}/finishedAt`] = null;
    patch.currentSong = {
      queueItemId: nextId,
      youtubeVideoId: nextItem.youtubeVideoId,
      title: nextItem.title,
      thumbnail: nextItem.thumbnail,
      singerName: nextItem.singerName,
      guestId: nextItem.guestId,
      startedAt: serverTimestamp(),
      playbackState: "playing"
    };

    await update(ref(db, `sessions/${activeSessionId}`), patch);
    setPlayerMessage("");
  } finally {
    advancing = false;
    nextBtn.disabled = false;
    playBtn.disabled = false;
    renderHistory();
  }
}

async function startOrResume() {
  showPlayerError("");
  setPlayerMessage("");

  if (!currentSong) {
    await advanceToNext("skipped");
    return;
  }

  if (currentSong.playbackState === "stopped" || currentSong.playbackState === "error") {
    if (playerReady && player) {
      loadedVideoId = currentSong.youtubeVideoId;
      makePlayerAudible({ resetIfSilent: true });
      player.loadVideoById(currentSong.youtubeVideoId);
      window.setTimeout(() => makePlayerAudible({ resetIfSilent: true }), 250);
    }
  } else if (playerReady && player) {
    makePlayerAudible({ resetIfSilent: true });
    player.playVideo();
  }

  await updateCurrentPlaybackState("playing");
}

async function pauseCurrent() {
  if (!currentSong) return;
  if (playerReady && player) player.pauseVideo();
  await updateCurrentPlaybackState("paused");
}

async function stopCurrent() {
  if (!currentSong) return;
  suppressPlayerEventsUntil = Date.now() + 1200;
  if (playerReady && player) player.stopVideo();
  await updateCurrentPlaybackState("stopped");
}

async function moveWaitingSong(itemId, direction) {
  const waiting = waitingEntries();
  const index = waiting.findIndex(([id]) => id === itemId);
  if (index < 0) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= waiting.length) return;

  const reordered = [...waiting];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

  const patch = {};
  reordered.forEach(([id], position) => {
    patch[`queue/${id}/order`] = (position + 1) * 1000;
  });

  await update(ref(db, `sessions/${activeSessionId}`), patch);
}

async function playPrevious() {
  if (!activeSessionId || advancing) return;
  const finished = finishedEntries();

  if (!finished.length) {
    if (!currentSong || !playerReady || !player) {
      setPlayerMessage("There is no previous song yet.");
      return;
    }
    suppressPlayerEventsUntil = Date.now() + 700;
    try {
      makePlayerAudible({ resetIfSilent: true });
      player.seekTo(0, true);
      player.playVideo();
      await updateCurrentPlaybackState("playing");
      setPlayerMessage("Restarted the current song from the beginning.");
    } catch {
      setPlayerMessage("Could not restart the current song.", "error");
    }
    return;
  }

  advancing = true;
  previousBtn.disabled = true;
  nextBtn.disabled = true;

  try {
    const [previousId, previousItem] = finished[0];
    const waiting = waitingEntries();
    const waitingOrders = waiting.map(([, item]) => queueSortValue(item)).filter(Number.isFinite);
    const minWaitingOrder = waitingOrders.length ? Math.min(...waitingOrders) : Date.now();
    const patch = {};

    if (currentSong?.queueItemId) {
      patch[`queue/${currentSong.queueItemId}/status`] = "waiting";
      patch[`queue/${currentSong.queueItemId}/order`] = minWaitingOrder - 1000;
      patch[`queue/${currentSong.queueItemId}/startedAt`] = null;
      patch[`queue/${currentSong.queueItemId}/finishedAt`] = null;
    }

    patch[`queue/${previousId}/status`] = "playing";
    patch[`queue/${previousId}/startedAt`] = serverTimestamp();
    patch[`queue/${previousId}/finishedAt`] = null;
    patch.currentSong = {
      queueItemId: previousId,
      youtubeVideoId: previousItem.youtubeVideoId,
      title: previousItem.title,
      thumbnail: previousItem.thumbnail,
      singerName: previousItem.singerName,
      guestId: previousItem.guestId,
      startedAt: serverTimestamp(),
      playbackState: "playing"
    };

    await update(ref(db, `sessions/${activeSessionId}`), patch);
    setPlayerMessage("Loaded the previous song. The interrupted song was returned to the front of the queue.");
  } finally {
    advancing = false;
    nextBtn.disabled = false;
    renderHistory();
  }
}

async function showSession(sessionId) {
  activeSessionId = sessionId;
  const guestUrl = buildGuestUrl(sessionId);
  sessionCodeEl.textContent = sessionId;
  guestLinkInput.value = guestUrl;
  renderQrCode(document.querySelector("#qrCode"), guestUrl);
  if (tvQrCode) renderQrCode(tvQrCode, guestUrl);
  if (tvQrSessionCode) tvQrSessionCode.textContent = sessionId;
  createPanel.hidden = true;
  unlockPanel.hidden = true;
  sessionPanel.hidden = false;
  fullscreenBtn.hidden = false;
  localStorage.setItem("openKaraokeHostSession", sessionId);
  watchGuests(sessionId);
  watchQueue(sessionId);
  watchSettings(sessionId);
  watchCurrentSong(sessionId);
  await setupHostPresence(sessionId);
  await ensurePlayer();
}

function showUnlock(sessionId, migration = false) {
  activeSessionId = sessionId;
  createPanel.hidden = true;
  sessionPanel.hidden = true;
  fullscreenBtn.hidden = true;
  unlockPanel.hidden = false;
  unlockSessionCode.textContent = sessionId;
  unlockPinInput.value = "";
  setUnlockMessage(
    migration
      ? "This room was created before Host PIN protection was added. Enter a new 4-8 digit PIN to protect and recover it."
      : ""
  );
  window.setTimeout(() => unlockPinInput.focus(), 50);
}

function setQrOverlay(open) {
  if (!tvQrOverlay) return;
  tvQrOverlay.hidden = !open;
  document.body.classList.toggle("qr-overlay-open", open);
}

function toggleQrOverlay() {
  setQrOverlay(Boolean(tvQrOverlay?.hidden));
}

async function enterTvMode() {
  document.body.classList.add("tv-mode");
  fullscreenBtn.textContent = "⛶ Exit TV";
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // CSS TV mode still works even if the browser refuses Fullscreen API.
  }
}

async function exitTvMode() {
  setQrOverlay(false);
  document.body.classList.remove("tv-mode");
  fullscreenBtn.textContent = "📺 TV Mode";
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {}
}

async function toggleTvMode() {
  if (document.body.classList.contains("tv-mode") || document.fullscreenElement) {
    await exitTvMode();
  } else {
    await enterTvMode();
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const old = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => { button.textContent = old; }, 1200);
  } catch {
    window.prompt("Copy this:", text);
  }
}

async function clearWaitingQueue() {
  const waiting = waitingEntries();
  if (!waiting.length) return;
  if (!window.confirm(`Clear ${waiting.length} waiting ${waiting.length === 1 ? "song" : "songs"}? The current song will keep playing.`)) return;

  const patch = {};
  waiting.forEach(([id]) => { patch[`queue/${id}`] = null; });
  await update(ref(db, `sessions/${activeSessionId}`), patch);
}

async function clearFinishedHistory() {
  const finished = finishedEntries();
  if (!finished.length) return;
  if (!window.confirm(`Delete ${finished.length} finished ${finished.length === 1 ? "song" : "songs"} from history?`)) return;

  const patch = {};
  finished.forEach(([id]) => { patch[`queue/${id}`] = null; });
  await update(ref(db, `sessions/${activeSessionId}`), patch);
}

function unsubscribeRoomListeners() {
  unsubscribeGuests?.();
  unsubscribeConnected?.();
  unsubscribeQueue?.();
  unsubscribeSettings?.();
  unsubscribeCurrentSong?.();
  unsubscribeGuests = null;
  unsubscribeConnected = null;
  unsubscribeQueue = null;
  unsubscribeSettings = null;
  unsubscribeCurrentSong = null;
}

async function endSession() {
  if (!activeSessionId) return;
  const sessionId = activeSessionId;
  const confirmed = window.confirm(`End ${sessionId} and permanently delete this karaoke session from Firebase?`);
  if (!confirmed) return;

  endSessionBtn.disabled = true;
  try {
    try { await hostDisconnectAction?.cancel?.(); } catch {}
    suppressPlayerEventsUntil = Date.now() + 1200;
    try { player?.stopVideo?.(); } catch {}
    unsubscribeRoomListeners();
    await remove(ref(db, `sessions/${sessionId}`));
    localStorage.removeItem("openKaraokeHostSession");
    localStorage.removeItem(pinStorageKey(sessionId));
    window.location.replace("./host.html");
  } catch (error) {
    console.error(error);
    window.alert("Could not end the session. Check your Firebase connection/rules and try again.");
    endSessionBtn.disabled = false;
  }
}

async function init() {
  const savedVolume = Number(localStorage.getItem("openKaraokeVolume"));
  if (Number.isFinite(savedVolume) && savedVolume > 0 && savedVolume <= 100) {
    volumeSlider.value = String(savedVolume);
    volumeValue.textContent = `${savedVolume}%`;
  } else {
    volumeSlider.value = "100";
    volumeValue.textContent = "100%";
    localStorage.setItem("openKaraokeVolume", "100");
  }

  if (!isFirebaseConfigured()) {
    configWarning.hidden = false;
    createBtn.disabled = true;
    connectionStatus.textContent = "Needs Setup";
    connectionStatus.dataset.state = "offline";
    return;
  }

  try {
    ({ db, user } = await initFirebase());
    connectionStatus.textContent = "Firebase Ready";
    connectionStatus.dataset.state = "online";

    const savedSession = localStorage.getItem("openKaraokeHostSession");
    if (savedSession) {
      const snapshot = await get(ref(db, `sessions/${savedSession}/meta`));
      const meta = snapshot.val();
      if (snapshot.exists() && meta?.hostUid === user.uid) {
        showUnlock(savedSession, !readPinRecord(savedSession));
      } else {
        localStorage.removeItem("openKaraokeHostSession");
        localStorage.removeItem(pinStorageKey(savedSession));
      }
    }
  } catch (error) {
    console.error(error);
    setMessage("Could not connect to Firebase. Check the config, Anonymous Auth, database URL, and rules.", "error");
    connectionStatus.textContent = "Connection Error";
    connectionStatus.dataset.state = "offline";
  }
}

createForm.addEventListener("submit", async event => {
  event.preventDefault();
  const pin = createPinInput.value.trim();
  if (!validPin(pin)) {
    setMessage("Use a 4-8 digit Host PIN.", "error");
    return;
  }

  createBtn.disabled = true;
  setMessage("Creating room…");
  try {
    const sessionId = await createUniqueSession();
    await saveHostPin(sessionId, pin);
    createPinInput.value = "";
    await showSession(sessionId);
    setMessage("");
  } catch (error) {
    console.error(error);
    setMessage(error.message || "Could not create the karaoke room.", "error");
    createBtn.disabled = false;
  }
});

unlockForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!activeSessionId) return;
  const pin = unlockPinInput.value.trim();
  if (!validPin(pin)) {
    setUnlockMessage("Use a 4-8 digit PIN.", "error");
    return;
  }

  const record = readPinRecord(activeSessionId);
  if (!record) {
    await saveHostPin(activeSessionId, pin);
    setUnlockMessage("PIN created. Unlocking…", "success");
    await showSession(activeSessionId);
    return;
  }

  const matches = await verifyHostPin(activeSessionId, pin);
  if (!matches) {
    unlockPinInput.select();
    setUnlockMessage("Invalid Host PIN.", "error");
    return;
  }

  setUnlockMessage("");
  await showSession(activeSessionId);
});

forgetRecoveredBtn.addEventListener("click", () => {
  if (!activeSessionId) return;
  const sessionId = activeSessionId;
  const confirmed = window.confirm("Forget this saved room on this browser? This does NOT delete its Firebase data. Use End & Delete Session after unlocking if you want to clean it up.");
  if (!confirmed) return;
  localStorage.removeItem("openKaraokeHostSession");
  localStorage.removeItem(pinStorageKey(sessionId));
  window.location.replace("./host.html");
});

lockHostBtn.addEventListener("click", () => {
  if (!activeSessionId) return;
  showUnlock(activeSessionId, !readPinRecord(activeSessionId));
});

playBtn.addEventListener("click", () => {
  startOrResume().catch(error => {
    console.error(error);
    setPlayerMessage("Could not start playback.", "error");
  });
});

pauseBtn.addEventListener("click", () => {
  pauseCurrent().catch(error => console.error(error));
});

stopBtn.addEventListener("click", () => {
  stopCurrent().catch(error => console.error(error));
});

previousBtn.addEventListener("click", () => {
  playPrevious().catch(error => {
    console.error(error);
    setPlayerMessage("Could not load the previous song.", "error");
  });
});

nextBtn.addEventListener("click", () => {
  advanceToNext("skipped").catch(error => {
    console.error(error);
    setPlayerMessage("Could not skip to the next song.", "error");
  });
});

volumeSlider.addEventListener("input", () => {
  const volume = currentVolume();
  volumeValue.textContent = `${volume}%`;
  localStorage.setItem("openKaraokeVolume", String(volume));
  if (playerReady && player) {
    try {
      if (volume <= 0) player.mute?.();
      else player.unMute?.();
      player.setVolume(volume);
    } catch {}
  }
});

lockReservationsBtn.addEventListener("click", async () => {
  if (!activeSessionId) return;
  lockReservationsBtn.disabled = true;
  try {
    await update(ref(db, `sessions/${activeSessionId}/settings`), {
      reservationsLocked: !reservationsLocked
    });
  } catch (error) {
    console.error(error);
    window.alert("Could not change reservation lock. Check your Firebase rules.");
  } finally {
    lockReservationsBtn.disabled = false;
  }
});

clearQueueBtn.addEventListener("click", async () => {
  if (!activeSessionId) return;
  clearQueueBtn.disabled = true;
  try {
    await clearWaitingQueue();
  } catch (error) {
    console.error(error);
    window.alert("Could not clear the waiting queue.");
  } finally {
    clearQueueBtn.disabled = false;
  }
});

clearHistoryBtn.addEventListener("click", async () => {
  if (!activeSessionId) return;
  clearHistoryBtn.disabled = true;
  try {
    await clearFinishedHistory();
  } catch (error) {
    console.error(error);
    window.alert("Could not clear finished song history.");
  } finally {
    renderHistory();
  }
});

hostQueue.addEventListener("click", async event => {
  const moveButton = event.target.closest("[data-move-song]");
  if (moveButton && activeSessionId) {
    moveButton.disabled = true;
    try {
      await moveWaitingSong(moveButton.dataset.moveSong, moveButton.dataset.direction);
    } catch (error) {
      console.error(error);
      window.alert("Could not reorder that song.");
      moveButton.disabled = false;
    }
    return;
  }

  const removeButton = event.target.closest("[data-remove-song]");
  if (!removeButton || !activeSessionId) return;
  removeButton.disabled = true;
  try {
    await remove(ref(db, `sessions/${activeSessionId}/queue/${removeButton.dataset.removeSong}`));
  } catch (error) {
    console.error(error);
    window.alert("Could not remove that song.");
    removeButton.disabled = false;
  }
});

copyCodeBtn.addEventListener("click", () => copyText(activeSessionId || "", copyCodeBtn));
copyLinkBtn.addEventListener("click", () => copyText(guestLinkInput.value, copyLinkBtn));
endSessionBtn.addEventListener("click", () => endSession());

fullscreenBtn.addEventListener("click", () => {
  toggleTvMode().catch(error => console.error(error));
});

tvQrToggleBtn?.addEventListener("click", toggleQrOverlay);
tvQrCloseBtn?.addEventListener("click", () => setQrOverlay(false));
tvQrBackdrop?.addEventListener("click", () => setQrOverlay(false));
tvExitBtn?.addEventListener("click", () => {
  exitTvMode().catch(error => console.error(error));
});

document.addEventListener("fullscreenchange", () => {
  const fullscreen = Boolean(document.fullscreenElement);
  document.body.classList.toggle("tv-mode", fullscreen);
  fullscreenBtn.textContent = fullscreen ? "⛶ Exit TV" : "📺 TV Mode";
  if (!fullscreen && !document.body.classList.contains("tv-mode")) setQrOverlay(false);
});

document.addEventListener("keydown", event => {
  if (!activeSessionId || sessionPanel.hidden) return;
  const target = event.target;
  const tag = target?.tagName?.toLowerCase?.() || "";
  const typing = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
  if (typing) return;

  const key = event.key.toLowerCase();

  if (event.key === "Escape") {
    if (tvQrOverlay && !tvQrOverlay.hidden) {
      setQrOverlay(false);
      return;
    }
    if (document.body.classList.contains("tv-mode")) {
      exitTvMode().catch(error => console.error(error));
      return;
    }
  }

  if (key === " " || event.code === "Space") {
    event.preventDefault();
    if (currentSong?.playbackState === "playing") {
      pauseCurrent().catch(error => console.error(error));
    } else {
      startOrResume().catch(error => console.error(error));
    }
    return;
  }

  if (key === "n" || event.key === "ArrowRight") {
    event.preventDefault();
    advanceToNext("skipped").catch(error => console.error(error));
    return;
  }

  if (key === "p" || event.key === "ArrowLeft") {
    event.preventDefault();
    playPrevious().catch(error => console.error(error));
    return;
  }

  if (key === "s") {
    event.preventDefault();
    stopCurrent().catch(error => console.error(error));
    return;
  }

  if (key === "q") {
    event.preventDefault();
    toggleQrOverlay();
    return;
  }

  if (key === "f") {
    event.preventDefault();
    toggleTvMode().catch(error => console.error(error));
  }
});

init();

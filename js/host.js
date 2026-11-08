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
const tvThemeSelect = document.querySelector("#tvThemeSelect");
const tvThemeQuickSelect = document.querySelector("#tvThemeQuickSelect");
const fullscreenBtn = document.querySelector("#fullscreenBtn");
const fullModeBtn = document.querySelector("#fullModeBtn");
const scoringToggleBtn = document.querySelector("#scoringToggleBtn");
const tvFullToggleBtn = document.querySelector("#tvFullToggleBtn");
const tvFullNowTitle = document.querySelector("#tvFullNowTitle");
const tvFullNowSinger = document.querySelector("#tvFullNowSinger");
const copyCodeBtn = document.querySelector("#copyCodeBtn");
const copyLinkBtn = document.querySelector("#copyLinkBtn");
const playerCard = document.querySelector(".player-card");
const playerShell = document.querySelector(".player-shell");
const playerEmpty = document.querySelector("#playerEmpty");
const nowPlayingTitle = document.querySelector("#nowPlayingTitle");
const nowPlayingSinger = document.querySelector("#nowPlayingSinger");
const playbackStateEl = document.querySelector("#playbackState");
const nowPlayingTitleMarquee = document.querySelector("#nowPlayingTitleMarquee");
const nowPlayingSingerMarquee = document.querySelector("#nowPlayingSingerMarquee");
const tvRetroBar = document.querySelector("#tvRetroBar");
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
const tvQueueHiddenCount = document.querySelector("#tvQueueHiddenCount");
const tvQrToggleBtn = document.querySelector("#tvQrToggleBtn");
const tvExitBtn = document.querySelector("#tvExitBtn");
const tvQrOverlay = document.querySelector("#tvQrOverlay");
const tvQrBackdrop = document.querySelector("#tvQrBackdrop");
const tvQrCloseBtn = document.querySelector("#tvQrCloseBtn");
const tvQrCode = document.querySelector("#tvQrCode");
const tvQrCornerCode = document.querySelector("#tvQrCornerCode");
const tvQrCornerRoom = document.querySelector("#tvQrCornerRoom");
const tvQrCornerBtn = document.querySelector("#tvQrCornerBtn");
const tvQrSessionCode = document.querySelector("#tvQrSessionCode");
const tvNowSingerPreview = document.querySelector("#tvNowSingerPreview");
const tvNextSingerPreview = document.querySelector("#tvNextSingerPreview");
const tvReactionLayer = document.querySelector("#tvReactionLayer");
const tvDedicationOverlay = document.querySelector("#tvDedicationOverlay");
const tvDedicationText = document.querySelector("#tvDedicationText");
const tvDedicationFrom = document.querySelector("#tvDedicationFrom");
const tvSongIntroOverlay = document.querySelector("#tvSongIntroOverlay");
const tvSongIntroTitle = document.querySelector("#tvSongIntroTitle");
const tvSongIntroSinger = document.querySelector("#tvSongIntroSinger");
const tvScoreOutro = document.querySelector("#tvScoreOutro");
const tvScoreNumber = document.querySelector("#tvScoreNumber");
const tvScoreRating = document.querySelector("#tvScoreRating");
const tvScoreSinger = document.querySelector("#tvScoreSinger");

let db;
let user;
let activeSessionId = null;
const TV_THEME_IDS = new Set(["classic", "neon", "studio", "disco", "ocean", "christmas", "spider", "gold", "pink", "minimal", "maximal", "futuristic", "vector", "collage", "retro", "cyberpunk", "popart", "glass", "clay", "pixel", "editorial", "y2k", "swiss", "surreal", "bohemian", "victorian", "graffiti", "aurora", "handwritten"]);
let activeTvTheme = "classic";
let tvThemeTransitionTimer = null;
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
let unsubscribeControlRequests = null;
let unsubscribeReactions = null;
let processingSingerControls = false;
const handledSingerRequestIds = new Set();
const seenReactionNonces = new Set();
let dedicationOverlayTimer = null;
let lastDedicationSongId = null;
// Song introductions are visual-only: no Firebase writes, playback commands or
// changes to the existing dedication display/timing.
const SONG_INTRO_VISIBLE_MS = 8000;
const SONG_INTRO_FRESH_MS = 12000;
let songIntroWaitTimer = null;
let songIntroHideTimer = null;
let songIntroRequestToken = 0;
let pendingSongIntroId = null;
let lastShownSongIntroId = null;

// Karaoke entertainment scoring: deliberately NOT a microphone/pitch assessment.
// It runs on the Host only; no database writes, permissions, or extra services.
const SCORE_STORAGE_KEY = "openKaraokeHostScoringEnabled";
const SCORE_OUTRO_DURATION_MS = 7600;
const SCORE_COUNT_DURATION_MS = 1800;
let scoringEnabled = (() => {
  try { return localStorage.getItem(SCORE_STORAGE_KEY) !== "false"; }
  catch { return true; }
})();
let activeScoreOutro = null;
const scoredSongIds = new Map();
let scoreAudioContext = null;
const activeScoreEffectMixers = new Set();
// Unlock Web Audio from a real Host interaction so the bass impact is not
// silently blocked when YouTube reaches ENDED much later without a click.
function unlockScoreEffectsAudio() {
  if (!scoringEnabled) return;
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    if (!scoreAudioContext) scoreAudioContext = new Ctor();
    if (scoreAudioContext.state !== "running") scoreAudioContext.resume().catch(() => {});
  } catch {}
}
document.addEventListener("pointerdown", unlockScoreEffectsAudio, { passive: true });
document.addEventListener("keydown", unlockScoreEffectsAudio);
let activeAnnouncerAudio = null;
let activeBassAudio = null;
const SCORE_CUSTOM_BASS_URL = "https://audio.jukehost.co.uk/01a1ba8d-d62e-7177-8838-80264a6d4866";
const SCORE_FEMALE_CLIPS = Object.freeze({
  excellent: "../assets/audio/score-excellent.mp3",
  great: "../assets/audio/score-great.mp3",
  good: "../assets/audio/score-good.mp3",
  keep: "../assets/audio/score-keep.mp3"
});


function renderScoringToggle() {
  if (!scoringToggleBtn) return;
  scoringToggleBtn.setAttribute("aria-pressed", String(scoringEnabled));
  scoringToggleBtn.dataset.enabled = String(scoringEnabled);
  scoringToggleBtn.title = scoringEnabled
    ? "Karaoke scoring ON — click to turn off (entertainment only)"
    : "Karaoke scoring OFF — click to turn on (entertainment only)";
  const state = scoringToggleBtn.querySelector(".scoring-toggle-state");
  if (state) state.textContent = scoringEnabled ? "ON" : "OFF";
}

function pickEntertainmentScore() {
  // Weighted toward positive results; every number is a fun random score,
  // not a claim to have evaluated the singer's voice.
  const roll = Math.random();
  const [low, high] = roll < .12 ? [75, 84]
    : roll < .38 ? [85, 89]
    : roll < .70 ? [90, 94] : [95, 100];
  return low + Math.floor(Math.random() * (high - low + 1));
}

function scoreFeedback(score) {
  // Each spoken line is deliberately short: do NOT read the singer or points aloud.
  if (score >= 95) return {
    label: "EXCELLENT SINGER!",
    message: "Wow! You're an excellent singer!",
    className: "excellent"
  };
  if (score >= 90) return {
    label: "GREAT SINGER!",
    message: "Wow! You're a great singer!",
    className: "great"
  };
  if (score >= 85) return {
    label: "GOOD SINGER!",
    message: "Nice! You're a good singer!",
    className: "good"
  };
  return {
    label: "KEEP SINGING!",
    message: "Keep singing! You did great!",
    className: "keep"
  };
}

function stopScoringAudio() {
  for (const audio of [activeBassAudio, activeAnnouncerAudio]) {
    if (!audio) continue;
    try { audio.pause(); audio.currentTime = 0; audio.removeAttribute("src"); audio.load(); } catch {}
  }
  activeBassAudio = null;
  activeAnnouncerAudio = null;
  for (const mixer of activeScoreEffectMixers) { try { mixer.disconnect(); } catch {} }
  activeScoreEffectMixers.clear();
  try { window.speechSynthesis?.cancel(); } catch {}
}

function cancelScoringOutro() {
  const outro = activeScoreOutro;
  if (!outro) return;
  activeScoreOutro = null;
  for (const timer of ["finishTimer", "speakTimer", "voiceStartTimer", "bassStartTimer", "bassFallbackTimer", "voiceFailTimer", "safetyTimer"]) {
    window.clearTimeout(outro[timer]);
  }
  stopScoringAudio();
  if (outro.countFrame) window.cancelAnimationFrame(outro.countFrame);
  if (tvScoreOutro) {
    tvScoreOutro.classList.remove("is-showing");
    tvScoreOutro.hidden = true;
  }
}

// Original local sound fallback / celebration: bass impact first (only if the
// custom MP3 fails), then bright fanfare BEHIND the female spoken announcement.
function playScoringJingle({ bass = false, fanfare = false } = {}) {
  try {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor || (!bass && !fanfare)) return;
    if (!scoreAudioContext) scoreAudioContext = new AudioCtor();
    if (scoreAudioContext.state !== "running") scoreAudioContext.resume().catch(() => {});
    const ctx = scoreAudioContext;
    const t0 = ctx.currentTime + .04;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -13;
    limiter.knee.value = 5;
    limiter.ratio.value = 4;
    limiter.attack.value = .002;
    limiter.release.value = .18;
    limiter.connect(ctx.destination);
    activeScoreEffectMixers.add(limiter);
    function tone(start, from, to, duration, peak, wave = "sine") {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + duration);
      gain.gain.setValueAtTime(.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(.018, duration / 6));
      gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(limiter);
      oscillator.start(start);
      oscillator.stop(start + duration + .006);
    }
    if (bass) {
      tone(t0, 165, 53, .59, .26);
      tone(t0 + .015, 240, 106, .32, .10, "triangle");
      tone(t0 + .23, 128, 59, .34, .14);
    }
    if (fanfare) {
      // Reduced volume: clearly audible excitement without masking speech.
      [392, 493.88, 587.33, 783.99, 1046.5].forEach((note, i) => {
        const start = t0 + i * .17;
        tone(start, note, note, i === 4 ? .48 : .28, i === 4 ? .065 : .048, "triangle");
        tone(start, note * 2, note * 2, .13, .011);
      });
      // A quiet sustained chord below the voice after the fanfare.
      [392, 493.88, 587.33].forEach((note, i) =>
        tone(t0 + .95 + i * .035, note, note, 1.25, .012, "sine"));
    }
    window.setTimeout(() => {
      try { limiter.disconnect(); } catch {}
      activeScoreEffectMixers.delete(limiter);
    }, 3200);
  } catch (error) {
    console.debug("Karaoke scoring effects unavailable:", error?.message || error);
  }
}

// The bundled voice clips are generated from a US-English *female* voice model
// (CMU SLT), so this stable local audio takes precedence over browser speech.
// Browser voice selection below is used ONLY if the local voice file fails.
function preferredAnnouncerVoice(voices) {
  const femaleUS = /\b(?:jenny|aria|zira|samantha|ava|salli|joanna|kendra|kimberly|nicole|susan|allison|victoria|emma|olivia|female)\b/i;
  const nonFemale = /\b(?:male|david|mark|daniel|george|alex|fred|thomas|guy|ryan|brian|matthew|eric|christopher|james)\b/i;
  return (voices || []).filter(v => /^en-US$/i.test(v.lang || "") &&
    femaleUS.test(v.name || "") && !nonFemale.test(v.name || ""))
    .sort((a,b) => (/neural|natural/i.test(b.name) ? 1 : 0) -
                    (/neural|natural/i.test(a.name) ? 1 : 0))[0] || null;
}

function finishScoringWhenReady(outro) {
  if (activeScoreOutro !== outro || !scoringEnabled) return;
  // Never auto-advance in the middle of a bass MP3 or female announcement.
  if (!outro.baseTimeElapsed || outro.audioPhase !== "done") return;
  if (activeSessionId !== outro.sessionId || String(currentSong?.queueItemId || "") !== outro.songId) return;
  const id = outro.songId;
  cancelScoringOutro();
  advanceToNext("completed", { expectedSongId: id }).catch(error => {
    console.error("Could not start the next song after scoring:", error);
    setPlayerMessage("Score finished. Press Next to continue.", "error");
  });
}

function markScoringVoiceDone(outro) {
  if (activeScoreOutro !== outro) return;
  window.clearTimeout(outro.voiceFailTimer);
  outro.audioPhase = "done";
  finishScoringWhenReady(outro);
}

function announceWithBrowserFemale(outro) {
  if (activeScoreOutro !== outro || !scoringEnabled) return;
  try {
    const synth = window.speechSynthesis;
    const Utterance = window.SpeechSynthesisUtterance;
    const voice = synth && Utterance ? preferredAnnouncerVoice(synth.getVoices?.() || []) : null;
    if (!voice) {
      // Unknown/default voice could be male or use a different accent.
      console.warn("No US-English female announcer voice is available.");
      markScoringVoiceDone(outro);
      return;
    }
    synth.cancel();
    const speech = new Utterance(outro.feedback.message);
    speech.lang = "en-US";
    speech.voice = voice;
    speech.pitch = 1.04;
    speech.rate = 1.13;
    speech.volume = 1;
    let done = false;
    const finish = () => { if (!done) { done = true; markScoringVoiceDone(outro); } };
    speech.onend = finish;
    speech.onerror = finish;
    outro.voiceFailTimer = window.setTimeout(() => { synth.cancel(); finish(); }, 4400);
    synth.speak(speech);
  } catch (error) {
    console.warn("English female speech could not start:", error?.message || error);
    markScoringVoiceDone(outro);
  }
}

function playBundledFemaleAnnouncer(outro) {
  if (activeScoreOutro !== outro || !scoringEnabled) return;
  try {
    const clip = SCORE_FEMALE_CLIPS[outro.feedback.className];
    if (!clip) { announceWithBrowserFemale(outro); return; }
    const audio = new Audio(new URL(clip, import.meta.url).href);
    audio.preload = "auto";
    audio.volume = 1;
    // Keep original English pronunciation, no aggressive pitch shifting.
    audio.playbackRate = 1;
    activeAnnouncerAudio = audio;
    let failed = false;
    const fail = () => {
      if (failed || activeScoreOutro !== outro) return;
      failed = true;
      window.clearTimeout(outro.voiceFailTimer);
      if (activeAnnouncerAudio === audio) activeAnnouncerAudio = null;
      try { audio.pause(); audio.removeAttribute("src"); audio.load(); } catch {}
      announceWithBrowserFemale(outro);
    };
    audio.addEventListener("ended", () => {
      if (activeAnnouncerAudio === audio) activeAnnouncerAudio = null;
      markScoringVoiceDone(outro);
    }, { once:true });
    audio.addEventListener("error", fail, { once:true });
    audio.addEventListener("playing", () => {
      // Once it starts, allow the whole sentence to finish; do not trigger
      // another voice in the middle of an already-playing announcement.
      window.clearTimeout(outro.voiceFailTimer);
      outro.voiceFailTimer = window.setTimeout(() => {
        if (activeScoreOutro !== outro) return;
        try { audio.pause(); } catch {}
        markScoringVoiceDone(outro);
      }, 5500);
    }, { once: true });
    // Do not keep the next song waiting if a local audio file was omitted.
    outro.voiceFailTimer = window.setTimeout(fail, 3700);
    const promise = audio.play();
    promise?.catch?.(fail);
  } catch (error) {
    console.warn("Bundled announcer unavailable:", error?.message || error);
    announceWithBrowserFemale(outro);
  }
}

function startScoringOutroAudio(outro) {
  if (activeScoreOutro !== outro || !scoringEnabled) return;
  outro.audioPhase = "bass";
  const startFanfareAndVoice = () => {
    if (outro.fanfareStarted || activeScoreOutro !== outro || !scoringEnabled) return;
    outro.fanfareStarted = true;
    outro.audioPhase = "voice";
    window.clearTimeout(outro.bassStartTimer);
    window.clearTimeout(outro.bassFallbackTimer);
    playScoringJingle({ fanfare: true });
    outro.speakTimer = window.setTimeout(() => playBundledFemaleAnnouncer(outro), 350);
  };
  let settled = false;
  const useOriginalBassFallback = () => {
    if (settled || activeScoreOutro !== outro) return;
    settled = true;
    window.clearTimeout(outro.bassStartTimer);
    if (activeBassAudio) {
      try { activeBassAudio.pause(); activeBassAudio.removeAttribute("src"); activeBassAudio.load(); } catch {}
      activeBassAudio = null;
    }
    playScoringJingle({ bass: true });
    outro.bassFallbackTimer = window.setTimeout(startFanfareAndVoice, 1050);
  };
  try {
    const audio = new Audio(SCORE_CUSTOM_BASS_URL);
    audio.preload = "auto";
    audio.volume = .94;
    activeBassAudio = audio;
    let started = false;
    audio.addEventListener("playing", () => {
      started = true;
      window.clearTimeout(outro.bassStartTimer);
    }, { once:true });
    audio.addEventListener("ended", () => {
      if (settled || activeScoreOutro !== outro) return;
      settled = true;
      activeBassAudio = null;
      startFanfareAndVoice();
    }, { once:true });
    audio.addEventListener("error", useOriginalBassFallback, { once:true });
    // A streaming bass file must start promptly. If it cannot, never block the
    // scoring results or play a second overlapping bass sound.
    outro.bassStartTimer = window.setTimeout(() => {
      if (!started) useOriginalBassFallback();
    }, 2500);
    // Source may be long / stalled; never hang on a remote audio dependency.
    outro.bassFallbackTimer = window.setTimeout(() => {
      if (!settled && activeScoreOutro === outro) useOriginalBassFallback();
    }, 10000);
    const promise = audio.play();
    promise?.catch?.(useOriginalBassFallback);
  } catch (error) {
    console.warn("Custom score bass unavailable:", error?.message || error);
    useOriginalBassFallback();
  }
}

function beginScoringOutro() {
  if (!activeSessionId || !currentSong?.queueItemId || !scoringEnabled) return false;
  const songId = String(currentSong.queueItemId);
  if (activeScoreOutro) return activeScoreOutro.songId === songId;
  // Repeated YouTube ENDED events or a replay must not regenerate a score.
  if (scoredSongIds.has(songId)) return false;
  const score = pickEntertainmentScore();
  const feedback = scoreFeedback(score);
  const singer = String(currentSong.singerName || "Singer");
  scoredSongIds.set(songId, score);
  const outro = {
    songId, sessionId: activeSessionId, score, feedback, singer,
    finishTimer: null, speakTimer: null, voiceStartTimer: null,
    bassStartTimer: null, bassFallbackTimer: null, voiceFailTimer: null,
    safetyTimer: null, baseTimeElapsed: false, audioPhase: "bass", fanfareStarted: false,
    countFrame: null
  };
  activeScoreOutro = outro;
  // The playback has ended. Keep the old currentSong until the score completes
  // so auto-start cannot jump the queue during the result animation.
  cancelSongIntro();
  if (tvScoreOutro) {
    if (tvScoreNumber) tvScoreNumber.textContent = "0";
    if (tvScoreRating) tvScoreRating.textContent = feedback.label;
    if (tvScoreSinger) tvScoreSinger.textContent = singer;
    tvScoreOutro.dataset.rating = feedback.className;
    tvScoreOutro.hidden = false;
    tvScoreOutro.classList.remove("is-showing");
    void tvScoreOutro.offsetWidth;
    tvScoreOutro.classList.add("is-showing");
  }
  const started = performance.now();
  const count = now => {
    if (activeScoreOutro !== outro) return;
    const progress = Math.min(1, (now - started) / SCORE_COUNT_DURATION_MS);
    const eased = 1 - Math.pow(1 - progress, 3);
    if (tvScoreNumber) tvScoreNumber.textContent = String(Math.round(score * eased));
    if (progress < 1) outro.countFrame = window.requestAnimationFrame(count);
    else outro.countFrame = null;
  };
  outro.countFrame = window.requestAnimationFrame(count);
  startScoringOutroAudio(outro);
  outro.finishTimer = window.setTimeout(() => {
    if (activeScoreOutro !== outro) return;
    outro.baseTimeElapsed = true;
    finishScoringWhenReady(outro);
  }, SCORE_OUTRO_DURATION_MS);
  // Network audio must never hold a karaoke room indefinitely.
  outro.safetyTimer = window.setTimeout(() => {
    if (activeScoreOutro !== outro) return;
    stopScoringAudio();
    outro.audioPhase = "done";
    outro.baseTimeElapsed = true;
    finishScoringWhenReady(outro);
  }, 16500);
  return true;
}

function setScoringEnabled(enabled) {
  scoringEnabled = Boolean(enabled);
  try { localStorage.setItem(SCORE_STORAGE_KEY, String(scoringEnabled)); } catch {}
  renderScoringToggle();
  // Switching off during a result immediately finishes the naturally ended
  // song instead of leaving guests waiting for the rest of the outro.
  if (!scoringEnabled && activeScoreOutro) {
    const id = activeScoreOutro.songId;
    cancelScoringOutro();
    advanceToNext("completed", { expectedSongId: id }).catch(error => {
      console.error(error);
      setPlayerMessage("Press Next to continue.", "error");
    });
  }
}

let autoStartTimer = null;
let autoStartInFlight = false;

// Guest Watch uses timestamped playback snapshots. Guests project the current
// position locally between snapshots, while a precision 1-second heartbeat
// corrects for real Host-side buffering and device drift.
// Precision Watch sync: the heartbeat corrects for real Host-side
// buffering, while capturedAt timestamps the exact player position sample
// using Firebase's server clock offset. Guests interpolate between snapshots.
const PLAYBACK_SYNC_INTERVAL_MS = 1000;
let playbackSyncTimer = null;
let playbackSyncWriteInFlight = false;
let playbackSyncPending = null;
let playbackSyncRevision = 0;
let hostServerTimeOffsetMs = 0;
let hostServerTimeOffsetReady = false;
let unsubscribeServerTimeOffset = null;

function hostServerNowMs() {
  return Date.now() + Number(hostServerTimeOffsetMs || 0);
}

const DEFAULT_AMBILIGHT_COLORS = [
  "rgba(139, 92, 246, .46)",
  "rgba(34, 211, 238, .34)",
  "rgba(236, 72, 153, .30)",
  "rgba(251, 191, 36, .22)"
];
let ambilightLoadToken = 0;

function hslToCss(h, s, l, a = 0.4) {
  return `hsla(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%, ${a})`;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = 60 * (((g - b) / delta) % 6); break;
      case g: h = 60 * (((b - r) / delta) + 2); break;
      default: h = 60 * (((r - g) / delta) + 4); break;
    }
  }

  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

function paletteFromSeed(seed = "") {
  const value = Array.from(String(seed)).reduce((acc, char) => ((acc * 33) + char.charCodeAt(0)) >>> 0, 7);
  const hue = value % 360;
  return [
    hslToCss(hue, 88, 63, 0.46),
    hslToCss((hue + 48) % 360, 84, 58, 0.34),
    hslToCss((hue + 210) % 360, 80, 60, 0.30),
    hslToCss((hue + 300) % 360, 78, 54, 0.22)
  ];
}

function setAmbilightPalette(colors = DEFAULT_AMBILIGHT_COLORS, state = "idle") {
  if (!playerShell) return;
  const palette = [...colors, ...DEFAULT_AMBILIGHT_COLORS].slice(0, 4);
  playerShell.style.setProperty("--amb1", palette[0]);
  playerShell.style.setProperty("--amb2", palette[1]);
  playerShell.style.setProperty("--amb3", palette[2]);
  playerShell.style.setProperty("--amb4", palette[3]);
  playerShell.dataset.ambientState = state;
}

function loadPaletteImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.referrerPolicy = "no-referrer";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Thumbnail could not be loaded."));
    image.src = src;
  });
}

function pickDistinctColors(hslColors) {
  const selected = [];
  for (const item of hslColors) {
    const uniqueEnough = selected.every(choice => {
      const hueDelta = Math.min(Math.abs(choice.h - item.h), 360 - Math.abs(choice.h - item.h));
      return hueDelta > 22 || Math.abs(choice.l - item.l) > 16;
    });
    if (uniqueEnough) selected.push(item);
    if (selected.length === 4) break;
  }
  return selected;
}

async function extractThumbnailPalette(src) {
  const image = await loadPaletteImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const buckets = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 180) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (brightness < 18) continue;

    const qr = Math.min(255, Math.round(r / 32) * 32);
    const qg = Math.min(255, Math.round(g / 32) * 32);
    const qb = Math.min(255, Math.round(b / 32) * 32);
    const key = `${qr},${qg},${qb}`;
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0, score: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
    bucket.score += 1 + saturation * 2.2 + brightness / 255;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()]
    .filter(bucket => bucket.count > 0)
    .map(bucket => {
      const r = bucket.r / bucket.count;
      const g = bucket.g / bucket.count;
      const b = bucket.b / bucket.count;
      return {
        ...rgbToHsl(r, g, b),
        score: bucket.score
      };
    })
    .sort((a, b) => b.score - a.score);

  const chosen = pickDistinctColors(ranked);
  if (!chosen.length) return [];

  const a = chosen[0];
  const b = chosen[1] || chosen[0];
  const c = chosen[2] || chosen[0];
  const d = chosen[3] || chosen[1] || chosen[0];

  return [
    hslToCss(a.h, Math.min(100, a.s + 12), Math.min(82, a.l + 10), 0.50),
    hslToCss(b.h, Math.min(100, b.s + 12), Math.min(80, b.l + 8), 0.36),
    hslToCss(c.h, Math.min(100, c.s + 10), Math.min(78, c.l + 8), 0.31),
    hslToCss(d.h, Math.min(100, d.s + 8), Math.min(76, d.l + 10), 0.24)
  ];
}

async function updateAmbilightForSong(song) {
  const token = ++ambilightLoadToken;

  if (!song) {
    setAmbilightPalette(DEFAULT_AMBILIGHT_COLORS, "idle");
    return;
  }

  const fallback = paletteFromSeed(`${song.youtubeVideoId || ""}|${song.title || ""}`);
  setAmbilightPalette(fallback, "active");

  if (!song.thumbnail) return;

  try {
    const palette = await extractThumbnailPalette(song.thumbnail);
    if (token !== ambilightLoadToken || !palette.length) return;
    setAmbilightPalette(palette, "active");
  } catch (error) {
    console.debug("Ambilight palette fallback:", error?.message || error);
  }
}

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

function normalizeTvTheme(value) {
  return TV_THEME_IDS.has(value) ? value : "classic";
}

function savedTvTheme() {
  return normalizeTvTheme(localStorage.getItem("openKaraokeTvTheme") || "classic");
}

function applyTvTheme(theme) {
  const normalized = normalizeTvTheme(theme);
  const changed = normalized !== activeTvTheme;
  activeTvTheme = normalized;
  document.body.dataset.tvTheme = normalized;
  if (tvThemeSelect && tvThemeSelect.value !== normalized) tvThemeSelect.value = normalized;
  if (tvThemeQuickSelect && tvThemeQuickSelect.value !== normalized) tvThemeQuickSelect.value = normalized;
  localStorage.setItem("openKaraokeTvTheme", normalized);

  if (changed && document.body.classList.contains("tv-mode")) {
    document.body.classList.remove("tv-theme-switching");
    void document.body.offsetWidth;
    document.body.classList.add("tv-theme-switching");
    window.clearTimeout(tvThemeTransitionTimer);
    tvThemeTransitionTimer = window.setTimeout(() => {
      document.body.classList.remove("tv-theme-switching");
    }, 620);
  }
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
          reservationsLocked: false,
          tvTheme: savedTvTheme()
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
  url.searchParams.set("v", "20260910-precision-sync1");
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
  const entries = Object.entries(guests || {}).filter(([, guest]) => guest?.online === true);
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

function renderSingerPreview() {
  const waiting = waitingEntries();
  if (tvNowSingerPreview) tvNowSingerPreview.textContent = currentSong?.singerName || "—";
  if (tvNextSingerPreview) tvNextSingerPreview.textContent = waiting[0]?.[1]?.singerName || "Waiting…";
}

function showTvReaction(reaction) {
  if (!tvReactionLayer || !document.body.classList.contains("tv-mode")) return;
  const emoji = String(reaction?.emoji || "");
  if (!["👏", "❤️", "🔥", "🎤", "😂"].includes(emoji)) return;
  // A single authenticated, rate-limited RTDB reaction produces a visual
  // cluster. No schema changes or extra writes: multiple guests can overlap.
  const singerName = String(reaction?.singerName || "Guest");
  const count = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 5;
  const clusterX = 13 + Math.random() * 74;
  for (let index = 0; index < count; index += 1) {
    window.setTimeout(() => {
      if (!tvReactionLayer || !document.body.classList.contains("tv-mode")) return;
      const item = document.createElement("span");
      item.className = "tv-floating-reaction";
      item.style.setProperty("--reaction-x", `${Math.max(7, Math.min(93, clusterX + (Math.random() - .5) * 18))}%`);
      item.style.setProperty("--reaction-shift", `${Math.round((Math.random() - .5) * 170)}px`);
      item.style.setProperty("--reaction-tilt", `${Math.round((Math.random() - .5) * 36)}deg`);
      item.style.setProperty("--reaction-duration", `${(2.6 + Math.random() * 1.1).toFixed(2)}s`);
      // Show the singer label only on the first emoji to avoid visual clutter.
      item.innerHTML = `<b>${escapeHtml(emoji)}</b>${index === 0 ? `<small>${escapeHtml(singerName)}</small>` : ""}`;
      tvReactionLayer.appendChild(item);
      while (tvReactionLayer.children.length > 35) tvReactionLayer.firstElementChild?.remove();
      window.setTimeout(() => item.remove(), 4100);
    }, index * 115);
  }
}

function processReactionSnapshot(value) {
  const now = hostServerNowMs();
  Object.values(value || {}).forEach(reaction => {
    const nonce = String(reaction?.nonce || "");
    const createdAt = Number(reaction?.createdAt || 0);
    if (!nonce || seenReactionNonces.has(nonce)) return;
    seenReactionNonces.add(nonce);
    if (createdAt && Math.abs(now - createdAt) <= 6500) showTvReaction(reaction);
  });
  if (seenReactionNonces.size > 500) seenReactionNonces.clear();
}

function showDedicationForSong(song) {
  if (!tvDedicationOverlay || !song?.queueItemId || !document.body.classList.contains("tv-mode")) return;
  const songId = String(song.queueItemId);
  if (lastDedicationSongId === songId) return;
  const dedication = String(song.dedication || "").trim();
  if (!dedication) return;
  const startedAt = Number(song.startedAt || 0);
  if (startedAt && hostServerTimeOffsetReady && hostServerNowMs() - startedAt > 10000) return;
  lastDedicationSongId = songId;
  window.clearTimeout(dedicationOverlayTimer);
  if (tvDedicationText) tvDedicationText.textContent = dedication;
  if (tvDedicationFrom) tvDedicationFrom.textContent = `— from ${song.singerName || "Guest"}`;
  tvDedicationOverlay.hidden = false;
  tvDedicationOverlay.classList.remove("is-showing");
  void tvDedicationOverlay.offsetWidth;
  tvDedicationOverlay.classList.add("is-showing");
  dedicationOverlayTimer = window.setTimeout(() => {
    tvDedicationOverlay.classList.remove("is-showing");
    window.setTimeout(() => { if (tvDedicationOverlay) tvDedicationOverlay.hidden = true; }, 260);
  }, 2800);
}

// A brief karaoke-style text-only overlay. It never pauses or delays YouTube.
// The dedication overlay is left unchanged; if one is visible, the song intro
// waits for its original auto-hide so the two presentations never overlap.
function cancelSongIntro() {
  songIntroRequestToken += 1;
  window.clearTimeout(songIntroWaitTimer);
  window.clearTimeout(songIntroHideTimer);
  songIntroWaitTimer = null;
  songIntroHideTimer = null;
  pendingSongIntroId = null;
  if (tvSongIntroOverlay) {
    tvSongIntroOverlay.classList.remove("is-showing");
    tvSongIntroOverlay.hidden = true;
  }
}

function queueSongIntro(song) {
  if (!tvSongIntroOverlay || !song?.queueItemId || !document.body.classList.contains("tv-mode")) return;
  const songId = String(song.queueItemId);
  if (songId === pendingSongIntroId || songId === lastShownSongIntroId) return;

  // On host recovery or entering TV mid-song, do not flash an old title.
  const startedAt = Number(song.startedAt || 0);
  if (startedAt && hostServerTimeOffsetReady && hostServerNowMs() - startedAt > SONG_INTRO_FRESH_MS) return;

  cancelSongIntro();
  pendingSongIntroId = songId;
  const requestToken = songIntroRequestToken;
  const title = String(song.title || "Untitled song").trim() || "Untitled song";
  const singer = String(song.singerName || "Guest").trim() || "Guest";
  if (tvSongIntroTitle) tvSongIntroTitle.textContent = title;
  if (tvSongIntroSinger) tvSongIntroSinger.textContent = singer;
  const characters = Array.from(title).length;
  tvSongIntroOverlay.dataset.titleLength = characters > 88 ? "very-long" : characters > 48 ? "long" : "normal";

  const queuedAt = Date.now();
  function revealWhenReady() {
    if (requestToken !== songIntroRequestToken ||
        !document.body.classList.contains("tv-mode") ||
        String(currentSong?.queueItemId || "") !== songId) return;

    // Wait for the original dedication to auto-hide AND for YouTube to
    // actually enter PLAYING. Neither condition changes/pauses playback.
    const dedicationVisible = Boolean(tvDedicationOverlay && !tvDedicationOverlay.hidden);
    let videoPlaying = false;
    try {
      videoPlaying = Boolean(playerReady && player && window.YT?.PlayerState &&
        player.getPlayerState() === window.YT.PlayerState.PLAYING);
    } catch {}
    if (dedicationVisible || !videoPlaying) {
      if (Date.now() - queuedAt < SONG_INTRO_FRESH_MS) {
        songIntroWaitTimer = window.setTimeout(revealWhenReady, 90);
      } else {
        // Avoid covering an unfinished dedication or announcing a stale song.
        pendingSongIntroId = null;
        lastShownSongIntroId = songId;
      }
      return;
    }
    pendingSongIntroId = null;
    lastShownSongIntroId = songId;
    tvSongIntroOverlay.hidden = false;
    tvSongIntroOverlay.classList.remove("is-showing");
    void tvSongIntroOverlay.offsetWidth;
    tvSongIntroOverlay.classList.add("is-showing");
    songIntroHideTimer = window.setTimeout(() => {
      if (requestToken !== songIntroRequestToken) return;
      tvSongIntroOverlay.classList.remove("is-showing");
      tvSongIntroOverlay.hidden = true;
      songIntroHideTimer = null;
    }, SONG_INTRO_VISIBLE_MS);
  }
  songIntroWaitTimer = window.setTimeout(revealWhenReady, 0);
}

// Only Full Mode needs a readable marquee: rather than hiding long titles,
// slowly pan the title text *inside* its compact reserved space.
let fullModeTitleFrame = 0;
let fullModeQueueTimer = null;
let fullModeCounterFrame = 0;
let fullModeOverflowDirty = true;
// The +N badge counts songs still to the RIGHT of the visible queue viewport.
// It takes its own tiny grid slot; no queue card or video gets covered.
function updateFullModeRemainingCount() {
  if (!tvQueueStrip || !tvQueueHiddenCount) return;
  const area = tvQueueStrip.closest(".tv-up-next-area");
  const full = document.body.classList.contains("tv-full-mode");
  const cards = tvQueueStrip.querySelectorAll(".tv-queue-card");
  if (!full || !cards.length) {
    area?.classList.remove("tv-has-remaining");
    tvQueueHiddenCount.hidden = true;
    tvQueueHiddenCount.textContent = "";
    return;
  }

  // First measure at the original width; only reserve badge space when
  // some reservation cannot fit. Keeps the same number of cards otherwise.
  if (fullModeOverflowDirty) {
    // Recheck whether the queue overflows only when contents or window size
    // change. Never resize the grid every time the song strip scrolls.
    area?.classList.remove("tv-has-remaining");
    const overflow = tvQueueStrip.scrollWidth > tvQueueStrip.clientWidth + 2;
    if (overflow) area?.classList.add("tv-has-remaining");
    fullModeOverflowDirty = false;
  }
  if (!area?.classList.contains("tv-has-remaining")) {
    tvQueueHiddenCount.hidden = true;
    tvQueueHiddenCount.textContent = "";
    return;
  }
  const rightEdge = tvQueueStrip.getBoundingClientRect().right;
  let hiddenToRight = 0;
  cards.forEach(card => {
    if (card.getBoundingClientRect().right > rightEdge + 1) hiddenToRight += 1;
  });
  tvQueueHiddenCount.hidden = hiddenToRight === 0;
  tvQueueHiddenCount.textContent = hiddenToRight ? `+${hiddenToRight}` : "";
  tvQueueHiddenCount.title = hiddenToRight ? `${hiddenToRight} more upcoming song${hiddenToRight === 1 ? "" : "s"}` : "";
  tvQueueHiddenCount.setAttribute("aria-label", tvQueueHiddenCount.title || "No more upcoming songs to the right");
}
function scheduleFullModeRemainingCount(reflow = false) {
  if (reflow === true) fullModeOverflowDirty = true;
  if (fullModeCounterFrame) cancelAnimationFrame(fullModeCounterFrame);
  fullModeCounterFrame = requestAnimationFrame(() => {
    fullModeCounterFrame = 0;
    updateFullModeRemainingCount();
  });
}
tvQueueStrip?.addEventListener("scroll", scheduleFullModeRemainingCount, { passive: true });
window.addEventListener("resize", () => scheduleFullModeRemainingCount(true));
function scheduleFullModeTitleRefresh() {
  if (fullModeTitleFrame) cancelAnimationFrame(fullModeTitleFrame);
  fullModeTitleFrame = requestAnimationFrame(() => {
    fullModeTitleFrame = 0;
    if (!document.body.classList.contains("tv-full-mode")) return;
    document.querySelectorAll(".tv-full-song strong, .tv-queue-text strong").forEach(viewport => {
      const inner = viewport.querySelector(".tv-full-title-inner");
      if (!inner) return;
      viewport.classList.remove("is-scrolling");
      const distance = Math.ceil(inner.scrollWidth - viewport.clientWidth);
      if (distance > 4) {
        inner.style.setProperty("--tv-title-travel", `${distance + 3}px`);
        inner.style.setProperty("--tv-title-duration", `${Math.max(10, Math.min(28, 8 + distance / 24)).toFixed(1)}s`);
        viewport.classList.add("is-scrolling");
      }
    });
  });
}
function stopFullModeQueueRotation() {
  if (fullModeQueueTimer) clearInterval(fullModeQueueTimer);
  fullModeQueueTimer = null;
}
function startFullModeQueueRotation() {
  stopFullModeQueueRotation();
  fullModeQueueTimer = window.setInterval(() => {
    if (!document.body.classList.contains("tv-full-mode") || document.hidden || !tvQueueStrip) return;
    const maxLeft = tvQueueStrip.scrollWidth - tvQueueStrip.clientWidth;
    if (maxLeft < 8) return;
    const firstCard = tvQueueStrip.querySelector(".tv-queue-card");
    const cardStep = (firstCard?.getBoundingClientRect().width || 120) + 6;
    const next = tvQueueStrip.scrollLeft + (cardStep * 2);
    tvQueueStrip.scrollTo({ left: next > maxLeft - 6 ? 0 : Math.min(next, maxLeft), behavior: "smooth" });
  }, 9500);
}
window.addEventListener("resize", scheduleFullModeTitleRefresh);

function renderTvQueueStrip() {
  if (!tvQueueStrip) return;
  const waiting = waitingEntries();
  renderSingerPreview();

  if (!waiting.length) {
    tvQueueStrip.innerHTML = `<span class="tv-queue-empty">${currentSong ? "Waiting for more reservations…" : "Reserve a song — the first one starts automatically."}</span>`;
    scheduleFullModeRemainingCount(true);
    return;
  }

  // Full Mode rotates all upcoming reservations, while Standard TV Mode
  // retains its original 7-card presentation and +more summary.
  const inFullMode = document.body.classList.contains("tv-full-mode");
  const visible = inFullMode ? waiting : waiting.slice(0, 7);
  const extra = waiting.length - visible.length;
  tvQueueStrip.innerHTML = visible.map(([, item], index) => `
    <div class="tv-queue-card" title="${escapeHtml(item.title)} — ${escapeHtml(item.singerName)}">
      <span class="tv-queue-number">${index + 1}</span>
      <img src="${escapeHtml(item.thumbnail)}" alt="" loading="lazy">
      <span class="tv-queue-text">
        <strong><span class="tv-full-title-inner">${escapeHtml(item.title)}</span></strong>
        <small>👤 ${escapeHtml(item.singerName)}</small>
      </span>
      <span class="tv-full-singer-badge" title="Reserved by ${escapeHtml(item.singerName)}" aria-label="Reserved by ${escapeHtml(item.singerName)}">🎤 ${escapeHtml(item.singerName)}</span>
    </div>
  `).join("") + (extra > 0 ? `<span class="tv-queue-more">+${extra} more</span>` : "");
  scheduleFullModeTitleRefresh();
  scheduleFullModeRemainingCount(true);
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
        ${item.dedication ? `<small class="song-dedication">💬 ${escapeHtml(item.dedication)}</small>` : ""}
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

function updateTvMarquee(container, textElement) {
  if (!container || !textElement) return;

  container.classList.remove("is-scrolling");
  container.style.removeProperty("--marquee-distance");
  container.style.removeProperty("--marquee-duration");

  requestAnimationFrame(() => {
    const overflow = Math.max(0, textElement.scrollWidth - container.clientWidth);
    if (overflow <= 12) return;

    const distance = Math.ceil(overflow + 18);
    const duration = Math.min(18, Math.max(8, 7 + (distance / 55)));
    container.style.setProperty("--marquee-distance", `${distance}px`);
    container.style.setProperty("--marquee-duration", `${duration.toFixed(1)}s`);
    container.classList.add("is-scrolling");
  });
}

function refreshTvMarquees() {
  updateTvMarquee(nowPlayingTitleMarquee, nowPlayingTitle);
  updateTvMarquee(nowPlayingSingerMarquee, nowPlayingSinger);
}

function scheduleTvMarqueeRefresh() {
  requestAnimationFrame(() => requestAnimationFrame(refreshTvMarquees));
}

function renderPlaybackState(state) {
  const normalized = ["playing", "paused", "stopped", "error"].includes(state) ? state : "idle";
  playbackStateEl.dataset.state = normalized;
  playbackStateEl.textContent = normalized.toUpperCase();
  playerCard?.setAttribute("data-playback", normalized);
  tvRetroBar?.setAttribute("data-playback", normalized);
}

function safePlayerNumber(methodName, fallback = 0) {
  if (!playerReady || !player || typeof player?.[methodName] !== "function") return fallback;
  try {
    const value = Number(player[methodName]());
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

async function publishPlaybackSync({ state = null, clear = false } = {}) {
  if (!db || !activeSessionId) return;

  // Never drop a pause/stop/song-change update just because a heartbeat is
  // still in flight. Keep only the newest pending snapshot and publish it next.
  if (playbackSyncWriteInFlight) {
    playbackSyncPending = { state, clear };
    return;
  }

  const syncRef = ref(db, `sessions/${activeSessionId}/playbackSync`);
  playbackSyncWriteInFlight = true;
  try {
    if (clear || !currentSong?.youtubeVideoId) {
      await remove(syncRef);
      return;
    }

    const normalizedState = ["playing", "paused", "stopped", "error"].includes(state)
      ? state
      : (["playing", "paused", "stopped", "error"].includes(currentSong.playbackState) ? currentSong.playbackState : "playing");
    // Capture the player time and its server-clock timestamp together before
    // the network write begins. This removes the old bias where `position` was
    // sampled first but `updatedAt` represented the later Firebase commit time.
    const position = Math.max(0, safePlayerNumber("getCurrentTime", 0));
    const capturedAt = hostServerTimeOffsetReady ? Math.round(hostServerNowMs()) : null;
    const duration = Math.max(0, safePlayerNumber("getDuration", 0));
    const rate = Math.max(0.25, safePlayerNumber("getPlaybackRate", 1) || 1);
    playbackSyncRevision += 1;

    await update(syncRef, {
      queueItemId: String(currentSong.queueItemId || ""),
      videoId: String(currentSong.youtubeVideoId || ""),
      position: Math.round(position * 1000) / 1000,
      duration: Math.round(duration * 1000) / 1000,
      state: normalizedState,
      rate,
      revision: playbackSyncRevision,
      capturedAt,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.debug("Playback sync heartbeat skipped:", error?.message || error);
  } finally {
    playbackSyncWriteInFlight = false;
    const pending = playbackSyncPending;
    playbackSyncPending = null;
    if (pending && activeSessionId) {
      window.setTimeout(() => publishPlaybackSync(pending).catch(() => {}), 20);
    }
  }
}

function startPlaybackSyncHeartbeat() {
  if (playbackSyncTimer) return;
  playbackSyncTimer = window.setInterval(() => {
    if (!activeSessionId || !currentSong || currentSong.playbackState !== "playing" || activeScoreOutro) return;
    publishPlaybackSync({ state: "playing" }).catch(() => {});
  }, PLAYBACK_SYNC_INTERVAL_MS);
}

function stopPlaybackSyncHeartbeat() {
  if (!playbackSyncTimer) return;
  window.clearInterval(playbackSyncTimer);
  playbackSyncTimer = null;
}

function renderCurrentSong(song) {
  const previousSongId = String(currentSong?.queueItemId || "");
  const incomingSongId = String(song?.queueItemId || "");
  if (previousSongId !== incomingSongId) {
    cancelSongIntro();
    cancelScoringOutro();
  }
  currentSong = song || null;
  showPlayerError("");
  renderTvQueueStrip();
  // The optional Full Mode has its own compact title in the top overlay;
  // original TV footer values and playback data are unchanged.
  if (tvFullNowTitle) {
    const title = currentSong?.title || "Waiting for a song…";
    const inner = tvFullNowTitle.querySelector(".tv-full-title-inner");
    if (inner) inner.textContent = title;
    else tvFullNowTitle.textContent = title;
    tvFullNowTitle.title = title;
  }
  if (tvFullNowSinger) {
    const singer = currentSong?.singerName || "Waiting…";
    tvFullNowSinger.textContent = `🎤 ${singer}`;
    tvFullNowSinger.title = currentSong ? `Reserved by ${singer}` : "Waiting for singer";
  }
  scheduleFullModeTitleRefresh();

  if (!currentSong) {
    nowPlayingTitle.textContent = "Waiting for a song…";
    nowPlayingTitle.title = "Waiting for a song…";
    nowPlayingSinger.textContent = "Waiting for singer…";
    nowPlayingSinger.title = "Waiting for singer…";
    scheduleTvMarqueeRefresh();
    playerEmpty.hidden = false;
    renderPlaybackState("idle");
    updateAmbilightForSong(null);
    renderSingerPreview();
    renderHistory();
    return;
  }

  const nextTitle = currentSong.title || "Untitled song";
  const nextSinger = currentSong.singerName || "Guest";
  nowPlayingTitle.textContent = nextTitle;
  nowPlayingTitle.title = nextTitle;
  nowPlayingSinger.textContent = nextSinger;
  nowPlayingSinger.title = nextSinger;
  scheduleTvMarqueeRefresh();
  playerEmpty.hidden = true;
  renderPlaybackState(currentSong.playbackState || "playing");
  updateAmbilightForSong(currentSong);
  renderSingerPreview();
  showDedicationForSong(currentSong);
  queueSongIntro(currentSong);
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
  unsubscribeSettings = onValue(ref(db, `sessions/${sessionId}/settings`), snapshot => {
    const settings = snapshot.val() || {};
    renderReservationState(settings.reservationsLocked === true);
    applyTvTheme(settings.tvTheme || savedTvTheme());
  });
}

function watchCurrentSong(sessionId) {
  unsubscribeCurrentSong?.();
  unsubscribeCurrentSong = onValue(ref(db, `sessions/${sessionId}/currentSong`), snapshot => {
    const nextCurrent = snapshot.val();
    const previousVideoId = currentSong?.youtubeVideoId || null;
    renderCurrentSong(nextCurrent);
    syncPlayerToFirebase(previousVideoId).catch(error => console.error(error));

    if (!nextCurrent) {
      publishPlaybackSync({ clear: true }).catch(() => {});
    } else {
      window.setTimeout(() => publishPlaybackSync({ state: nextCurrent.playbackState || "playing" }).catch(() => {}), 320);
    }
  });
}

function flattenSingerControlRequests(value) {
  const requests = [];
  Object.entries(value || {}).forEach(([guestUid, guestRequests]) => {
    Object.entries(guestRequests || {}).forEach(([requestKey, request]) => {
      if (!request || typeof request !== "object") return;
      requests.push({ guestUid, requestKey, ...request });
    });
  });
  return requests.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
}

async function processSingerControlRequests(value) {
  if (processingSingerControls || !activeSessionId) return;
  processingSingerControls = true;
  try {
    const requests = flattenSingerControlRequests(value);
    for (const request of requests) {
      const requestPath = `sessions/${activeSessionId}/controlRequests/${request.guestUid}/${request.requestKey}`;
      const requestRef = ref(db, requestPath);
      const requestId = String(request.requestId || request.requestKey);

      if (handledSingerRequestIds.has(requestId)) {
        try { await remove(requestRef); } catch {}
        continue;
      }

      const stillOwnsSong = Boolean(
        currentSong &&
        currentSong.guestId === request.guestUid &&
        currentSong.queueItemId === request.queueItemId
      );

      if (!stillOwnsSong || !["play", "pause", "skip"].includes(request.action)) {
        try { await remove(requestRef); } catch {}
        continue;
      }

      handledSingerRequestIds.add(requestId);
      try {
        if (request.action === "play") {
          await startOrResume();
        } else if (request.action === "pause") {
          await pauseCurrent();
        } else if (request.action === "skip") {
          await advanceToNext("skipped");
        }
      } catch (error) {
        console.error("Singer control request failed:", error);
      } finally {
        try { await remove(requestRef); } catch (error) { console.warn("Could not clear singer control request", error); }
      }
    }

    if (handledSingerRequestIds.size > 200) handledSingerRequestIds.clear();
  } finally {
    processingSingerControls = false;
  }
}

function watchSingerControls(sessionId) {
  unsubscribeControlRequests?.();
  unsubscribeControlRequests = onValue(ref(db, `sessions/${sessionId}/controlRequests`), snapshot => {
    processSingerControlRequests(snapshot.val()).catch(error => console.error(error));
  });
}

function watchReactions(sessionId) {
  unsubscribeReactions?.();
  unsubscribeReactions = onValue(ref(db, `sessions/${sessionId}/reactions`), snapshot => {
    processReactionSnapshot(snapshot.val());
  }, error => console.debug("Reaction listener paused:", error?.message || error));
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
        startPlaybackSyncHeartbeat();
        window.setTimeout(() => publishPlaybackSync({ state: currentSong?.playbackState || "playing" }).catch(() => {}), 350);
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
    // State transitions are pushed immediately; the precision heartbeat
    // maintains sub-second drift correction while a song is actively playing.
    await publishPlaybackSync({ state });
  } catch (error) {
    console.error(error);
  }
}

function handlePlayerStateChange(event) {
  if (!window.YT || !currentSong) return;
  const state = event.data;

  if (state === window.YT.PlayerState.ENDED) {
    if (Date.now() < suppressPlayerEventsUntil || activeScoreOutro) return;
    // ONLY a natural YouTube end triggers scoring, never Host/Guest Skip or Next.
    if (beginScoringOutro()) return;
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
    else publishPlaybackSync({ state: "playing" }).catch(() => {});
  } else if (state === window.YT.PlayerState.PAUSED) {
    renderPlaybackState("paused");
    if (currentSong.playbackState !== "paused") updateCurrentPlaybackState("paused");
    else publishPlaybackSync({ state: "paused" }).catch(() => {});
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

async function advanceToNext(finalStatus = "skipped", { expectedSongId = null } = {}) {
  if (!activeSessionId || advancing) return;
  if (expectedSongId && String(currentSong?.queueItemId || "") !== expectedSongId) return;
  // A real Next/Skip always wins over the result; it never displays a score.
  cancelScoringOutro();
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
      dedication: String(nextItem.dedication || "").slice(0, 80),
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
  cancelScoringOutro();
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
  cancelScoringOutro();
  if (!currentSong) return;
  if (playerReady && player) player.pauseVideo();
  await updateCurrentPlaybackState("paused");
}

async function stopCurrent() {
  cancelScoringOutro();
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
  cancelScoringOutro();
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
      dedication: String(previousItem.dedication || "").slice(0, 80),
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
  if (tvQrCornerCode) renderQrCode(tvQrCornerCode, guestUrl);
  if (tvQrCornerRoom) tvQrCornerRoom.textContent = sessionId.replace(/^KARAOKE-/, "");
  if (tvQrSessionCode) tvQrSessionCode.textContent = sessionId;
  createPanel.hidden = true;
  unlockPanel.hidden = true;
  sessionPanel.hidden = false;
  fullscreenBtn.hidden = false;
  if (fullModeBtn) fullModeBtn.hidden = false;
  if (scoringToggleBtn) scoringToggleBtn.hidden = false;
  renderScoringToggle();
  localStorage.setItem("openKaraokeHostSession", sessionId);
  watchGuests(sessionId);
  watchQueue(sessionId);
  watchSettings(sessionId);
  watchCurrentSong(sessionId);
  watchSingerControls(sessionId);
  watchReactions(sessionId);
  await setupHostPresence(sessionId);
  await ensurePlayer();
  startPlaybackSyncHeartbeat();
}

function showUnlock(sessionId, migration = false) {
  cancelSongIntro();
  cancelScoringOutro();
  activeSessionId = sessionId;
  createPanel.hidden = true;
  sessionPanel.hidden = true;
  fullscreenBtn.hidden = true;
  if (fullModeBtn) fullModeBtn.hidden = true;
  if (scoringToggleBtn) scoringToggleBtn.hidden = true;
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

// Keep presentation shortcuts in the Host document, not the YouTube iframe.
// Cross-origin iframes do not forward keyboard events to the parent page.
function focusTvShortcuts() {
  if (!document.body.classList.contains("tv-mode")) return;
  document.body.tabIndex = -1;
  try { document.body.focus({ preventScroll: true }); } catch {}
}

function setQrOverlay(open) {
  if (!tvQrOverlay) return;
  tvQrOverlay.hidden = !open;
  document.body.classList.toggle("qr-overlay-open", open);
  if (open) {
    // The QR is a real dialog. Make Q/Escape work immediately after opening.
    tvQrCloseBtn?.focus({ preventScroll: true });
  } else {
    focusTvShortcuts();
  }
}

function toggleQrOverlay() {
  setQrOverlay(Boolean(tvQrOverlay?.hidden));
}

function setFullModeEnabled(enabled) {
  const active = Boolean(enabled);
  // Separate, opt-in mode. The original TV Mode layout stays untouched.
  document.body.classList.toggle("tv-full-mode", active);
  if (tvFullToggleBtn) {
    tvFullToggleBtn.setAttribute("aria-pressed", String(active));
    tvFullToggleBtn.title = active ? "Return to standard TV Mode (V)" : "Switch to full video (V)";
    const label = tvFullToggleBtn.querySelector("span");
    if (label) label.textContent = active ? "TV View" : "Full";
  }
  scheduleTvMarqueeRefresh();
  // Rebuild the queue when toggling views: normal TV uses 7 entries,
  // Full Mode can rotate up to 15 without affecting playback or ordering.
  renderTvQueueStrip();
  if (active) {
    startFullModeQueueRotation();
    scheduleFullModeTitleRefresh();
    focusTvShortcuts();
  } else {
    stopFullModeQueueRotation();
    if (tvQueueStrip) tvQueueStrip.scrollLeft = 0;
  }
}

async function enterTvMode({ full = false } = {}) {
  document.body.classList.add("tv-mode");
  setFullModeEnabled(full);
  fullscreenBtn.textContent = "⛶ Exit TV";
  scheduleTvMarqueeRefresh();
  renderSingerPreview();
  showDedicationForSong(currentSong);
  queueSongIntro(currentSong);
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // TV and Full Mode still work through CSS if fullscreen is unavailable.
  }
  focusTvShortcuts();
}

async function exitTvMode() {
  cancelSongIntro();
  setQrOverlay(false);
  setFullModeEnabled(false);
  document.body.classList.remove("tv-mode");
  document.body.removeAttribute("tabindex");
  scheduleTvMarqueeRefresh();
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

async function toggleFullMode() {
  if (!document.body.classList.contains("tv-mode")) {
    await enterTvMode({ full: true });
  } else {
    setFullModeEnabled(!document.body.classList.contains("tv-full-mode"));
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
  unsubscribeControlRequests?.();
  unsubscribeReactions?.();
  unsubscribeServerTimeOffset?.();
  unsubscribeGuests = null;
  unsubscribeConnected = null;
  unsubscribeQueue = null;
  unsubscribeSettings = null;
  unsubscribeCurrentSong = null;
  unsubscribeControlRequests = null;
  unsubscribeReactions = null;
  unsubscribeServerTimeOffset = null;
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
    stopPlaybackSyncHeartbeat();
    cancelScoringOutro();
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

    unsubscribeServerTimeOffset?.();
    unsubscribeServerTimeOffset = onValue(ref(db, ".info/serverTimeOffset"), snapshot => {
      hostServerTimeOffsetMs = Number(snapshot.val()) || 0;
      hostServerTimeOffsetReady = true;
      if (activeSessionId && currentSong) {
        publishPlaybackSync({ state: currentSong.playbackState || "playing" }).catch(() => {});
      }
    });

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


async function saveTvThemeFromControl(control) {
  const previousTheme = activeTvTheme;
  const nextTheme = normalizeTvTheme(control?.value);
  applyTvTheme(nextTheme);
  if (!activeSessionId) return;

  if (tvThemeSelect) tvThemeSelect.disabled = true;
  if (tvThemeQuickSelect) tvThemeQuickSelect.disabled = true;
  try {
    await update(ref(db, `sessions/${activeSessionId}/settings`), {
      tvTheme: nextTheme
    });
  } catch (error) {
    console.error(error);
    applyTvTheme(previousTheme);
    window.alert("Could not save the TV theme. Please try again.");
  } finally {
    if (tvThemeSelect) tvThemeSelect.disabled = false;
    if (tvThemeQuickSelect) tvThemeQuickSelect.disabled = false;
  }
}

tvThemeSelect?.addEventListener("change", () => saveTvThemeFromControl(tvThemeSelect));
tvThemeQuickSelect?.addEventListener("change", () => saveTvThemeFromControl(tvThemeQuickSelect));

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
fullModeBtn?.addEventListener("click", () => {
  toggleFullMode().catch(error => console.error(error));
});
scoringToggleBtn?.addEventListener("click", () => setScoringEnabled(!scoringEnabled));
tvFullToggleBtn?.addEventListener("click", () => {
  toggleFullMode().catch(error => console.error(error));
});

tvQrToggleBtn?.addEventListener("click", toggleQrOverlay);
tvQrCornerBtn?.addEventListener("click", () => setQrOverlay(true));
tvQrCloseBtn?.addEventListener("click", () => setQrOverlay(false));
tvQrBackdrop?.addEventListener("click", () => setQrOverlay(false));
tvExitBtn?.addEventListener("click", () => {
  exitTvMode().catch(error => console.error(error));
});

document.addEventListener("fullscreenchange", () => {
  const fullscreen = Boolean(document.fullscreenElement);
  document.body.classList.toggle("tv-mode", fullscreen);
  if (!fullscreen) {
    cancelSongIntro();
    setFullModeEnabled(false);
  }
  fullscreenBtn.textContent = fullscreen ? "⛶ Exit TV" : "📺 TV Mode";
  if (!fullscreen && !document.body.classList.contains("tv-mode")) {
    setQrOverlay(false);
    document.body.removeAttribute("tabindex");
  } else {
    focusTvShortcuts();
  }
  scheduleTvMarqueeRefresh();
});

window.addEventListener("resize", scheduleTvMarqueeRefresh);

document.addEventListener("keydown", event => {
  if (!activeSessionId || sessionPanel.hidden) return;
  const target = event.target;
  const tag = target?.tagName?.toLowerCase?.() || "";
  const typing = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
  if (typing) return;

  // Don't swallow browser shortcuts, and don't repeat destructive karaoke
  // actions when a key is held down (e.g. skip several songs accidentally).
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const key = event.key.toLowerCase();
  if (event.repeat && ["n", "p", "s", "q", "v", "f"].includes(key)) return;

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

  if (key === "q") {
    event.preventDefault();
    toggleQrOverlay();
    return;
  }

  // While the QR is shown, the player and room remain untouched.
  if (tvQrOverlay && !tvQrOverlay.hidden) return;

  if (key === " " || event.code === "Space") {
    event.preventDefault();
    if (currentSong?.playbackState === "playing") {
      pauseCurrent().catch(error => console.error(error));
    } else {
      startOrResume().catch(error => console.error(error));
    }
    return;
  }

  if (key === "v") {
    event.preventDefault();
    toggleFullMode().catch(error => console.error(error));
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

  if (key === "f") {
    event.preventDefault();
    toggleTvMode().catch(error => console.error(error));
  }
});

setAmbilightPalette(DEFAULT_AMBILIGHT_COLORS, "idle");

applyTvTheme(savedTvTheme());
renderScoringToggle();

init();

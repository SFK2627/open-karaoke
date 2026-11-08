// Room-wide search cache. No server, paid services, or host playback listeners.
// A 64-slot ring caps stored API metadata and shares it across joined guests.
import { ref, get, onValue, runTransaction, serverTimestamp } from "./firebase.js";
import { readCachedSearch, writeCachedSearch, searchYouTubeVideos } from "./youtube.js?v=20261108-queue-quota";

const CACHE_TTL_MS = 30 * 60 * 1000;
const CLAIM_STALE_MS = 16000;
const QUOTA_ERROR_TTL_MS = 10 * 60 * 1000;
const TEMP_ERROR_TTL_MS = 10000;
const WAIT_FOR_PEER_MS = 15500;
const SLOT_COUNT = 64;
const activeQueries = new Map();

function cleanQuery(text) {
  return String(text || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function slotFor(query) {
  // Deterministic 32-bit FNV-1a. Collisions replace older slots, never grow storage.
  let hash = 2166136261;
  for (let i = 0; i < query.length; i++) {
    hash ^= query.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String((hash >>> 0) % SLOT_COUNT);
}

function cacheAge(item, now) {
  return now - Number(item?.finishedAt || 0);
}

function readyMatch(item, query, now) {
  return item?.query === query && item.status === "ready" &&
    Number.isFinite(Number(item.finishedAt)) && cacheAge(item, now) >= -3000 && cacheAge(item, now) < CACHE_TTL_MS;
}

function cachedError(item, query, now) {
  if (item?.query !== query || item?.status !== "error") return null;
  const age = cacheAge(item, now);
  if (age < -3000 || age > (item.errorCode === "quota" ? QUOTA_ERROR_TTL_MS : TEMP_ERROR_TTL_MS)) return null;
  const error = new Error(item.errorCode === "quota"
    ? "YouTube's search limit was reached in this karaoke room. Try an earlier search or use a direct YouTube link."
    : "Search is temporarily unavailable. Please try again shortly or use a YouTube link.");
  error.code = item.errorCode === "quota" ? "YOUTUBE_QUOTA" : "SEARCH_TEMPORARY";
  return error;
}

function normalizeResults(items) {
  // Do not change YouTube's text. Only cache valid results with bounded metadata sizes.
  if (!Array.isArray(items) || items.length > 8) return null;
  const out = [];
  for (const item of items) {
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(item?.videoId || "")) return null;
    if (typeof item?.title !== "string" || item.title.length > 1500) return null;
    if (typeof item?.channelTitle !== "string" || item.channelTitle.length > 1500) return null;
    if (typeof item?.thumbnail !== "string" || item.thumbnail.length > 1500) return null;
    out.push({ videoId: item.videoId, title: item.title, channelTitle: item.channelTitle, thumbnail: item.thumbnail });
  }
  return out;
}

function extractResults(value) {
  const list = Array.isArray(value) ? value : (value && typeof value === "object"
    ? Object.entries(value).sort((a, b) => Number(a[0]) - Number(b[0])).map(([,v]) => v)
    : []);
  return normalizeResults(list);
}

function tryCacheRecord(item, key, maxResults) {
  if (readyMatch(item, key, Date.now())) {
    const results = extractResults(item.results);
    if (results) {
      writeCachedSearch(key.split(":").slice(1).join(":"), maxResults, results);
      return { results, cached: true, source: "shared" };
    }
  }
  const error = cachedError(item, key, Date.now());
  if (error) throw error;
  return null;
}

function canClaim(current, key, now) {
  if (!current || current.query !== key) return true;
  if (current.status === "loading") return now - Number(current.requestedAt || 0) > CLAIM_STALE_MS;
  if (current.status === "ready") return !readyMatch(current, key, now);
  if (current.status === "error") return !cachedError(current, key, now);
  return true;
}

function waitForPeer(sharedRef, key) {
  return new Promise(resolve => {
    let stop = null;
    let settled = false;
    let pendingCleanup = false;
    const settle = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stop) stop(); else pendingCleanup = true;
      resolve(value);
    };
    const timer = setTimeout(() => settle(null), WAIT_FOR_PEER_MS);
    try {
      stop = onValue(sharedRef, snap => {
        const item = snap.val();
        if (!item || item.query !== key || item.status !== "loading") settle(item);
      }, () => settle(null));
      if (pendingCleanup) stop();
    } catch { settle(null); }
  });
}

async function sharedLookup(db, roomId, uid, query, maxResults) {
  const key = `${maxResults}:${cleanQuery(query)}`;
  const sharedRef = ref(db, `sessions/${roomId}/searchCache/${slotFor(key)}`);
  let snapshot;
  try { snapshot = await get(sharedRef); }
  catch { return { ...(await searchYouTubeVideos(query, maxResults)), source: "direct" }; }
  const found = tryCacheRecord(snapshot.val(), key, maxResults);
  if (found) return found;

  const requestId = globalThis.crypto?.randomUUID?.().replaceAll("-", "") || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  let claim;
  try {
    claim = await runTransaction(sharedRef, current => {
      // The transaction coalesces simultaneous identical guest searches.
      if (!canClaim(current, key, Date.now())) return;
      return { query: key, ownerUid: uid, requestId, status: "loading", requestedAt: serverTimestamp() };
    }, { applyLocally: false });
  } catch {
    // Older deployed RTDB rules do not yet grant access to searchCache.
    // Never break guest searches during the rollout.
    return { ...(await searchYouTubeVideos(query, maxResults)), source: "direct" };
  }

  if (!claim.committed) {
    const existing = tryCacheRecord(claim.snapshot.val(), key, maxResults);
    if (existing) return existing;
    const peer = await waitForPeer(sharedRef, key);
    const result = tryCacheRecord(peer, key, maxResults);
    if (result) return result;
    // A failed/disconnected peer cannot make searching impossible forever.
    // Retry a normal direct call after the claim's short timeout.
    return { ...(await searchYouTubeVideos(query, maxResults)), source: "direct" };
  }

  try {
    const output = await searchYouTubeVideos(query, maxResults);
    const safe = normalizeResults(output.results);
    if (safe) {
      try {
        await runTransaction(sharedRef, current => {
          if (current?.status !== "loading" || current.query !== key || current.requestId !== requestId || current.ownerUid !== uid) return;
          return { ...current, status: "ready", finishedAt: serverTimestamp(), results: safe };
        }, { applyLocally: false });
      } catch (error) { console.debug("Room search cache write unavailable:", error?.message || error); }
    }
    return { ...output, source: "youtube" };
  } catch (error) {
    try {
      await runTransaction(sharedRef, current => {
        if (current?.status !== "loading" || current.query !== key || current.requestId !== requestId || current.ownerUid !== uid) return;
        return { ...current, status: "error", errorCode: error?.code === "YOUTUBE_QUOTA" ? "quota" : "temporary", finishedAt: serverTimestamp() };
      }, { applyLocally: false });
    } catch {}
    throw error;
  }
}

export async function searchYouTubeVideosShared(db, roomId, uid, query, maxResults = 8) {
  const normalized = cleanQuery(query);
  if (!normalized) throw new Error("Enter a song or artist to search.");
  const cached = readCachedSearch(normalized, maxResults);
  if (cached) return { results: cached, cached: true, source: "local" };
  if (!roomId || !uid || !db) return { ...(await searchYouTubeVideos(query, maxResults)), source: "direct" };
  const key = `${roomId}:${maxResults}:${normalized}`;
  if (!activeQueries.has(key)) activeQueries.set(key, sharedLookup(db, roomId, uid, normalized, maxResults));
  try { return await activeQueries.get(key); }
  finally { activeQueries.delete(key); }
}

import { youtubeConfig } from "./youtube-config.js";

let iframeApiPromise;

export function isYouTubeSearchConfigured() {
  const key = String(youtubeConfig?.apiKey || "").trim();
  return Boolean(key) && !key.includes("PASTE_YOUR_");
}

export function loadYouTubeIframeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (iframeApiPromise) return iframeApiPromise;

  iframeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => {
      reject(new Error("YouTube player took too long to load."));
    }, 15000);

    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeout);
      try { previousReady?.(); } catch (error) { console.error(error); }
      resolve(window.YT);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("Could not load the YouTube Player API."));
      };
      document.head.appendChild(script);
    }
  });

  return iframeApiPromise;
}

export async function createYouTubePlayer(elementId, handlers = {}, options = {}) {
  const YT = await loadYouTubeIframeApi();
  const pageOrigin = /^https?:$/i.test(window.location.protocol) ? window.location.origin : "";
  const playerVars = {
    playsinline: 1,
    rel: 0,
    modestbranding: 1,
    ...(pageOrigin ? { origin: pageOrigin } : {}),
    ...(options.playerVars || {})
  };
  const config = {
    width: "100%",
    height: "100%",
    playerVars,
    events: {
      onReady: event => handlers.onReady?.(event),
      onStateChange: event => handlers.onStateChange?.(event),
      onError: event => handlers.onError?.(event),
      onAutoplayBlocked: event => handlers.onAutoplayBlocked?.(event)
    }
  };
  if (options.videoId) config.videoId = String(options.videoId);
  return new YT.Player(elementId, config);
}

function decodeEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value || "");
  return textarea.value;
}

function searchCacheKey(query, maxResults) {
  return `openKaraokeYT:${maxResults}:${String(query || "").trim().replace(/\s+/g, " ").toLowerCase()}`;
}

export function readCachedSearch(query, maxResults) {
  try {
    const raw = localStorage.getItem(searchCacheKey(query, maxResults)) || sessionStorage.getItem(searchCacheKey(query, maxResults));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > 30 * 60 * 1000) return null;
    return Array.isArray(parsed.results) ? parsed.results : null;
  } catch {
    return null;
  }
}

export function writeCachedSearch(query, maxResults, results) {
  try {
    const key = searchCacheKey(query, maxResults);
    const value = JSON.stringify({ savedAt: Date.now(), results });
    // Keep a small cross-reload cache. This avoids duplicate search.list calls
    // when guests refresh or rejoin, without unbounded local storage growth.
    const indexKey = "openKaraokeYTCacheIndex";
    const previous = JSON.parse(localStorage.getItem(indexKey) || "[]");
    const index = [key, ...(Array.isArray(previous) ? previous : []).filter(item => item !== key)];
    index.slice(12).forEach(oldKey => localStorage.removeItem(oldKey));
    localStorage.setItem(key, value);
    localStorage.setItem(indexKey, JSON.stringify(index.slice(0, 12)));
  } catch {
    // Storage can be disabled or full; use this-tab cache when available.
    try { sessionStorage.setItem(searchCacheKey(query, maxResults), JSON.stringify({savedAt: Date.now(), results})); } catch {}
  }
}

const inFlightSearches = new Map();
const QUOTA_COOLDOWN_KEY = "openKaraokeYTQuotaCooldown";

export async function searchYouTubeVideos(query, maxResults = 8) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) throw new Error("Enter a song or artist to search.");
  if (!isYouTubeSearchConfigured()) {
    throw new Error("YouTube Search is not configured yet. Use the YouTube-link option below, or add the API key in js/youtube-config.js.");
  }

  const cached = readCachedSearch(cleanQuery, maxResults);
  if (cached) return { results: cached, cached: true };

  // A quota failure is not solved by immediately repeating the same API call.
  try {
    if (Number(localStorage.getItem(QUOTA_COOLDOWN_KEY) || 0) > Date.now()) {
      const error = new Error("YouTube search quota was reached. Try a saved search or reserve using a direct YouTube link.");
      error.code = "YOUTUBE_QUOTA";
      throw error;
    }
  } catch (error) {
    if (error?.code === "YOUTUBE_QUOTA") throw error;
  }

  const requestKey = searchCacheKey(cleanQuery, maxResults);
  if (inFlightSearches.has(requestKey)) return inFlightSearches.get(requestKey);
  const pending = requestYouTubeVideos(cleanQuery, maxResults);
  inFlightSearches.set(requestKey, pending);
  try { return await pending; }
  finally { inFlightSearches.delete(requestKey); }
}

async function requestYouTubeVideos(cleanQuery, maxResults) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: String(maxResults),
    q: cleanQuery,
    key: youtubeConfig.apiKey
  });

  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 10000);
  let response;
  try { response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { signal: abort.signal }); }
  catch (error) {
    if (error?.name === "AbortError") throw new Error("YouTube search took too long. Please try again or use a YouTube link.");
    throw error;
  } finally { clearTimeout(timeout); }
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reasons = (data?.error?.errors || []).map(item => String(item?.reason || ""));
    const quotaHit = reasons.some(reason => /quotaExceeded|dailyLimitExceeded|rateLimitExceeded|userRateLimitExceeded/i.test(reason)) ||
      (response.status === 403 && /quota exceeded|quota has been exceeded|daily limit/i.test(data?.error?.message || ""));
    if (quotaHit) {
      try { localStorage.setItem(QUOTA_COOLDOWN_KEY, String(Date.now() + 10 * 60 * 1000)); } catch {}
      const error = new Error("YouTube search quota reached. Use a previous search or reserve using a direct YouTube link.");
      error.code = "YOUTUBE_QUOTA";
      throw error;
    }
    throw new Error(data?.error?.message || "YouTube search failed. Try again later.");
  }

  const results = (data.items || [])
    .map(item => ({
      videoId: item?.id?.videoId || "",
      title: decodeEntities(item?.snippet?.title || "Untitled video"),
      channelTitle: decodeEntities(item?.snippet?.channelTitle || "YouTube"),
      thumbnail:
        item?.snippet?.thumbnails?.medium?.url ||
        item?.snippet?.thumbnails?.default?.url ||
        ""
    }))
    .filter(item => item.videoId);

  writeCachedSearch(cleanQuery, maxResults, results);
  return { results, cached: false };
}

export function youtubePlayerErrorMessage(code) {
  if (code === 2) return "This YouTube video ID is invalid.";
  if (code === 5) return "This video could not be played in the HTML5 player.";
  if (code === 100) return "This YouTube video is unavailable, private, or deleted.";
  if (code === 101 || code === 150) return "This YouTube video does not allow embedded playback. Skip it and choose another karaoke video.";
  if (code === 153) return "YouTube rejected the embedded player identity. Re-sync the Watch display or allow normal referrer information for this site.";
  return `This YouTube video cannot be played (error ${Number(code) || "unknown"}). Please try Re-sync or choose another song.`;
}

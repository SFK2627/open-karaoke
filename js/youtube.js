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

export async function createYouTubePlayer(elementId, handlers = {}) {
  const YT = await loadYouTubeIframeApi();
  return new YT.Player(elementId, {
    width: "100%",
    height: "100%",
    playerVars: {
      playsinline: 1,
      rel: 0,
      modestbranding: 1
    },
    events: {
      onReady: event => handlers.onReady?.(event),
      onStateChange: event => handlers.onStateChange?.(event),
      onError: event => handlers.onError?.(event)
    }
  });
}

function decodeEntities(value) {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = String(value || "");
  return textarea.value;
}

function searchCacheKey(query, maxResults) {
  return `openKaraokeYT:${maxResults}:${query.trim().toLowerCase()}`;
}

function readCachedSearch(query, maxResults) {
  try {
    const raw = sessionStorage.getItem(searchCacheKey(query, maxResults));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > 10 * 60 * 1000) return null;
    return Array.isArray(parsed.results) ? parsed.results : null;
  } catch {
    return null;
  }
}

function writeCachedSearch(query, maxResults, results) {
  try {
    sessionStorage.setItem(searchCacheKey(query, maxResults), JSON.stringify({
      savedAt: Date.now(),
      results
    }));
  } catch {
    // Cache is only an optimization; ignore storage failures.
  }
}

export async function searchYouTubeVideos(query, maxResults = 8) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) throw new Error("Enter a song or artist to search.");
  if (!isYouTubeSearchConfigured()) {
    throw new Error("YouTube Search is not configured yet. Use the YouTube-link option below, or add the API key in js/youtube-config.js.");
  }

  const cached = readCachedSearch(cleanQuery, maxResults);
  if (cached) return { results: cached, cached: true };

  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoEmbeddable: "true",
    maxResults: String(maxResults),
    q: cleanQuery,
    key: youtubeConfig.apiKey
  });

  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.error?.message || "YouTube search failed. Try again later.";
    throw new Error(message);
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
  return "This YouTube video cannot be played. Please choose another song.";
}

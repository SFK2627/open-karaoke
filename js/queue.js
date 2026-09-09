export function extractYouTubeVideoId(value) {
  const input = String(value || "").trim();
  if (!input) return null;

  if (/^[A-Za-z0-9_-]{6,20}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return /^[A-Za-z0-9_-]{6,20}$/.test(id || "") ? id : null;
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return /^[A-Za-z0-9_-]{6,20}$/.test(id || "") ? id : null;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) {
        const id = parts[1];
        return /^[A-Za-z0-9_-]{6,20}$/.test(id || "") ? id : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function makeQueueItemId(guestId, videoId) {
  return `${guestId}_${videoId}`;
}

export function youtubeThumbnail(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

export function queueSortValue(item) {
  const explicitOrder = Number(item?.order);
  if (Number.isFinite(explicitOrder)) return explicitOrder;

  const addedAt = Number(item?.addedAt);
  return Number.isFinite(addedAt) ? addedAt : Number.MAX_SAFE_INTEGER;
}

export function sortQueueEntries(queueObject) {
  return Object.entries(queueObject || {}).sort((a, b) => {
    const aHasOrder = a[1]?.order !== undefined && a[1]?.order !== null && Number.isFinite(Number(a[1].order));
    const bHasOrder = b[1]?.order !== undefined && b[1]?.order !== null && Number.isFinite(Number(b[1].order));

    // Once the Host has explicitly reordered the waiting queue, all ordered
    // items stay ahead of later reservations that do not yet have an order.
    if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;

    if (aHasOrder && bHasOrder) {
      const aOrder = Number(a[1].order);
      const bOrder = Number(b[1].order);
      if (aOrder !== bOrder) return aOrder - bOrder;
    }

    const aTime = Number(a[1]?.addedAt || 0);
    const bTime = Number(b[1]?.addedAt || 0);
    if (aTime !== bTime) return aTime - bTime;
    return a[0].localeCompare(b[0]);
  });
}

export function sortFinishedEntries(queueObject) {
  return Object.entries(queueObject || {})
    .filter(([, item]) => item?.status === "completed" || item?.status === "skipped")
    .sort((a, b) => {
      const aFinished = Number(a[1]?.finishedAt || 0);
      const bFinished = Number(b[1]?.finishedAt || 0);
      if (aFinished !== bFinished) return bFinished - aFinished;
      return b[0].localeCompare(a[0]);
    });
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Turn a pasted YouTube/Vimeo link into an embeddable player URL.
 *
 * Only these two services are accepted — anything else returns null and the
 * API rejects the save, so a broken card can never be created. Unlisted
 * YouTube videos embed like any other. Vimeo links with a privacy hash
 * (vimeo.com/12345/abcdef or ?h=abcdef) keep the hash on the player URL,
 * which is what lets privacy-restricted videos play.
 */

export type VideoEmbed = {
  provider: "youtube" | "vimeo";
  embedUrl: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_HASH = /^[A-Za-z0-9]{6,12}$/;

function youtubeEmbed(id: string | null | undefined): VideoEmbed | null {
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` };
}

function vimeoEmbed(id: string | undefined, hash: string | undefined): VideoEmbed | null {
  if (!id || !/^\d+$/.test(id)) return null;
  const suffix = hash && VIMEO_HASH.test(hash) ? `?h=${hash}` : "";
  return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}${suffix}` };
}

export function parseVideoUrl(raw: string): VideoEmbed | null {
  let input = raw.trim();
  if (!input) return null;
  // Be forgiving about a missing scheme ("youtube.com/watch?v=...").
  if (!/^https?:\/\//i.test(input)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return null; // some other scheme
    input = `https://${input}`;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  const segments = url.pathname.split("/").filter(Boolean);

  // --- YouTube ---
  if (host === "youtu.be") {
    return youtubeEmbed(segments[0]);
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (segments[0] === "watch") return youtubeEmbed(url.searchParams.get("v"));
    if (["embed", "shorts", "live", "v"].includes(segments[0] ?? "")) {
      return youtubeEmbed(segments[1]);
    }
    return null;
  }

  // --- Vimeo ---
  if (host === "player.vimeo.com") {
    if (segments[0] !== "video") return null;
    return vimeoEmbed(segments[1], url.searchParams.get("h") ?? undefined);
  }
  if (host === "vimeo.com") {
    // vimeo.com/12345, vimeo.com/12345/privacyhash,
    // vimeo.com/channels/x/12345, vimeo.com/groups/x/videos/12345,
    // vimeo.com/manage/videos/12345
    const idIndex = segments.findIndex((s) => /^\d+$/.test(s));
    if (idIndex === -1) return null;
    const id = segments[idIndex];
    const next = segments[idIndex + 1];
    const hash = url.searchParams.get("h") ?? next;
    return vimeoEmbed(id, hash ?? undefined);
  }

  return null;
}

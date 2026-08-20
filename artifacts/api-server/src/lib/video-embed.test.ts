import { describe, expect, it } from "vitest";
import { parseVideoUrl } from "./video-embed";

describe("parseVideoUrl — YouTube", () => {
  it("accepts a standard watch link", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual({
      provider: "youtube",
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("accepts youtu.be short links", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.embedUrl).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("accepts shorts, live, and embed paths", () => {
    for (const u of [
      "https://www.youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ]) {
      expect(parseVideoUrl(u)?.embedUrl).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
  });

  it("accepts unlisted watch links (same shape as public ones)", () => {
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=aB3_dE5fGh1&feature=share")?.embedUrl,
    ).toBe("https://www.youtube.com/embed/aB3_dE5fGh1");
  });

  it("tolerates a missing scheme and extra whitespace", () => {
    expect(parseVideoUrl("  youtube.com/watch?v=dQw4w9WgXcQ ")?.provider).toBe("youtube");
  });

  it("rejects watch links without a valid 11-character id", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(parseVideoUrl("https://www.youtube.com/watch")).toBeNull();
    expect(parseVideoUrl("https://www.youtube.com/playlist?list=PL123")).toBeNull();
  });
});

describe("parseVideoUrl — Vimeo", () => {
  it("accepts a plain video link", () => {
    expect(parseVideoUrl("https://vimeo.com/76979871")).toEqual({
      provider: "vimeo",
      embedUrl: "https://player.vimeo.com/video/76979871",
    });
  });

  it("keeps the privacy hash from an unlisted link path", () => {
    expect(parseVideoUrl("https://vimeo.com/76979871/abcdef123")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=abcdef123",
    );
  });

  it("keeps the privacy hash from a player link with ?h=", () => {
    expect(parseVideoUrl("https://player.vimeo.com/video/76979871?h=abcdef123")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=abcdef123",
    );
  });

  it("accepts channel and group paths", () => {
    expect(parseVideoUrl("https://vimeo.com/channels/staffpicks/76979871")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871",
    );
    expect(parseVideoUrl("https://vimeo.com/groups/cats/videos/76979871")?.embedUrl).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  it("rejects vimeo pages that are not a single video", () => {
    expect(parseVideoUrl("https://vimeo.com/upgrade")).toBeNull();
    expect(parseVideoUrl("https://vimeo.com/")).toBeNull();
  });
});

describe("parseVideoUrl — everything else is rejected", () => {
  it("rejects non-video sites and garbage", () => {
    expect(parseVideoUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("https://dailymotion.com/video/x123")).toBeNull();
    expect(parseVideoUrl("not a url at all")).toBeNull();
    expect(parseVideoUrl("")).toBeNull();
    expect(parseVideoUrl("ftp://youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects lookalike hostnames", () => {
    expect(parseVideoUrl("https://fakeyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(parseVideoUrl("https://notvimeo.com/76979871")).toBeNull();
  });
});

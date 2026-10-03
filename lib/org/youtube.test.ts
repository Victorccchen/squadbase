import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkYouTubeEmbed,
  combineEmbedStatuses,
  embedStatusFromHttpStatus,
  parseBroadcastForm,
  parseYouTubeVideoId,
  youTubeOEmbedUrl,
} from "./youtube.ts";

const ID = "BX5z_31ePNk";

describe("parseYouTubeVideoId", () => {
  it("accepts every single-video URL form", () => {
    const urls = [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}`,
      `http://www.youtube.com/watch?v=${ID}`,
      `www.youtube.com/watch?v=${ID}`,
      `youtube.com/watch?v=${ID}`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://www.youtube.com/watch?v=${ID}&t=120s`,
      `https://www.youtube.com/watch?feature=share&v=${ID}&si=abcDEF`,
      `https://www.youtube.com/watch?v=${ID}&list=PL1234567890&index=2`,
      `https://www.youtube.com/watch?v=${ID}#t=30`,
      `https://youtu.be/${ID}`,
      `https://youtu.be/${ID}?si=xyz123&t=5`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/live/${ID}`,
      `https://www.youtube.com/live/${ID}?si=abc&feature=share`,
      `https://m.youtube.com/live/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/embed/${ID}?rel=0&autoplay=1`,
      `https://www.youtube-nocookie.com/embed/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://m.youtube.com/shorts/${ID}?feature=share`,
      `https://www.youtube.com/live/${ID}/`,
      `  https://www.youtube.com/watch?v=${ID}  `,
      `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
    ];
    for (const url of urls) {
      assert.equal(parseYouTubeVideoId(url), ID, url);
    }
  });

  it("accepts ids with - and _", () => {
    assert.equal(parseYouTubeVideoId("https://youtu.be/2xp137k-j2c"), "2xp137k-j2c");
  });

  it("rejects channels, playlists and non-video pages", () => {
    const urls = [
      "https://www.youtube.com/@CTFATV",
      "https://www.youtube.com/@CTFATV/streams",
      "https://www.youtube.com/channel/UCvRQvspKfMUSJPWxpW5PqHg",
      "https://www.youtube.com/c/CTFATV",
      "https://www.youtube.com/playlist?list=PL1234567890",
      "https://www.youtube.com/watch?list=PL1234567890",
      "https://www.youtube.com/",
      "https://www.youtube.com/watch",
      "https://youtu.be/",
      "https://www.youtube.com/results?search_query=futuro",
    ];
    for (const url of urls) {
      assert.equal(parseYouTubeVideoId(url), null, url);
    }
  });

  it("rejects non-YouTube hosts and look-alikes", () => {
    const urls = [
      `https://vimeo.com/${ID}`,
      `https://evil.com/watch?v=${ID}`,
      `https://youtube.com.evil.com/watch?v=${ID}`,
      `https://notyoutube.com/watch?v=${ID}`,
      `https://evil.com/youtu.be/${ID}`,
      `https://user:pass@www.youtube.com/watch?v=${ID}`,
      `javascript:alert(1)//www.youtube.com/watch?v=${ID}`,
      `ftp://www.youtube.com/watch?v=${ID}`,
      `data:text/html,https://youtu.be/${ID}`,
    ];
    for (const url of urls) {
      assert.equal(parseYouTubeVideoId(url), null, url);
    }
  });

  it("rejects bad ids and empty input", () => {
    assert.equal(parseYouTubeVideoId(""), null);
    assert.equal(parseYouTubeVideoId("   "), null);
    assert.equal(parseYouTubeVideoId(null), null);
    assert.equal(parseYouTubeVideoId(undefined), null);
    assert.equal(parseYouTubeVideoId(ID), null);
    assert.equal(parseYouTubeVideoId("https://youtu.be/short"), null);
    assert.equal(parseYouTubeVideoId("https://youtu.be/BX5z_31ePNkX"), null);
    assert.equal(parseYouTubeVideoId("https://www.youtube.com/watch?v=BX5z_31eP!k"), null);
    assert.equal(parseYouTubeVideoId(`https://www.youtube.com/embed/${ID}/extra`), null);
    assert.equal(parseYouTubeVideoId(`https://youtu.be/${ID}/extra`), null);
    assert.equal(parseYouTubeVideoId("not a url"), null);
    assert.equal(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${ID}&x=${"a".repeat(600)}`), null);
  });
});

describe("oEmbed status mapping", () => {
  it("maps HTTP statuses", () => {
    assert.equal(embedStatusFromHttpStatus(200), "ok");
    assert.equal(embedStatusFromHttpStatus(401), "blocked");
    assert.equal(embedStatusFromHttpStatus(403), "blocked");
    assert.equal(embedStatusFromHttpStatus(404), "not_found");
    assert.equal(embedStatusFromHttpStatus(400), "not_found");
    assert.equal(embedStatusFromHttpStatus(500), "unknown");
    assert.equal(embedStatusFromHttpStatus(429), "unknown");
  });

  it("builds the oEmbed URL from the id only", () => {
    assert.equal(
      youTubeOEmbedUrl(ID),
      `https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D${ID}&format=json`,
    );
  });

  it("combines statuses worst-first", () => {
    assert.equal(combineEmbedStatuses([]), "unknown");
    assert.equal(combineEmbedStatuses(["ok", "ok"]), "ok");
    assert.equal(combineEmbedStatuses(["ok", "unknown"]), "unknown");
    assert.equal(combineEmbedStatuses(["unknown", "not_found"]), "not_found");
    assert.equal(combineEmbedStatuses(["not_found", "blocked", "ok"]), "blocked");
  });

  it("checkYouTubeEmbed returns title on 200 and unknown on network errors", async () => {
    const okFetch = (async () =>
      new Response(JSON.stringify({ title: "  第1輪 台中FUTURO vs 大同石虎 " }), {
        status: 200,
      })) as typeof fetch;
    assert.deepEqual(await checkYouTubeEmbed(ID, { fetchImpl: okFetch }), {
      status: "ok",
      title: "第1輪 台中FUTURO vs 大同石虎",
    });

    const blocked = (async () => new Response("Unauthorized", { status: 401 })) as typeof fetch;
    assert.deepEqual(await checkYouTubeEmbed(ID, { fetchImpl: blocked }), {
      status: "blocked",
      title: null,
    });

    const missing = (async () => new Response("Not Found", { status: 404 })) as typeof fetch;
    assert.equal((await checkYouTubeEmbed(ID, { fetchImpl: missing })).status, "not_found");

    const broken = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    assert.deepEqual(await checkYouTubeEmbed(ID, { fetchImpl: broken }), {
      status: "unknown",
      title: null,
    });

    const badJson = (async () => new Response("not json", { status: 200 })) as typeof fetch;
    assert.deepEqual(await checkYouTubeEmbed(ID, { fetchImpl: badJson }), {
      status: "ok",
      title: null,
    });
  });

  it("checkYouTubeEmbed times out as unknown", async () => {
    const slow = ((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      })) as typeof fetch;
    const result = await checkYouTubeEmbed(ID, { fetchImpl: slow, timeoutMs: 20 });
    assert.equal(result.status, "unknown");
  });
});

describe("parseBroadcastForm", () => {
  const base = {
    live: "",
    replay: "",
    highlights: "",
    embedEnabled: true,
    videoTitle: "",
    liveWindowBeforeMin: "",
  };

  it("parses all fields", () => {
    const parsed = parseBroadcastForm({
      ...base,
      live: `https://www.youtube.com/live/${ID}?si=x`,
      highlights: "https://youtu.be/2xp137k-j2c",
      videoTitle: "  title ",
      liveWindowBeforeMin: "45",
      embedEnabled: false,
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.ids, { live: ID, replay: null, highlights: "2xp137k-j2c" });
    assert.equal(parsed.urls.live, `https://www.youtube.com/live/${ID}?si=x`);
    assert.equal(parsed.urls.replay, null);
    assert.equal(parsed.videoTitle, "title");
    assert.equal(parsed.liveWindowBeforeMin, 45);
    assert.equal(parsed.embedEnabled, false);
  });

  it("allows clearing everything", () => {
    const parsed = parseBroadcastForm(base);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.deepEqual(parsed.ids, { live: null, replay: null, highlights: null });
    assert.equal(parsed.liveWindowBeforeMin, null);
    assert.equal(parsed.videoTitle, null);
  });

  it("rejects a bad URL with the field name", () => {
    assert.deepEqual(parseBroadcastForm({ ...base, replay: "https://www.youtube.com/@CTFATV" }), {
      ok: false,
      errorKey: "invalidVideoUrl",
      field: "replay",
    });
  });

  it("validates the live window 0–180", () => {
    assert.equal(parseBroadcastForm({ ...base, liveWindowBeforeMin: "0" }).ok, true);
    assert.equal(parseBroadcastForm({ ...base, liveWindowBeforeMin: "180" }).ok, true);
    for (const bad of ["181", "-1", "1.5", "abc", "1000"]) {
      assert.deepEqual(parseBroadcastForm({ ...base, liveWindowBeforeMin: bad }), {
        ok: false,
        errorKey: "invalidLiveWindow",
      });
    }
  });
});

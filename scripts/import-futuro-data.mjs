#!/usr/bin/env node
/**
 * Builds supabase/seeds/futuro_2026_27.sql from the Grok-Bot CSVs in data/futuro/.
 *
 *   node scripts/import-futuro-data.mjs            # write the SQL and print a mapping log
 *   node scripts/import-futuro-data.mjs --check    # fail if the committed SQL is stale
 *
 * The SQL is idempotent (upsert by slug / natural key; fixtures matched by
 * season + competition + round, or team + kickoff) and is applied by hand to
 * staging in the Supabase SQL editor. See docs/futuro-data-import.md.
 *
 * Imports: G1 clubs, G2 venues, G3 first-team fixtures (2026/27 TFPL),
 * G4 standings, G5 replay videos. Not imported: G6 (history; the TFPL
 * competition is seeded by migration), G7-G10, and never G8 (player data
 * needs consent).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(ROOT, "data", "futuro");
const OUT = join(ROOT, "supabase", "seeds", "futuro_2026_27.sql");

const SEASON = "2026/27";
const COMPETITION_SLUG = "tfpl";
const SELF_NAME = "台中FUTURO";
const FIRST_TEAM_MATCH_MINUTES = 150;

// Stable slugs (the CSVs have no ASCII ids). abbr: CTFA short name (SAC) or
// the crest file name on CTFA (HYFC, TSG, TCR) where there is one; the rest
// are proposals for the club to confirm.
const CLUBS = {
  台中FUTURO: { slug: "taichung-futuro", abbr: "FUT" },
  台灣電力: { slug: "taipower", abbr: "TPC" },
  高雄先鋒: { slug: "kaohsiung-attackers", abbr: "KAFC" },
  大同石虎: { slug: "tatung", abbr: "TTFC" },
  陽信北競: { slug: "ac-taipei", abbr: "SAC" },
  新北航源: { slug: "hang-yuan", abbr: "HYFC" },
  南市台鋼: { slug: "tainan-tsg", abbr: "TSG" },
  台中磐石: { slug: "taichung-rock", abbr: "TCR" },
};

const VENUES = {
  台中西屯足球場: "xitun-football-field",
  太原足球場: "taiyuan-football-field",
  南屯人工草皮練習場: "nantun-artificial-turf",
  楠梓足球場: "nanzi-football-field",
  台南市立足球場: "tainan-municipal-football-stadium",
  輔仁大學足球場: "fju-football-field",
  汐止綜合運動場: "xizhi-sports-ground",
  臺北田徑場: "taipei-municipal-stadium",
  新竹縣第二運動場: "hsinchu-county-second-stadium",
};

// Known spellings in other sources (CTFA PDF vs JoomLeague, 臺/台).
const VENUE_ALIASES = {
  西屯足球場: "台中西屯足球場",
  台北田徑場: "臺北田徑場",
};

const log = [];
const unmapped = [];
function note(message) {
  log.push(message);
}
function miss(message) {
  unmapped.push(message);
}

// --- CSV --------------------------------------------------------------------------------------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  return body.map((cells, index) => {
    const record = { _line: index + 2 };
    header.forEach((key, i) => {
      record[key.trim()] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

function readCsv(name) {
  return parseCsv(readFileSync(join(DATA, name), "utf8"));
}

// --- Normalizers ------------------------------------------------------------------------------

export function normalizeSeason(value) {
  const m = /(\d{4})\s*[/\-－–~]\s*(\d{2}|\d{4})/.exec(value ?? "");
  if (!m) return null;
  const start = Number(m[1]);
  const end = Number(m[2].slice(-2));
  if ((start + 1) % 100 !== end) return null;
  return `${start}/${String(end).padStart(2, "0")}`;
}

function normalizeName(value) {
  return (value ?? "").replace(/臺/g, "台").replace(/\s+/g, "");
}

const venueByNormalized = new Map();
for (const name of Object.keys(VENUES)) venueByNormalized.set(normalizeName(name), name);
for (const [alias, name] of Object.entries(VENUE_ALIASES)) {
  venueByNormalized.set(normalizeName(alias), name);
}

function canonicalVenue(value) {
  return venueByNormalized.get(normalizeName(value)) ?? null;
}

/** Free text such as "輔仁大學足球場／臺北田徑場（多場地）": first known venue mentioned. */
function venueFromFreeText(value) {
  const text = normalizeName(value);
  const exact = canonicalVenue(value);
  if (exact) return { name: exact, others: [] };
  const hits = [];
  for (const [needle, name] of venueByNormalized) {
    const at = text.indexOf(needle);
    if (at >= 0 && !hits.some((hit) => hit.name === name)) hits.push({ at, name, len: needle.length });
  }
  // Prefer the earliest, then the longest match (台中西屯足球場 over 西屯足球場).
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  const unique = [];
  for (const hit of hits) if (!unique.some((u) => u.name === hit.name)) unique.push(hit);
  if (unique.length === 0) return null;
  return { name: unique[0].name, others: unique.slice(1).map((hit) => hit.name) };
}

function intOrNull(value) {
  return /^\d+$/.test(value ?? "") ? Number(value) : null;
}

function numOrNull(value) {
  return /^-?\d+(\.\d+)?$/.test(value ?? "") ? Number(value) : null;
}

function httpsOrNull(value) {
  const first = (value ?? "").split("|").map((part) => part.trim()).find(Boolean) ?? "";
  return /^https:\/\/\S+$/.test(first) ? first : null;
}

function surfaceOf(value) {
  const v = value ?? "";
  const artificial = v.includes("人工草");
  const natural = v.includes("天然草");
  if (artificial && natural) return "mixed";
  if (artificial) return "artificial";
  if (natural) return "natural";
  return null;
}

export function youTubeId(url) {
  const m =
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([A-Za-z0-9_-]{11})(?:[&#]|$)/.exec(url ?? "") ??
    /^https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})(?:[?#]|$)/.exec(url ?? "") ??
    /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:live|embed|shorts)\/([A-Za-z0-9_-]{11})(?:[/?#]|$)/.exec(url ?? "");
  return m ? m[1] : null;
}

function taipeiIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || !/^\d{1,2}:\d{2}$/.test(time ?? "")) return null;
  const [h, m] = time.split(":");
  const iso = `${date}T${h.padStart(2, "0")}:${m}:00+08:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

function plusMinutesTaipei(iso, minutes) {
  const ms = Date.parse(iso) + minutes * 60_000;
  const local = new Date(ms + 8 * 3_600_000).toISOString().slice(0, 19);
  return `${local}+08:00`;
}

// --- SQL helpers ------------------------------------------------------------------------------

function q(value) {
  if (value === null || value === undefined || value === "") return "null";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function venueRef(slug) {
  return slug ? `(select id from public.public_venues where slug = ${q(slug)})` : "null";
}

// --- Build ------------------------------------------------------------------------------------

function buildVenues() {
  const rows = [];
  for (const r of readCsv("G2-venues.csv")) {
    const name = canonicalVenue(r.name_zh);
    if (!name) {
      miss(`G2 line ${r._line}: venue "${r.name_zh}" has no slug; add it to VENUES`);
      continue;
    }
    const capacity = intOrNull(r.capacity);
    if (r.capacity && capacity === null) {
      note(`G2 ${name}: capacity "${r.capacity}" is not a single number; left empty`);
    }
    const lat = numOrNull(r.lat);
    const lng = numOrNull(r.lng);
    rows.push({
      slug: VENUES[name],
      name_zh: name,
      name_en: r.name_en || null,
      address_zh: r.address_zh || null,
      address_en: r.address_en || null,
      lat,
      lng,
      map_url: httpsOrNull(r.google_maps_url),
      transit_zh: r.transit_zh || null,
      parking_zh: r.parking_zh || null,
      accessibility_zh: r.accessibility_zh || null,
      capacity,
      surface: surfaceOf(r.surface),
    });
  }
  return rows;
}

function buildClubs(venueSlugs) {
  const rows = [];
  for (const r of readCsv("G1-clubs.csv")) {
    const meta = CLUBS[r.name_zh];
    if (!meta) {
      miss(`G1 line ${r._line}: club "${r.name_zh}" has no slug; add it to CLUBS`);
      continue;
    }
    let homeVenueSlug = null;
    if (r.home_venue) {
      const hit = venueFromFreeText(r.home_venue);
      if (!hit) {
        miss(`G1 ${r.name_zh}: home venue "${r.home_venue}" matches no venue; left empty`);
      } else {
        homeVenueSlug = VENUES[hit.name];
        if (!venueSlugs.has(homeVenueSlug)) {
          miss(`G1 ${r.name_zh}: home venue ${hit.name} is not in G2; left empty`);
          homeVenueSlug = null;
        } else if (hit.others.length > 0 || normalizeName(r.home_venue) !== normalizeName(hit.name)) {
          note(`G1 ${r.name_zh}: home venue free text "${r.home_venue}" -> ${hit.name}`);
        }
      }
    }
    const urls = {};
    for (const key of ["website_url", "instagram_url", "facebook_url", "youtube_url"]) {
      urls[key] = httpsOrNull(r[key]);
      if (r[key] && !urls[key]) note(`G1 ${r.name_zh}: ${key} "${r[key]}" is not https; left empty`);
    }
    rows.push({
      slug: meta.slug,
      name_zh: r.name_zh,
      name_ja: r.name_ja || null,
      name_en: r.name_en || null,
      short_zh: r.short_zh || null,
      short_en: r.short_en || null,
      abbr: meta.abbr,
      home_venue_slug: homeVenueSlug,
      ...urls,
      is_self: r.name_zh === SELF_NAME,
    });
  }
  return rows;
}

function buildVideos() {
  return readCsv("G5-videos.csv").map((r) => ({ ...r, videoId: youTubeId(r.video_url) }));
}

function buildFixtures(clubSlugs, venueSlugs, videos) {
  const rows = [];
  const usedVideos = new Set();
  for (const r of readCsv("G3-fixtures.csv")) {
    const season = normalizeSeason(r.competition);
    const isTfpl = /台企甲|企業甲級/.test(r.competition ?? "");
    if (season !== SEASON || !isTfpl) {
      miss(`G3 line ${r._line}: competition "${r.competition}" is not TFPL ${SEASON}; skipped`);
      continue;
    }
    const round = intOrNull(r.round);
    const startsAt = taipeiIso(r.date, r.kickoff);
    if (!round || round > 99 || !startsAt) {
      miss(`G3 line ${r._line}: bad round/date/kickoff (${r.round}, ${r.date} ${r.kickoff}); skipped`);
      continue;
    }
    let side;
    let opponent;
    if (r.home === SELF_NAME) {
      side = "home";
      opponent = r.away;
    } else if (r.away === SELF_NAME) {
      side = "away";
      opponent = r.home;
    } else {
      miss(`G3 line ${r._line}: ${r.home} vs ${r.away} is not a ${SELF_NAME} match; skipped`);
      continue;
    }
    const opponentSlug = CLUBS[opponent]?.slug ?? null;
    if (!opponentSlug || !clubSlugs.has(opponentSlug)) {
      miss(`G3 round ${round}: opponent "${opponent}" not in clubs; opponent_club_id left empty`);
    }
    const venueName = canonicalVenue(r.venue);
    const venueSlug = venueName ? VENUES[venueName] : null;
    if (!venueSlug || !venueSlugs.has(venueSlug)) {
      miss(`G3 round ${round}: venue "${r.venue}" not in venues; public_venue_id left empty`);
    }

    let status = "scheduled";
    let clubScore = null;
    let opponentScore = null;
    if (r.status === "completed") {
      const home = intOrNull(r.home_score);
      const away = intOrNull(r.away_score);
      if (home === null || away === null || home > 99 || away > 99) {
        miss(`G3 round ${round}: completed without valid scores; imported as scheduled`);
      } else {
        status = "completed";
        clubScore = side === "home" ? home : away;
        opponentScore = side === "home" ? away : home;
      }
    } else if (r.status !== "scheduled") {
      miss(`G3 round ${round}: status "${r.status}" not imported (left scheduled); set it in admin`);
    }

    // G5 has no match number: match by date, then check the opponent is in the title.
    const sameDay = videos.filter((v) => v.date === r.date);
    let video = null;
    if (sameDay.length === 1) {
      video = sameDay[0];
      if (!(video.video_title ?? "").includes(opponent)) {
        miss(`G5 ${video.date}: title "${video.video_title}" does not name ${opponent}; not linked`);
        video = null;
      } else if (video.round && intOrNull(video.round) !== round) {
        miss(`G5 ${video.date}: round ${video.round} != fixture round ${round}; not linked`);
        video = null;
      } else if (!video.videoId) {
        miss(`G5 ${video.date}: "${video.video_url}" has no YouTube id; not linked`);
        video = null;
      }
    } else if (sameDay.length > 1) {
      miss(`G5 ${r.date}: ${sameDay.length} videos on the same day; not linked`);
    }
    if (video) usedVideos.add(video);

    const endsAt = plusMinutesTaipei(startsAt, FIRST_TEAM_MATCH_MINUTES);
    rows.push({
      round,
      startsAt,
      endsAt,
      title: `台企甲 第${round}輪 vs ${opponent}`,
      opponent,
      opponentSlug: opponentSlug && clubSlugs.has(opponentSlug) ? opponentSlug : null,
      side,
      venueSlug: venueSlug && venueSlugs.has(venueSlug) ? venueSlug : null,
      location: venueName ?? (r.venue || null),
      status,
      clubScore,
      opponentScore,
      replayUrl: video ? video.video_url : null,
      replayVideoId: video ? video.videoId : null,
      videoTitle: video ? video.video_title.slice(0, 300) : null,
    });
  }
  for (const v of videos) {
    if (!usedVideos.has(v)) miss(`G5 line ${v._line}: ${v.date} "${v.video_title}" matched no fixture`);
  }
  return rows;
}

function buildStandings(clubSlugs) {
  const rows = [];
  for (const r of readCsv("G4-standings.csv")) {
    const slug = CLUBS[r.club]?.slug;
    if (!slug || !clubSlugs.has(slug)) {
      miss(`G4 line ${r._line}: club "${r.club}" not in clubs; skipped`);
      continue;
    }
    const n = {};
    for (const key of ["after_round", "position", "played", "won", "drawn", "lost", "goals_for", "goals_against", "points"]) {
      n[key] = intOrNull(r[key]);
    }
    if (Object.values(n).some((value) => value === null) || n.won + n.drawn + n.lost !== n.played) {
      miss(`G4 line ${r._line}: ${r.club} round ${r.after_round} numbers invalid; skipped`);
      continue;
    }
    // Round 1 was computed by the researcher from CTFA scores (not published by CTFA).
    const official = !/非官方|自行計算/.test(r.notes ?? "");
    rows.push({
      slug,
      ...n,
      is_official: official,
      source_url: httpsOrNull(r.source_url),
      fetched_at: /^\d{4}-\d{2}-\d{2}$/.test(r.retrieved_at) ? `${r.retrieved_at}T00:00:00+08:00` : null,
    });
  }
  const unofficialRounds = [...new Set(rows.filter((row) => !row.is_official).map((row) => row.after_round))];
  if (unofficialRounds.length) note(`G4: round(s) ${unofficialRounds.join(", ")} marked unofficial (is_official = false)`);
  return rows;
}

function checkCompetitions() {
  const rows = readCsv("G6-competitions.csv");
  const current = rows.filter((r) => normalizeSeason(r.season) === SEASON && /企業甲級/.test(r.name_zh));
  if (current.length !== 1) {
    miss(`G6: expected one 2026/27 TFPL row, found ${current.length}`);
  } else {
    note(`G6: 2026/27 TFPL = existing competition '${COMPETITION_SLUG}' (seeded by migration); ${rows.length - 1} history rows not imported`);
  }
}

// --- SQL --------------------------------------------------------------------------------------

function sql({ venues, clubs, fixtures, standings }) {
  const out = [];
  const venueCols = ["slug", "name_zh", "name_en", "address_zh", "address_en", "lat", "lng", "map_url", "transit_zh", "parking_zh", "accessibility_zh", "capacity", "surface"];
  const venueUpd = venueCols.filter((c) => c !== "slug");
  const clubCols = ["slug", "name_zh", "name_ja", "name_en", "short_zh", "short_en", "abbr", "home_venue_id", "website_url", "instagram_url", "facebook_url", "youtube_url", "is_self"];
  const clubUpd = clubCols.filter((c) => c !== "slug");
  const standCols = ["rank", "played", "won", "drawn", "lost", "goals_for", "goals_against", "points", "is_official", "source_url", "fetched_at"];

  out.push(`-- Futuro 2026/27 reference data and first-team fixtures for the official site.
-- Staging only. Do not run against production.
-- GENERATED by scripts/import-futuro-data.mjs from data/futuro/*.csv. Do not edit by hand;
-- fix the CSV or the script and regenerate. How to apply: docs/futuro-data-import.md.
--
-- Idempotent: clubs and venues upsert by slug (a value in the CSV wins; an empty CSV cell keeps
-- what an admin entered), standings by (season, competition, round, club),
-- fixtures are matched by season + competition + round or by team + kickoff and only filled in,
-- never duplicated. Rows that did not change are not touched. A second run changes nothing.
-- Fixtures are imported unpublished (is_published = false) for an admin to review; they never
-- set training_sessions.venue_id (QR check-in).

begin;

do $$
begin
  if (select count(*) from public.teams where kind = 'competition_team' and layer_key = 'senior' and age_band = 'senior' and status = 'active') <> 1 then
    raise exception 'expected exactly one active senior first team (台中FUTURO 一線隊)';
  end if;
  if not exists (select 1 from public.seasons where label = ${q(SEASON)}) then
    raise exception 'season ${SEASON} missing (migration 20261009110000_site_public_api_v1.sql)';
  end if;
  if not exists (select 1 from public.competitions where slug = ${q(COMPETITION_SLUG)}) then
    raise exception 'competition ${COMPETITION_SLUG} missing (migration 20261009110000_site_public_api_v1.sql)';
  end if;
end
$$;
`);

  out.push(`-- Venues (${venues.length}) ---------------------------------------------------------------------`);
  out.push(`insert into public.public_venues (${venueCols.join(", ")})
values
${venues.map((v) => `  (${venueCols.map((c) => q(v[c])).join(", ")})`).join(",\n")}
on conflict (slug) do update set
${venueUpd.map((c) => `  ${c} = coalesce(excluded.${c}, public_venues.${c})`).join(",\n")}
where (${venueUpd.map((c) => `public_venues.${c}`).join(", ")})
  is distinct from (${venueUpd.map((c) => `coalesce(excluded.${c}, public_venues.${c})`).join(", ")});
`);

  out.push(`-- Clubs (${clubs.length}). crest_permission stays as set in admin (new rows: unknown); no crest paths. --`);
  out.push(`insert into public.clubs (${clubCols.join(", ")})
values
${clubs
  .map((c) => `  (${clubCols.map((col) => (col === "home_venue_id" ? venueRef(c.home_venue_slug) : q(c[col]))).join(", ")})`)
  .join(",\n")}
on conflict (slug) do update set
${clubUpd.map((c) => `  ${c} = coalesce(excluded.${c}, clubs.${c})`).join(",\n")}
where (${clubUpd.map((c) => `clubs.${c}`).join(", ")})
  is distinct from (${clubUpd.map((c) => `coalesce(excluded.${c}, clubs.${c})`).join(", ")});
`);

  out.push(`-- First-team fixtures, TFPL ${SEASON} (${fixtures.length}) ----------------------------------------------`);
  out.push(`create temporary table futuro_fixture_import (
  round_no integer primary key,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text not null,
  opponent text not null,
  opponent_club_slug text,
  side public.match_side not null,
  venue_slug text,
  location text,
  status public.match_public_status not null,
  club_score integer,
  opponent_score integer,
  replay_url text,
  replay_video_id text,
  video_title text
) on commit drop;

insert into futuro_fixture_import values
${fixtures
  .map(
    (f) =>
      `  (${[f.round, f.startsAt, f.endsAt, f.title, f.opponent, f.opponentSlug, f.side, f.venueSlug, f.location, f.status, f.clubScore, f.opponentScore, f.replayUrl, f.replayVideoId, f.videoTitle]
        .map(q)
        .join(", ")})`,
  )
  .join(",\n")};

do $$
declare
  v_team uuid := (select id from public.teams where kind = 'competition_team' and layer_key = 'senior' and age_band = 'senior' and status = 'active');
  v_season uuid := (select id from public.seasons where label = ${q(SEASON)});
  v_competition uuid := (select id from public.competitions where slug = ${q(COMPETITION_SLUG)});
  f record;
  v_session uuid;
  v_club uuid;
  v_venue uuid;
  v_created integer := 0;
  v_filled integer := 0;
begin
  for f in select * from futuro_fixture_import order by round_no loop
    v_club := (select id from public.clubs where slug = f.opponent_club_slug);
    v_venue := (select id from public.public_venues where slug = f.venue_slug);

    -- Same round of this season and competition, else same kickoff, for the first team.
    select s.id into v_session
    from public.training_sessions s
    join public.match_publications p on p.session_id = s.id
    where s.team_id = v_team
      and s.deleted_at is null
      and public.is_match_session_kind(s.kind)
      and (
        (p.season_id = v_season and p.competition_id = v_competition and p.round_no = f.round_no)
        or s.starts_at = f.starts_at
      )
    order by (p.round_no is not distinct from f.round_no) desc, s.created_at
    limit 1;

    if v_session is null then
      insert into public.training_sessions (team_id, title, kind, starts_at, ends_at, location)
      values (v_team, f.title, 'league', f.starts_at, f.ends_at, f.location)
      returning id into v_session;

      insert into public.match_publications (
        session_id, opponent, opponent_club_id, side, is_published, public_status,
        club_score, opponent_score, result_entered_at,
        public_venue_id, season_id, competition_id, round_no,
        replay_url, replay_video_id, video_title
      ) values (
        v_session, f.opponent, v_club, f.side, false, f.status,
        f.club_score, f.opponent_score, case when f.status = 'completed' then f.ends_at end,
        v_venue, v_season, v_competition, f.round_no,
        f.replay_url, f.replay_video_id, f.video_title
      );
      v_created := v_created + 1;
    else
      -- Existing match: only fill what is still empty; never overwrite admin edits.
      update public.match_publications p set
        opponent = coalesce(p.opponent, f.opponent),
        opponent_club_id = coalesce(p.opponent_club_id, v_club),
        public_venue_id = coalesce(p.public_venue_id, v_venue),
        season_id = coalesce(p.season_id, v_season),
        competition_id = coalesce(p.competition_id, v_competition),
        round_no = coalesce(p.round_no, f.round_no)
      where p.session_id = v_session
        and (
          (p.opponent is null and f.opponent is not null)
          or (p.opponent_club_id is null and v_club is not null)
          or (p.public_venue_id is null and v_venue is not null)
          or p.season_id is null or p.competition_id is null or p.round_no is null
        );
      if found then v_filled := v_filled + 1; end if;

      update public.match_publications p set
        public_status = 'completed',
        club_score = f.club_score,
        opponent_score = f.opponent_score,
        result_entered_at = f.ends_at
      where p.session_id = v_session
        and f.status = 'completed'
        and p.public_status = 'scheduled'
        and p.club_score is null;
      if found then v_filled := v_filled + 1; end if;

      update public.match_publications p set
        replay_url = f.replay_url,
        replay_video_id = f.replay_video_id,
        video_title = coalesce(p.video_title, f.video_title)
      where p.session_id = v_session
        and f.replay_video_id is not null
        and p.replay_video_id is null
        and p.replay_url is null;
      if found then v_filled := v_filled + 1; end if;
    end if;
  end loop;
  raise notice 'futuro fixtures: % created, % filled in', v_created, v_filled;
end
$$;
`);

  out.push(`-- Standings (${standings.length}) ------------------------------------------------------------------`);
  out.push(`insert into public.standings (season_id, competition_id, after_round, club_id, ${standCols.join(", ")})
select se.id, co.id, v.after_round, cl.id, ${standCols.map((c) => (c === "fetched_at" ? "v.fetched_at::timestamptz" : `v.${c}`)).join(", ")}
from (values
${standings
  .map(
    (s) =>
      `  (${[s.slug, s.after_round, s.position, s.played, s.won, s.drawn, s.lost, s.goals_for, s.goals_against, s.points, s.is_official, s.source_url, s.fetched_at]
        .map(q)
        .join(", ")})`,
  )
  .join(",\n")}
) as v(club_slug, after_round, rank, played, won, drawn, lost, goals_for, goals_against, points, is_official, source_url, fetched_at)
join public.clubs cl on cl.slug = v.club_slug
cross join (select id from public.seasons where label = ${q(SEASON)}) se
cross join (select id from public.competitions where slug = ${q(COMPETITION_SLUG)}) co
on conflict (season_id, competition_id, after_round, club_id) do update set
${standCols.map((c) => `  ${c} = excluded.${c}`).join(",\n")}
where (${standCols.map((c) => `standings.${c}`).join(", ")})
  is distinct from (${standCols.map((c) => `excluded.${c}`).join(", ")});
`);

  out.push(`commit;
`);
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function main() {
  const venues = buildVenues();
  const venueSlugs = new Set(venues.map((v) => v.slug));
  const clubs = buildClubs(venueSlugs);
  const clubSlugs = new Set(clubs.map((c) => c.slug));
  const videos = buildVideos();
  const fixtures = buildFixtures(clubSlugs, venueSlugs, videos);
  const standings = buildStandings(clubSlugs);
  checkCompetitions();

  const text = sql({ venues, clubs, fixtures, standings });
  const check = process.argv.includes("--check");
  if (check) {
    const current = readFileSync(OUT, "utf8");
    if (current !== text) {
      console.error(`${OUT} is stale; run node scripts/import-futuro-data.mjs`);
      process.exit(1);
    }
  } else {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, text);
  }

  console.log(`venues ${venues.length}, clubs ${clubs.length}, fixtures ${fixtures.length}, standings ${standings.length}`);
  console.log(`completed ${fixtures.filter((f) => f.status === "completed").length}, with replay ${fixtures.filter((f) => f.replayVideoId).length}`);
  for (const line of log) console.log(`note: ${line}`);
  for (const line of unmapped) console.log(`UNMAPPED: ${line}`);
  if (unmapped.length === 0) console.log("no unmapped rows");
  console.log(check ? `${OUT} is up to date` : `wrote ${OUT}`);
}

main();

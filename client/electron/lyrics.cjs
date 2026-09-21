const { LRCLIB, USER_AGENT } = require("./config.cjs");

const CACHE = new Map();
const CACHE_MAX = 200;

// Resultado negativo expira: uma letra publicada depois passa a aparecer sem
// precisar reiniciar o app.
const MISS_TTL_MS = 30 * 60 * 1000;

function cacheGet(key) {
  const entry = CACHE.get(key);
  if (!entry) return null;

  if (!entry.value.found && Date.now() - entry.at > MISS_TTL_MS) {
    CACHE.delete(key);
    return null;
  }

  return entry.value;
}

function cachePut(key, value) {
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  CACHE.set(key, { value, at: Date.now() });
}

async function lrclibGet(path, params) {
  const url = new URL(`${LRCLIB}${path}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(8000),
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`lrclib ${response.status}`);

  return response.json();
}

function pick(record) {
  if (!record) return null;

  return {
    synced: record.syncedLyrics || null,
    plain: record.plainLyrics || null,
    instrumental: Boolean(record.instrumental),
  };
}

async function find({ title, artist, album, durationSec }) {
  // 1) match exato, que e o que devolve letra sincronizada com mais precisao
  const exact = pick(
    await lrclibGet("/api/get", {
      track_name: title,
      artist_name: artist,
      album_name: album,
      duration: durationSec,
    })
  );

  if (exact?.synced || exact?.plain) return exact;

  // 2) fallback por busca: cobre remix, versao ao vivo, acentuacao diferente
  const results = await lrclibGet("/api/search", {
    track_name: title,
    artist_name: artist,
  });

  if (!Array.isArray(results) || results.length === 0) return null;

  const best = results
    .map((record) => ({
      record,
      hasSynced: Boolean(record.syncedLyrics),
      delta:
        durationSec && record.duration
          ? Math.abs(record.duration - durationSec)
          : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) =>
      a.hasSynced === b.hasSynced ? a.delta - b.delta : a.hasSynced ? -1 : 1
    )[0];

  return pick(best.record);
}

async function lookup({ trackId, title, artist, album, durationMs, type }) {
  if (!title || !artist) return { found: false, synced: null, plain: null };

  // Episodio de podcast nao tem letra: poupa uma ida ao lrclib por faixa.
  if (type === "episode") {
    return { found: false, synced: null, plain: null, instrumental: false };
  }

  const key = trackId || `${artist}::${title}`;
  const cached = cacheGet(key);
  if (cached) return { ...cached, cached: true };

  const lyrics = await find({
    title,
    artist,
    album,
    durationSec: durationMs ? Math.round(durationMs / 1000) : null,
  });

  const payload = lyrics
    ? { found: true, ...lyrics }
    : { found: false, synced: null, plain: null, instrumental: false };

  cachePut(key, payload);
  return payload;
}

module.exports = { lookup };

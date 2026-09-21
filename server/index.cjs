require("dotenv").config();

const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const SpotifyWebApi = require("spotify-web-api-node");

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT || 8888);
const HOST = "127.0.0.1"; // nunca 0.0.0.0: o token nao pode vazar na LAN
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

const REQUIRED = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "SPOTIFY_REDIRECT_URI",
];

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    `Variaveis de ambiente ausentes: ${missing.join(", ")}\n` +
      "Copie .env.example para .env e preencha antes de subir o servidor."
  );
  process.exit(1);
}

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

const SCOPES = ["user-read-currently-playing", "user-read-playback-state"];

const app = express();

// No app empacotado o renderer carrega via file://, e o Chromium manda
// `Origin: null`. Sem isso, toda chamada a API morre no build.
const ALLOW_FILE_ORIGIN = process.env.ALLOW_FILE_ORIGIN === "true";

app.use(
  cors({
    origin(origin, callback) {
      // Sem header Origin: processo nativo, curl, o proprio main do Electron.
      if (!origin) return callback(null, true);
      if (origin === CLIENT_ORIGIN) return callback(null, true);
      if (origin === "null" && ALLOW_FILE_ORIGIN) return callback(null, true);

      const err = new Error(`Origem nao permitida: ${origin}`);
      err.status = 403;
      return callback(err);
    },
  })
);

// ---------------------------------------------------------------------------
// Estado de autenticação
// ---------------------------------------------------------------------------

const auth = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0, // epoch ms
  pendingState: null,
};

function isAuthenticated() {
  return Boolean(auth.refreshToken);
}

function clearSession() {
  auth.accessToken = null;
  auth.refreshToken = null;
  auth.expiresAt = 0;
  spotifyApi.resetAccessToken();
  spotifyApi.resetRefreshToken();
}

function unauthorized(message = "Spotify nao autenticado") {
  const err = new Error(message);
  err.status = 401;
  return err;
}

function applyTokens({ access_token, refresh_token, expires_in }) {
  auth.accessToken = access_token;
  spotifyApi.setAccessToken(access_token);

  if (refresh_token) {
    auth.refreshToken = refresh_token;
    spotifyApi.setRefreshToken(refresh_token);
  }

  // Renova 60s antes de expirar, com margem de seguranca.
  auth.expiresAt = Date.now() + expires_in * 1000;
}

let refreshInFlight = null;

async function ensureFreshToken() {
  if (!isAuthenticated()) throw unauthorized();

  if (Date.now() < auth.expiresAt - 60_000) return;

  // Evita N renovacoes simultaneas quando varias rotas batem juntas.
  if (!refreshInFlight) {
    refreshInFlight = spotifyApi
      .refreshAccessToken()
      .then((data) => {
        applyTokens(data.body);
        console.log("Access token renovado.");
      })
      .catch((err) => {
        // invalid_grant = refresh token revogado ou expirado. Sem limpar a
        // sessao aqui, todo poll seguinte tenta renovar de novo para sempre e
        // o front nunca recebe 401 para mostrar o link de reconectar.
        console.error("Falha ao renovar token:", err.message);
        clearSession();
        throw unauthorized("Sessao do Spotify expirada. Faca login de novo.");
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  await refreshInFlight;
}

// ---------------------------------------------------------------------------
// Rotas de autenticação
// ---------------------------------------------------------------------------

app.get("/login", (req, res) => {
  auth.pendingState = crypto.randomBytes(16).toString("hex");
  res.redirect(spotifyApi.createAuthorizeURL(SCOPES, auth.pendingState));
});

app.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Autorizacao negada: ${error}`);
  }

  // Protege contra CSRF no fluxo OAuth.
  if (!state || state !== auth.pendingState) {
    return res.status(400).send("State invalido. Reinicie o login.");
  }

  auth.pendingState = null;

  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    applyTokens(data.body);

    console.log("Spotify conectado.");
    res.send("Spotify conectado com sucesso. Pode fechar esta aba.");
  } catch (err) {
    console.error("Falha no authorizationCodeGrant:", err.message);
    res.status(500).send("Erro ao autenticar com Spotify.");
  }
});

app.get("/api/status", (req, res) => {
  res.json({
    authenticated: isAuthenticated(),
    expiresIn: isAuthenticated()
      ? Math.max(0, Math.round((auth.expiresAt - Date.now()) / 1000))
      : 0,
  });
});

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

function normalizePlayback(body) {
  if (!body || !body.item) {
    return { playing: false, track: null };
  }

  const item = body.item;

  // Episodio de podcast nao tem `artists`, tem `show`. Faixa local pode vir
  // com `id: null`. Os dois quebravam o normalize e derrubavam todo poll.
  const artists = Array.isArray(item.artists) ? item.artists : [];
  const showName = item.show?.name ?? "";

  return {
    playing: Boolean(body.is_playing),
    fetchedAt: Date.now(),
    progressMs: body.progress_ms ?? 0,
    type: item.type ?? "track",
    track: {
      id: item.id ?? null,
      title: item.name ?? "",
      artist: artists.map((a) => a.name).join(", ") || showName,
      primaryArtist: artists[0]?.name ?? showName,
      album: item.album?.name ?? item.show?.name ?? "",
      image: item.album?.images?.[0]?.url ?? item.images?.[0]?.url ?? null,
      durationMs: item.duration_ms ?? 0,
    },
  };
}

app.get("/api/now-playing", async (req, res) => {
  try {
    await ensureFreshToken();

    const data = await spotifyApi.getMyCurrentPlaybackState();
    res.json(normalizePlayback(data.body));
  } catch (err) {
    // 429 do Spotify traz Retry-After; repassa para o cliente respeitar.
    if (err.statusCode === 429) {
      const retryAfter = err.headers?.["retry-after"] ?? 5;
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ error: "Rate limit", retryAfter });
    }

    const status = err.status || err.statusCode || 500;
    if (status !== 401) console.error("now-playing:", err.message);
    res.status(status).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Letras (lrclib)
// ---------------------------------------------------------------------------

const LRC_CACHE = new Map();
const LRC_CACHE_MAX = 200;

const lrclib = axios.create({
  baseURL: "https://lrclib.net",
  timeout: 8000,
  headers: {
    // O lrclib pede identificacao do cliente.
    "User-Agent": "spotify-pip-lyrics (https://github.com/Alvaromra/spotify-pip-lyrics)",
  },
});

function cachePut(key, value) {
  if (LRC_CACHE.size >= LRC_CACHE_MAX) {
    LRC_CACHE.delete(LRC_CACHE.keys().next().value);
  }
  LRC_CACHE.set(key, value);
}

function pickLyrics(record) {
  if (!record) return null;

  return {
    synced: record.syncedLyrics || null,
    plain: record.plainLyrics || null,
    instrumental: Boolean(record.instrumental),
  };
}

async function findLyrics({ title, artist, album, durationSec }) {
  // 1) match exato: e o que devolve syncedLyrics com mais precisao
  try {
    const { data } = await lrclib.get("/api/get", {
      params: {
        track_name: title,
        artist_name: artist,
        album_name: album || undefined,
        duration: durationSec || undefined,
      },
    });

    const exact = pickLyrics(data);
    if (exact?.synced || exact?.plain) return exact;
  } catch (err) {
    if (err.response?.status !== 404) throw err;
  }

  // 2) fallback por busca: cobre remixes, edicoes ao vivo, acentuacao diferente
  const { data: results } = await lrclib.get("/api/search", {
    params: { track_name: title, artist_name: artist },
  });

  if (!Array.isArray(results) || results.length === 0) return null;

  // Prefere resultado com letra sincronizada e duracao proxima.
  const scored = results
    .map((r) => ({
      record: r,
      hasSynced: Boolean(r.syncedLyrics),
      delta:
        durationSec && r.duration
          ? Math.abs(r.duration - durationSec)
          : Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => {
      if (a.hasSynced !== b.hasSynced) return a.hasSynced ? -1 : 1;
      return a.delta - b.delta;
    });

  return pickLyrics(scored[0].record);
}

app.get("/api/lyrics", async (req, res) => {
  const { trackId, title, artist, album, durationMs } = req.query;

  if (!title || !artist) {
    return res
      .status(400)
      .json({ error: "Parametros obrigatorios: title, artist" });
  }

  const cacheKey = trackId || `${artist}::${title}`;

  if (LRC_CACHE.has(cacheKey)) {
    return res.json({ ...LRC_CACHE.get(cacheKey), cached: true });
  }

  try {
    const lyrics = await findLyrics({
      title,
      artist,
      album,
      durationSec: durationMs ? Math.round(Number(durationMs) / 1000) : null,
    });

    const payload = lyrics
      ? { found: true, ...lyrics }
      : { found: false, synced: null, plain: null, instrumental: false };

    cachePut(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    console.error("lyrics:", err.message);
    res.status(502).json({ error: "Falha ao consultar o provedor de letras" });
  }
});

// ---------------------------------------------------------------------------

// Erros do CORS e afins viram JSON, nao stack trace em HTML.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  if (status >= 500) console.error("erro nao tratado:", err.message);
  res.status(status).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Servidor em http://${HOST}:${PORT}`);
  console.log(`Faca login em http://${HOST}:${PORT}/login`);
});

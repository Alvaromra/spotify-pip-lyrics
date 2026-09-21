const { API } = require("./config.cjs");
const auth = require("./auth.cjs");

async function apiGet(path) {
  const token = await auth.accessToken();

  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // 204 = nada tocando agora. Nao e erro.
  if (response.status === 204) return null;

  if (response.status === 429) {
    const err = new Error("rate limit");
    err.status = 429;
    err.retryAfter = Number(response.headers.get("retry-after") || 5);
    throw err;
  }

  if (response.status === 401) {
    const err = new Error("sessao expirada");
    err.status = 401;
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`spotify ${response.status}`);
    err.status = response.status;
    throw err;
  }

  return response.json();
}

function normalize(body) {
  if (!body || !body.item) return { playing: false, track: null };

  const item = body.item;

  // Episodio de podcast nao tem `artists`, tem `show`. Faixa local vem com id
  // nulo. Os dois derrubavam o normalize antigo.
  const artists = Array.isArray(item.artists) ? item.artists : [];
  const showName = item.show?.name ?? "";

  return {
    playing: Boolean(body.is_playing),
    progressMs: body.progress_ms ?? 0,
    type: item.type ?? "track",
    track: {
      id: item.id ?? null,
      title: item.name ?? "",
      artist: artists.map((a) => a.name).join(", ") || showName,
      primaryArtist: artists[0]?.name ?? showName,
      album: item.album?.name ?? showName,
      image: item.album?.images?.[0]?.url ?? item.images?.[0]?.url ?? null,
      durationMs: item.duration_ms ?? 0,
    },
  };
}

async function nowPlaying() {
  // additional_types=episode: sem isso o Spotify devolve item nulo em podcast.
  const body = await apiGet("/me/player?additional_types=track,episode");
  return normalize(body);
}

module.exports = { nowPlaying };

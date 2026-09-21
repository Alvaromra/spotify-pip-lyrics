// Client ID e informacao publica: aparece na URL de autorizacao e pode ser
// commitado. O Client Secret nao existe mais neste projeto: o fluxo PKCE
// dispensa segredo, que e o unico jeito honesto de distribuir um app desktop.
//
// Preencha CLIENT_ID com o valor do seu app em
// https://developer.spotify.com/dashboard
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";

// Precisa estar cadastrado identico no dashboard do Spotify.
const REDIRECT_PORT = 8888;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

const SCOPES = ["user-read-currently-playing", "user-read-playback-state"];

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const LRCLIB = "https://lrclib.net";

const USER_AGENT =
  "spotify-pip-lyrics (https://github.com/Alvaromra/spotify-pip-lyrics)";

module.exports = {
  CLIENT_ID,
  REDIRECT_PORT,
  REDIRECT_URI,
  SCOPES,
  ACCOUNTS,
  API,
  LRCLIB,
  USER_AGENT,
};

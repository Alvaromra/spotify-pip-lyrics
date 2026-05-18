const express = require("express");
const SpotifyWebApi = require("spotify-web-api-node");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());

const spotifyApi = new SpotifyWebApi({
  clientId: "6ef6d7f786a04013b22c2c1796322392",
  clientSecret: "543439b129fb4532969ee372cd9341e4",
  redirectUri: "http://127.0.0.1:8888/callback",
});

const scopes = [
  "user-read-currently-playing",
  "user-read-playback-state",
];

let authenticated = false;

app.get("/login", (req, res) => {
  const authorizeURL =
    spotifyApi.createAuthorizeURL(scopes);

  res.redirect(authorizeURL);
});

app.get("/callback", async (req, res) => {
  try {
    const code = req.query.code;

    const data =
      await spotifyApi.authorizationCodeGrant(code);

    spotifyApi.setAccessToken(
      data.body.access_token
    );

    spotifyApi.setRefreshToken(
      data.body.refresh_token
    );

    authenticated = true;

    console.log("Spotify conectado.");

    res.send("Spotify conectado com sucesso.");
  } catch (err) {
    console.error(err);

    res.status(500).send(
      "Erro ao autenticar com Spotify."
    );
  }
});

app.get("/current", async (req, res) => {
  try {
    if (!authenticated) {
      return res.status(401).json({
        error: "Spotify não autenticado",
      });
    }

    const data =
      await spotifyApi.getMyCurrentPlaybackState();

    res.json(data.body);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.get("/lyrics", async (req, res) => {
  try {
    if (!authenticated) {
      return res.status(401).json({
        error: "Spotify não autenticado",
      });
    }

    const playback =
      await spotifyApi.getMyCurrentPlaybackState();

    const item = playback.body.item;

    if (!item) {
      return res.status(404).json({
        error: "Nenhuma música tocando",
      });
    }

    const track = item.name;

    const artist = item.artists[0].name;

    const response = await axios.get(
      "https://lrclib.net/api/get",
      {
        params: {
          track_name: track,
          artist_name: artist,
        },
      }
    );

    res.json({
      track,
      artist,
      lyrics: response.data.syncedLyrics,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(8888, "0.0.0.0", () => {
  console.log("Servidor rodando:");
  console.log("http://localhost:8888/login");
});
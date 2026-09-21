const crypto = require("node:crypto");
const http = require("node:http");
const { shell } = require("electron");

const {
  CLIENT_ID,
  REDIRECT_PORT,
  REDIRECT_URI,
  SCOPES,
  ACCOUNTS,
} = require("./config.cjs");

const tokenStore = require("./tokenStore.cjs");

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

function base64url(buffer) {
  return buffer.toString("base64url");
}

function createVerifier() {
  // 32 bytes em base64url dao 43 caracteres, o minimo que a RFC 7636 exige.
  return base64url(crypto.randomBytes(32));
}

function challengeFor(verifier) {
  return base64url(crypto.createHash("sha256").update(verifier).digest());
}

// ---------------------------------------------------------------------------
// Estado da sessao
// ---------------------------------------------------------------------------

const session = {
  accessToken: null,
  refreshToken: null,
  expiresAt: 0,
};

// O safeStorage so decifra depois do `ready`. Ler o token na carga do modulo,
// antes disso, devolvia o conteudo cifrado como se fosse texto: o refresh
// falhava com lixo e a sessao era apagada. Por isso a leitura e preguicosa, e
// o main chama init() dentro do whenReady.
let loaded = false;

function init() {
  if (loaded) return;
  loaded = true;
  session.refreshToken = tokenStore.load();
}

function isConfigured() {
  return Boolean(CLIENT_ID);
}

function isAuthenticated() {
  init();
  return Boolean(session.refreshToken);
}

function clearSession() {
  session.accessToken = null;
  session.refreshToken = null;
  session.expiresAt = 0;
  tokenStore.clear();
}

function applyTokens(body) {
  session.accessToken = body.access_token;
  session.expiresAt = Date.now() + body.expires_in * 1000;

  // No fluxo PKCE o Spotify rotaciona o refresh token a cada renovacao. Se o
  // novo nao for gravado, a proxima renovacao falha com invalid_grant.
  if (body.refresh_token) {
    session.refreshToken = body.refresh_token;
    tokenStore.save(body.refresh_token);
  }
}

async function postToken(params) {
  const response = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params }),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err = new Error(body.error_description || body.error || "token_error");
    err.code = body.error;
    throw err;
  }

  return body;
}

// ---------------------------------------------------------------------------
// Login: navegador do sistema + servidor loopback efemero
// ---------------------------------------------------------------------------

let loginInFlight = null;

function login() {
  if (loginInFlight) return loginInFlight;

  if (!isConfigured()) {
    return Promise.reject(
      new Error("CLIENT_ID nao configurado. Veja client/electron/config.cjs.")
    );
  }

  const verifier = createVerifier();
  const state = base64url(crypto.randomBytes(16));

  loginInFlight = new Promise((resolve, reject) => {
    let settled = false;
    let timeout = null;

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, REDIRECT_URI);

      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }

      const reply = (message) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:40px">${message}</body>`
        );
      };

      try {
        if (url.searchParams.get("error")) {
          throw new Error(url.searchParams.get("error"));
        }

        if (url.searchParams.get("state") !== state) {
          throw new Error("state invalido");
        }

        const body = await postToken({
          grant_type: "authorization_code",
          code: url.searchParams.get("code"),
          redirect_uri: REDIRECT_URI,
          code_verifier: verifier,
        });

        applyTokens(body);

        reply("<h2>Conectado.</h2><p>Pode fechar esta aba.</p>");
        finish(null);
      } catch (err) {
        reply(`<h2>Falha no login.</h2><p>${err.message}</p>`);
        finish(err);
      }
    });

    function finish(err) {
      if (settled) return;
      settled = true;

      clearTimeout(timeout);
      server.close();
      loginInFlight = null;

      if (err) reject(err);
      else resolve();
    }

    server.on("error", finish);

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      const authorize = new URL(`${ACCOUNTS}/authorize`);

      authorize.search = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(" "),
        state,
        code_challenge_method: "S256",
        code_challenge: challengeFor(verifier),
      }).toString();

      // Abre no navegador do sistema: o usuario ve a barra de endereco real do
      // Spotify, em vez de digitar a senha dentro de uma janela do app.
      shell.openExternal(authorize.toString());

      // Sem isso o servidor ficaria de pe para sempre se o login for abandonado.
      timeout = setTimeout(
        () => finish(new Error("Tempo esgotado para concluir o login.")),
        5 * 60 * 1000
      );
    });
  });

  return loginInFlight;
}

// ---------------------------------------------------------------------------
// Access token sempre fresco
// ---------------------------------------------------------------------------

let refreshInFlight = null;

async function accessToken() {
  if (!isAuthenticated()) {
    const err = new Error("nao autenticado");
    err.status = 401;
    throw err;
  }

  if (session.accessToken && Date.now() < session.expiresAt - 60_000) {
    return session.accessToken;
  }

  if (!refreshInFlight) {
    refreshInFlight = postToken({
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    })
      .then((body) => {
        applyTokens(body);
        return session.accessToken;
      })
      .catch((err) => {
        console.error("Falha ao renovar token:", err.message);

        // So invalid_grant significa refresh revogado. Rede fora, DNS, timeout
        // ou 5xx do Spotify sao transitorios: apagar a sessao nesses casos
        // deslogaria o usuario so por abrir o app sem internet.
        if (err.code === "invalid_grant") {
          clearSession();

          const wrapped = new Error("sessao expirada");
          wrapped.status = 401;
          throw wrapped;
        }

        const transient = new Error("falha temporaria ao renovar o token");
        transient.status = 503;
        throw transient;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

function logout() {
  clearSession();
}

module.exports = { init, login, logout, accessToken, isAuthenticated, isConfigured };

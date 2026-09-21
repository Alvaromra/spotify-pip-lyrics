const fs = require("node:fs");
const path = require("node:path");
const { app, safeStorage } = require("electron");

// O refresh token vai para o disco cifrado pelo safeStorage, que usa o
// Keychain no macOS, a DPAPI no Windows e o keyring no Linux. Onde nao houver
// backend disponivel, grava em texto com permissao 0600 e avisa no log.
function filePath() {
  return path.join(app.getPath("userData"), "session.bin");
}

function save(refreshToken) {
  try {
    if (!refreshToken) return clear();

    const encrypted = safeStorage.isEncryptionAvailable();

    const payload = encrypted
      ? safeStorage.encryptString(refreshToken)
      : Buffer.from(refreshToken, "utf8");

    if (!encrypted) {
      console.warn(
        "safeStorage indisponivel: refresh token gravado sem cifra, com permissao 0600."
      );
    }

    fs.writeFileSync(filePath(), payload, { mode: 0o600 });
  } catch (err) {
    console.error("Falha ao gravar a sessao:", err.message);
  }
}

function load() {
  try {
    const buffer = fs.readFileSync(filePath());

    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buffer)
      : buffer.toString("utf8");
  } catch {
    // Arquivo ausente, corrompido ou cifrado por outro usuario do sistema.
    return null;
  }
}

function clear() {
  try {
    fs.rmSync(filePath(), { force: true });
  } catch (err) {
    console.error("Falha ao limpar a sessao:", err.message);
  }
}

module.exports = { save, load, clear };

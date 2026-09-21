import { useCallback, useEffect, useRef, useState } from "react";

import { parseLrc, findLineIndex } from "./lib/lrc";
import "./App.css";

const POLL_MS = 3000; // 1s era desnecessario e queimava rate limit
const VOICE_THRESHOLD = 28;

const ACCENTS = [
  "30,215,96",
  "255,0,110",
  "0,200,255",
  "255,140,0",
  "180,0,255",
  "255,60,60",
];

const overlay = typeof window !== "undefined" ? window.overlay : null;
const isElectron = Boolean(overlay?.isElectron);

function App() {
  const [track, setTrack] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [lyrics, setLyrics] = useState([]);
  const [plainLyrics, setPlainLyrics] = useState("");
  // idle|loading|ok|unsynced|instrumental|none
  const [lyricsState, setLyricsState] = useState("idle");
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [authError, setAuthError] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [karaoke, setKaraoke] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [judgement, setJudgement] = useState("");

  // Refs de alta frequencia: mudam a 60fps e nao devem disparar render.
  const clockRef = useRef({ progressMs: 0, syncedAt: 0, playing: false });
  const lyricsRef = useRef([]);
  const voiceRef = useRef(0);
  const sustainRef = useRef(0);
  const stableRef = useRef(0);
  const lastHitRef = useRef({ line: -1, at: 0 });
  const karaokeRef = useRef(false);
  const trackIdRef = useRef(null);
  const rafRef = useRef(null);
  const progressBarRef = useRef(null);
  const judgementTimerRef = useRef(null);

  useEffect(() => {
    lyricsRef.current = lyrics;
  }, [lyrics]);

  useEffect(() => {
    karaokeRef.current = karaoke;
  }, [karaoke]);

  const flashJudgement = useCallback((text, ms = 700) => {
    setJudgement(text);
    clearTimeout(judgementTimerRef.current);
    judgementTimerRef.current = setTimeout(() => setJudgement(""), ms);
  }, []);

  // -------------------------------------------------------------------------
  // Karaoke on/off
  // -------------------------------------------------------------------------

  // O updater do useState tem que ser puro: em StrictMode o React 19 chama a
  // funcao duas vezes, entao o IPC daqui de dentro disparava em dobro. E
  // quando o toggle vinha do main via hotkey, ecoava de volta para o main.
  const toggleKaraoke = useCallback((forced = null) => {
    setKaraoke((prev) => (forced !== null ? forced : !prev));
  }, []);

  useEffect(() => {
    if (!karaoke) {
      setCombo(0);
      setJudgement("");
    }
  }, [karaoke]);

  // Sincroniza o main apenas quando a mudanca nasceu aqui, nunca no eco.
  const karaokeFromMain = useRef(false);

  useEffect(() => {
    if (karaokeFromMain.current) {
      karaokeFromMain.current = false;
      return;
    }

    overlay?.setKaraoke(karaoke);
  }, [karaoke]);

  useEffect(() => {
    if (!overlay) return;
    // O preload devolve o unsubscribe, entao nao precisamos de removeAllListeners.
    return overlay.onKaraokeToggle((enabled) => {
      karaokeFromMain.current = true;
      toggleKaraoke(enabled);
    });
  }, [toggleKaraoke]);

  // -------------------------------------------------------------------------
  // Polling do Spotify: efeito com deps vazias, sem recriar o intervalo
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    async function loadLyrics(t) {
      setLyricsState("loading");
      setLyrics([]);
      setPlainLyrics("");
      setCurrentIndex(-1);

      try {
        const data = await overlay.lyrics({
          trackId: t.id,
          title: t.title,
          artist: t.primaryArtist || t.artist,
          album: t.album,
          durationMs: t.durationMs,
          type: t.type,
        });

        if (cancelled) return;

        if (!data.ok) {
          setLyricsState("none");
          return;
        }

        // syncedLyrics pode vir null: cai para a letra sem tempo em vez de
        // deixar a tela travada em "...".
        const parsed = parseLrc(data.synced);

        if (parsed.length > 0) {
          setLyrics(parsed);
          setLyricsState("ok");
        } else if (data.plain) {
          // Sem marcas de tempo nao da para sincronizar. O codigo anterior
          // inventava 4s por linha, entao a letra rolava sozinha sem relacao
          // com a musica. Melhor mostrar o texto inteiro e avisar.
          setPlainLyrics(data.plain.trim());
          setLyricsState("unsynced");
        } else {
          setLyricsState(data.instrumental ? "instrumental" : "none");
        }
      } catch {
        if (!cancelled) {
          setPlainLyrics("");
          setLyricsState("none");
        }
      }
    }

    async function poll() {
      try {
        const data = await overlay.nowPlaying();
        if (cancelled) return;

        if (!data.ok) {
          if (data.status === 401) {
            setAuthError(true);
          } else if (data.status === 429) {
            // Respeita o Retry-After antes de voltar ao ritmo normal.
            clearInterval(timer);
            setTimeout(() => {
              if (!cancelled) timer = setInterval(poll, POLL_MS);
            }, (data.retryAfter ?? 5) * 1000);
          }
          return;
        }

        setAuthError(false);

        if (!data.track) {
          setTrack(null);
          setPlaying(false);
          trackIdRef.current = null;
          clockRef.current.playing = false;
          return;
        }

        // Ancora do relogio local: sabemos o progresso e o instante da leitura.
        clockRef.current = {
          progressMs: data.progressMs,
          syncedAt: Date.now(),
          playing: data.playing,
        };

        setPlaying(data.playing);
        setTrack(data.track);

        const trackKey = data.track.id ?? `${data.track.artist}::${data.track.title}`;

        if (trackKey !== trackIdRef.current) {
          trackIdRef.current = trackKey;

          // Faixa local vem com id null: cai para o titulo.
          const seed = data.track.id ?? data.track.title ?? "";
          const hash = [...seed].reduce((a, c) => a + c.charCodeAt(0), 0);
          setAccent(ACCENTS[hash % ACCENTS.length]);

          setCombo(0);
          lastHitRef.current = { line: -1, at: 0 };

          // Busca a letra apenas quando a musica troca, nao a cada poll.
          loadLyrics(data.track);
        }
      } catch (err) {
        if (!cancelled) console.warn("Falha no poll:", err.message);
      }
    }

    if (!overlay) return undefined;

    overlay.status().then((status) => {
      if (cancelled) return;
      setConfigured(status.configured);
      setAuthError(!status.authenticated);
    });

    poll();
    timer = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Microfone: aberto somente com o karaoke ligado, e liberado ao desligar
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (!karaoke) {
      voiceRef.current = 0;
      setVoiceLevel(0);
      return;
    }

    let stream = null;
    let audioCtx = null;
    let raf = null;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;

        audioCtx = new AudioContext();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        audioCtx.createMediaStreamSource(stream).connect(analyser);

        const buffer = new Uint8Array(analyser.frequencyBinCount);
        let lastUiUpdate = 0;

        const tick = () => {
          analyser.getByteFrequencyData(buffer);

          let sum = 0;
          for (let i = 0; i < buffer.length; i++) sum += buffer[i];
          const level = (sum / buffer.length) * 1.4;

          voiceRef.current = level;

          if (level > VOICE_THRESHOLD) {
            sustainRef.current += 16;
            stableRef.current += 1;
          } else {
            sustainRef.current = 0;
            stableRef.current = 0;
          }

          // Atualiza a UI a ~15fps em vez de 60: o numero na tela nao precisa
          // de mais que isso e cada setState aqui rerenderizava o App inteiro.
          const now = performance.now();
          if (now - lastUiUpdate > 66) {
            lastUiUpdate = now;
            setVoiceLevel(level);
          }

          raf = requestAnimationFrame(tick);
        };

        tick();
      } catch (err) {
        console.warn("Microfone indisponivel:", err.message);
      }
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      audioCtx?.close();
    };
  }, [karaoke]);

  // -------------------------------------------------------------------------
  // Loop de sincronia e pontuação
  // -------------------------------------------------------------------------

  useEffect(() => {
    const loop = () => {
      const clock = clockRef.current;
      const lines = lyricsRef.current;

      // Com a musica pausada o relogio congela. Antes o progresso continuava
      // avancando localmente e a letra rolava sozinha.
      const elapsed = clock.playing ? Date.now() - clock.syncedAt : 0;
      const positionMs = clock.progressMs + elapsed;

      if (progressBarRef.current && track?.durationMs) {
        const pct = Math.min((positionMs / track.durationMs) * 100, 100);
        progressBarRef.current.style.width = `${pct}%`;
      }

      if (lines.length > 0) {
        const index = findLineIndex(lines, positionMs / 1000);
        setCurrentIndex((prev) => (prev === index ? prev : index));

        if (karaokeRef.current && clock.playing && index >= 0) {
          scoreLine(lines, index, positionMs / 1000);
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    function scoreLine(lines, index, seconds) {
      const line = lines[index];
      const next = lines[index + 1];
      if (!line || !next || line.unsynced) return;

      const offset = Math.abs(seconds - line.time);
      const singing = voiceRef.current > VOICE_THRESHOLD;
      const sustained = sustainRef.current > 500;
      const cooled = Date.now() - lastHitRef.current.at > 1400;
      const fresh = lastHitRef.current.line !== index;

      if (singing && sustained && fresh && cooled && stableRef.current > 5 && offset < 0.6) {
        setCombo((c) => c + 1);
        setScore((s) => s + 120);
        flashJudgement("PERFECT");
        lastHitRef.current = { line: index, at: Date.now() };
      } else if (singing && sustained && fresh && cooled && offset < 1.2) {
        setCombo((c) => c + 1);
        setScore((s) => s + 70);
        flashJudgement("GOOD");
        lastHitRef.current = { line: index, at: Date.now() };
      } else if (seconds > next.time && fresh) {
        setCombo(0);
        flashJudgement("MISS");
        lastHitRef.current = { line: index, at: lastHitRef.current.at };
      }
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [track?.durationMs, flashJudgement]);

  useEffect(() => () => clearTimeout(judgementTimerRef.current), []);

  // -------------------------------------------------------------------------

  const lineAt = (offset) => lyrics[currentIndex + offset]?.text ?? "...";

  const statusMessage = {
    loading: "Buscando letra...",
    none: "Letra nao encontrada.",
    instrumental: "Faixa instrumental.",
  }[lyricsState];

  return (
    <div className="container" style={{ "--accent": accent }}>
      <div className="drag-bar">Spotify Karaoke Overlay</div>

      {!isElectron && (
        <div className="karaoke-button-wrapper">
          <button
            className={karaoke ? "karaoke-button active" : "karaoke-button"}
            onClick={() => toggleKaraoke()}
          >
            <span className="karaoke-icon">{karaoke ? "🎤" : "🎵"}</span>
            <span className="karaoke-text">
              {karaoke ? "Karaoke ON" : "Enable Karaoke"}
            </span>
            <span className="karaoke-status">{karaoke ? "LIVE" : "READY"}</span>
          </button>
        </div>
      )}

      {!isElectron && (
        <div className="karaoke-line">
          Abra pelo aplicativo: a conexao com o Spotify roda no processo
          principal do Electron.
        </div>
      )}

      {isElectron && !configured && (
        <div className="karaoke-line">
          Falta o Client ID. Preencha em client/electron/config.cjs ou exporte
          SPOTIFY_CLIENT_ID.
        </div>
      )}

      {isElectron && configured && authError && (
        <div className="karaoke-line">
          Conta do Spotify desconectada.{" "}
          <button
            className="karaoke-button"
            disabled={connecting}
            onClick={async () => {
              setConnecting(true);
              const result = await overlay.login();
              setConnecting(false);
              if (result.ok) setAuthError(false);
            }}
          >
            {connecting ? "Aguardando o navegador..." : "Conectar"}
          </button>
        </div>
      )}

      {track ? (
        <>
          {track.image && (
            <img
              src={track.image}
              alt={`Capa de ${track.title}`}
              className="album-art"
            />
          )}

          <h1 className="track-name">{track.title}</h1>
          <h2 className="artist-name">{track.artist}</h2>

          {karaoke && (
            <div className="score-container">
              <div>🎤 Voice {Math.floor(voiceLevel)}</div>
              <div>🔥 Combo {combo}</div>
              <div>⭐ Score {score}</div>
            </div>
          )}

          {karaoke && <div className="judgement">{judgement}</div>}

          <div className="progress-container">
            <div ref={progressBarRef} className="progress-bar" />
          </div>

          <div className="lyrics-container">
            {lyricsState === "unsynced" ? (
              <div className="plain-lyrics">
                <span className="plain-lyrics-badge">Letra sem sincronia</span>
                <pre>{plainLyrics}</pre>
              </div>
            ) : statusMessage ? (
              <div className="karaoke-line">{statusMessage}</div>
            ) : (
              <>
                <div className="previous-line">{lineAt(-1)}</div>
                <div
                  className={
                    karaoke ? "karaoke-line karaoke-active" : "karaoke-line"
                  }
                  style={{
                    transform: `scale(${1 + Math.min(voiceLevel / 500, 0.08)})`,
                  }}
                >
                  {lineAt(0)}
                </div>
                <div className="next-line">{lineAt(1)}</div>
              </>
            )}
          </div>

          {!playing && <div className="next-line">⏸ Pausado</div>}
        </>
      ) : (
        <div className="karaoke-line">Nenhuma musica tocando.</div>
      )}
    </div>
  );
}

export default App;
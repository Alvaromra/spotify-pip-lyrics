import {
  useEffect,
  useRef,
  useState,
} from "react";

import axios from "axios";

import "./App.css";

// Detecta Electron
let ipcRenderer = null;

const isElectron =
  typeof window !== "undefined" &&
  typeof window.require === "function";

if (isElectron) {

  try {

    ipcRenderer =
      window.require(
        "electron"
      ).ipcRenderer;

  } catch {

    ipcRenderer = null;
  }
}

function App() {

  // Música
  const [track, setTrack] =
    useState(null);

  // Lyrics
  const [lyrics, setLyrics] =
    useState([]);

  // Linha atual
  const [currentIndex, setCurrentIndex] =
    useState(0);

  // Cor dinâmica
  const [accentColor, setAccentColor] =
    useState("30,215,96");

  // Progress
  const [progress, setProgress] =
    useState(0);

  // Sync
  const [lastSyncTime, setLastSyncTime] =
    useState(Date.now());

  // Karaoke
  const [karaokeMode, setKaraokeMode] =
    useState(false);

  // Mic
  const [voiceLevel, setVoiceLevel] =
    useState(0);

  // Score
  const [combo, setCombo] =
    useState(0);

  const [score, setScore] =
    useState(0);

  const [judgement, setJudgement] =
    useState("");

  const [lastHitLine, setLastHitLine] =
    useState(-1);

  const [lastHitTime, setLastHitTime] =
    useState(0);

  // Refs
  const progressRef = useRef(0);

  const voiceLevelRef = useRef(0);

  const singingTimeRef = useRef(0);

  const stableVoiceRef = useRef(0);

  const animationRef =
    useRef(null);

  const colors = [
    "30,215,96",
    "255,0,110",
    "0,200,255",
    "255,140,0",
    "180,0,255",
    "255,60,60",
  ];

  //
  // TOGGLE GLOBAL
  //
  function toggleKaraoke(
    forcedState = null
  ) {

    const newState =
      forcedState !== null
        ? forcedState
        : !karaokeMode;

    setKaraokeMode(
      newState
    );

    localStorage.setItem(
      "karaoke-mode",
      JSON.stringify(newState)
    );

    if (!newState) {

      setJudgement("");

      setCombo(0);
    }
  }

  //
  // SPOTIFY
  //
  async function fetchData() {

    try {

      const current =
        await axios.get(
          "http://localhost:8888/current"
        );

      const data = current.data;

      if (!data || !data.item)
        return;

      const newTrackId =
        data.item.id;

      const oldTrackId =
        track?.id;

      const changed =
        oldTrackId !== newTrackId;

      // Cor dinâmica
      const colorIndex =
        newTrackId.length %
        colors.length;

      setAccentColor(
        colors[colorIndex]
      );

      // Música mudou
      if (changed) {

        setCombo(0);

        setCurrentIndex(0);

        if (karaokeMode) {

          setJudgement("♪");

          setTimeout(() => {
            setJudgement("");
          }, 1200);
        }
      }

      // Track
      setTrack({
        id: newTrackId,

        title: data.item.name,

        artist:
          data.item.artists
            .map((a) => a.name)
            .join(", "),

        image:
          data.item.album.images[0]
            .url,

        duration:
          data.item.duration_ms,
      });

      // Sync
      progressRef.current =
        data.progress_ms;

      setProgress(
        data.progress_ms
      );

      setLastSyncTime(
        Date.now()
      );

      // Lyrics
      const lyricsRes =
        await axios.get(
          "http://localhost:8888/lyrics"
        );

      const rawLyrics =
        lyricsRes.data.lyrics;

      if (!rawLyrics)
        return;

      const parsed =
        rawLyrics
          .split("\n")
          .map((line) => {

            const match =
              line.match(
                /\[(\d+):(\d+\.\d+)\](.*)/
              );

            if (!match)
              return null;

            return {

              time:
                parseInt(match[1]) *
                  60 +
                parseFloat(match[2]),

              text:
                match[3].trim(),
            };
          })
          .filter(Boolean);

      setLyrics(parsed);

    } catch (err) {

      console.error(err);
    }
  }

  //
  // Atualiza Spotify
  //
  useEffect(() => {

    fetchData();

    const apiInterval =
      setInterval(
        fetchData,
        1000
      );

    return () =>
      clearInterval(apiInterval);

  }, [track]);

  //
  // HOTKEY ELECTRON
  //
  useEffect(() => {

    if (!ipcRenderer)
      return;

    ipcRenderer.on(
      "toggle-karaoke",
      (_, state) => {

        toggleKaraoke(
          state
        );
      }
    );

    return () => {

      ipcRenderer.removeAllListeners(
        "toggle-karaoke"
      );

    };

  }, [karaokeMode]);

  //
  // WEB/ELECTRON SYNC
  //
  useEffect(() => {

    function syncKaraoke() {

      const saved =
        localStorage.getItem(
          "karaoke-mode"
        );

      if (saved === null)
        return;

      const parsed =
        JSON.parse(saved);

      setKaraokeMode(
        parsed
      );
    }

    syncKaraoke();

    window.addEventListener(
      "storage",
      syncKaraoke
    );

    return () => {

      window.removeEventListener(
        "storage",
        syncKaraoke
      );

    };

  }, []);

  //
  // MICROFONE
  //
  useEffect(() => {

    async function setupMic() {

      try {

        const stream =
          await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

        const audioContext =
          new AudioContext();

        const analyser =
          audioContext.createAnalyser();

        const microphone =
          audioContext.createMediaStreamSource(
            stream
          );

        microphone.connect(analyser);

        analyser.fftSize = 256;

        const dataArray =
          new Uint8Array(
            analyser.frequencyBinCount
          );

        function updateVoice() {

          analyser.getByteFrequencyData(
            dataArray
          );

          let values = 0;

          for (
            let i = 0;
            i < dataArray.length;
            i++
          ) {

            values += dataArray[i];
          }

          const average =
            (values /
              dataArray.length) *
            1.4;

          voiceLevelRef.current =
            average;

          if (average > 28) {

            singingTimeRef.current +=
              16;

            stableVoiceRef.current +=
              1;

          } else {

            singingTimeRef.current =
              0;

            stableVoiceRef.current =
              0;
          }

          setVoiceLevel(
            average
          );

          requestAnimationFrame(
            updateVoice
          );
        }

        updateVoice();

      } catch (err) {

        console.error(err);
      }
    }

    setupMic();

  }, []);

  //
  // SCORE + TIMING SMOOTH
  //
  useEffect(() => {

    function updateLyrics() {

      if (!lyrics.length) {

        animationRef.current =
          requestAnimationFrame(
            updateLyrics
          );

        return;
      }

      const elapsed =
        Date.now() -
        lastSyncTime;

      const realProgress =
        progressRef.current +
        elapsed;

      const currentTime =
        realProgress / 1000;

      setProgress(
        realProgress
      );

      // Busca linha atual
      let index = 0;

      for (
        let i = 0;
        i < lyrics.length - 1;
        i++
      ) {

        const current =
          lyrics[i];

        const next =
          lyrics[i + 1];

        if (
          currentTime >=
            current.time &&
          currentTime <
            next.time
        ) {

          index = i;

          break;
        }
      }

      // Evita rerender
      setCurrentIndex(prev => {

        if (prev !== index) {
          return index;
        }

        return prev;
      });

      //
      // SCORE
      //
      if (karaokeMode) {

        const currentLine =
          lyrics[index];

        const nextLine =
          lyrics[index + 1];

        if (
          currentLine &&
          nextLine
        ) {

          const lineStart =
            currentLine.time;

          const lineEnd =
            nextLine.time;

          const timingAccuracy =
            Math.abs(
              currentTime -
                lineStart
            );

          const singingNow =
            voiceLevelRef.current >
            28;

          const sustainedVoice =
            singingTimeRef.current >
            500;

          const canScore =
            Date.now() -
              lastHitTime >
            1400;

          // PERFECT
          if (
            singingNow &&
            sustainedVoice &&
            timingAccuracy <
              0.6 &&
            stableVoiceRef.current >
              5 &&
            lastHitLine !==
              index &&
            canScore
          ) {

            setCombo(
              c => c + 1
            );

            setScore(
              s => s + 120
            );

            setJudgement(
              "PERFECT"
            );

            setLastHitLine(
              index
            );

            setLastHitTime(
              Date.now()
            );

            setTimeout(() => {
              setJudgement("");
            }, 700);
          }

          // GOOD
          else if (
            singingNow &&
            sustainedVoice &&
            timingAccuracy <
              1.2 &&
            lastHitLine !==
              index &&
            canScore
          ) {

            setCombo(
              c => c + 1
            );

            setScore(
              s => s + 70
            );

            setJudgement(
              "GOOD"
            );

            setLastHitLine(
              index
            );

            setLastHitTime(
              Date.now()
            );

            setTimeout(() => {
              setJudgement("");
            }, 700);
          }

          // MISS
          else if (
            currentTime >
              lineEnd &&
            lastHitLine !==
              index
          ) {

            setCombo(0);

            setJudgement(
              "MISS"
            );

            setLastHitLine(
              index
            );

            setTimeout(() => {
              setJudgement("");
            }, 700);
          }
        }
      }

      animationRef.current =
        requestAnimationFrame(
          updateLyrics
        );
    }

    updateLyrics();

    return () => {

      cancelAnimationFrame(
        animationRef.current
      );
    };

  }, [
    lyrics,
    karaokeMode,
    lastSyncTime,
    lastHitLine,
    lastHitTime,
  ]);

  //
  // Progress
  //
  const progressPercent =
    track
      ? (progress /
          track.duration) *
        100
      : 0;

  return (
    <div
      className="container"
      style={{
        "--accent":
          accentColor,
      }}
    >

      <div className="drag-bar">
        Spotify Karaoke Overlay
      </div>

      {/* BOTÃO WEB */}
      {!isElectron && (

        <div className="karaoke-button-wrapper">

          <button
            className={
              karaokeMode
                ? "karaoke-button active"
                : "karaoke-button"
            }
            onClick={() =>
              toggleKaraoke()
            }
          >

            <span className="karaoke-icon">
              {karaokeMode
                ? "🎤"
                : "🎵"}
            </span>

            <span className="karaoke-text">
              {karaokeMode
                ? "Karaoke ON"
                : "Enable Karaoke"}
            </span>

            <span className="karaoke-status">
              {karaokeMode
                ? "LIVE"
                : "READY"}
            </span>

          </button>

        </div>
      )}

      {track ? (
        <>

          {/* CAPA */}
          <img
            src={track.image}
            className="album-art"
          />

          {/* TÍTULO */}
          <h1 className="track-name">
            {track.title}
          </h1>

          {/* ARTISTA */}
          <h2 className="artist-name">
            {track.artist}
          </h2>

          {/* SCORE */}
          {karaokeMode && (
            <div className="score-container">

              <div>
                🎤 Voice{" "}
                {Math.floor(
                  voiceLevel
                )}
              </div>

              <div>
                🔥 Combo {combo}
              </div>

              <div>
                ⭐ Score {score}
              </div>

            </div>
          )}

          {/* RESULT */}
          {karaokeMode && (
            <div className="judgement">
              {judgement}
            </div>
          )}

          {/* PROGRESS */}
          <div className="progress-container">

            <div
              className="progress-bar"
              style={{
                width:
                  `${progressPercent}%`,
              }}
            ></div>

          </div>

          {/* LYRICS */}
          <div className="lyrics-container">

            <div className="previous-line">
              {
                lyrics[
                  currentIndex - 1
                ]
                  ? lyrics[
                      currentIndex - 1
                    ].text
                  : "..."
              }
            </div>

            <div
              className={
                karaokeMode
                  ? "karaoke-line karaoke-active"
                  : "karaoke-line"
              }
              style={{
                transform:
                  `scale(${
                    1 +
                    Math.min(
                      voiceLevel /
                        500,
                      0.08
                    )
                  })`,
              }}
            >
              {
                lyrics[
                  currentIndex
                ]
                  ? lyrics[
                      currentIndex
                    ].text
                  : "..."
              }
            </div>

            <div className="next-line">
              {
                lyrics[
                  currentIndex + 1
                ]
                  ? lyrics[
                      currentIndex + 1
                    ].text
                  : "..."
              }
            </div>

          </div>

        </>
      ) : (

        <div className="karaoke-line">
          Nenhuma música tocando.
        </div>

      )}

    </div>
  );
}

export default App;
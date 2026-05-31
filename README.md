# Spotify PiP Lyrics

A lightweight desktop application that displays synchronized Spotify lyrics in a **Picture-in-Picture (PiP) overlay**, allowing users to follow song lyrics while working, studying, gaming, or browsing.

The application connects directly to Spotify, detects the currently playing track, retrieves synchronized lyrics, and displays them in a clean, always-on-top floating window.

---

## Features

- 🎵 Real-time Spotify track detection
- 📝 Synchronized lyrics display
- 🖥️ Picture-in-Picture (Always-On-Top) overlay
- 🎨 Modern and minimal interface
- ⚡ Lightweight Electron-based desktop application
- 🔐 Spotify OAuth authentication
- 🌎 Cross-platform support
  - Windows
  - Linux
  - macOS
- 🔄 Automatic lyric updates when tracks change
- 📌 Resizable floating window

---

## Screenshots

### Main Overlay

```text
┌───────────────────────────────┐
│                               │
│     Current Song Lyrics       │
│                               │
│   Never gonna give you up...  │
│                               │
└───────────────────────────────┘
```

---

## Architecture

```text
Spotify API
      │
      ▼
Authentication (OAuth)
      │
      ▼
Current Track Detection
      │
      ▼
Lyrics Provider
      │
      ▼
Electron Overlay Window
      │
      ▼
Real-Time Lyrics Rendering
```

---

## Tech Stack

### Frontend

- HTML5
- CSS3
- JavaScript

### Desktop

- Electron

### APIs

- Spotify Web API

### Authentication

- OAuth 2.0 Authorization Code Flow

---

## Project Structure

```text
spotify-pip-lyrics/
│
├── assets/
│   ├── icons/
│   └── images/
│
├── src/
│   ├── auth/
│   ├── lyrics/
│   ├── spotify/
│   ├── overlay/
│   └── utils/
│
├── electron/
│   ├── main.cjs
│   └── preload.js
│
├── public/
│
├── .env
├── package.json
├── README.md
└── LICENSE
```

---

## Installation

### Clone the Repository

```bash
git clone https://github.com/your-username/spotify-pip-lyrics.git

cd spotify-pip-lyrics
```

### Install Dependencies

```bash
npm install
```

---

## Spotify Developer Setup

### 1. Create a Spotify App

Visit:

https://developer.spotify.com/dashboard

Create a new application and obtain:

- Client ID
- Client Secret

### 2. Configure Redirect URI

Example:

```text
http://127.0.0.1:8888/callback
```

Add it to your Spotify Developer Dashboard.

### 3. Create `.env`

```env
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
```

---

## Running the Application

### Development Mode

```bash
npm start
```

### Electron Mode

```bash
npm run electron
```

---

## Build Executables

### Windows

```bash
npm run build-win
```

### Linux

```bash
npm run build-linux
```

### macOS

```bash
npm run build-mac
```

Generated files will be available in:

```text
dist/
```

---

## Usage

1. Launch the application.
2. Authenticate with Spotify.
3. Start playing a song on Spotify.
4. The overlay window will automatically display lyrics.
5. Move and resize the window as desired.

---

## Roadmap

### Version 1.0

- [x] Spotify Authentication
- [x] Current Track Detection
- [x] Floating Overlay
- [x] Synchronized Lyrics

### Version 1.1

- [ ] Theme Customization
- [ ] Font Size Controls
- [ ] Transparency Controls
- [ ] Multi-monitor Support

### Version 2.0

- [ ] Translation Mode
- [ ] Karaoke Mode
- [ ] AI-Powered Lyric Explanations
- [ ] Smart Language Detection

---

## Future AI Features

- Automatic lyric translation
- Song meaning explanations
- Vocabulary learning mode
- Pronunciation assistance
- Context-aware annotations
- Study mode for language learners

---

## Contributing

Contributions are welcome.

1. Fork the repository

2. Create a feature branch

```bash
git checkout -b feature/my-feature
```

3. Commit changes

```bash
git commit -m "Add new feature"
```

4. Push to your branch

```bash
git push origin feature/my-feature
```

5. Open a Pull Request

---

## License

This project is distributed under the MIT License.

---

## Author

**Álvaro Marçal de Araujo**

Network & Communications Engineering Student — University of Brasília (UnB)

Computer Science Student — UniCEUB

Infrastructure • DevOps • Networking • Artificial Intelligence

---

## Disclaimer

This project is an independent application and is not affiliated with, endorsed by, or sponsored by Spotify.

Spotify is a registered trademark of Spotify AB.

All rights related to music streaming, lyrics, and metadata belong to their respective owners.

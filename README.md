# Spotify PiP Lyrics

Desktop overlay desenvolvido para exibir letras sincronizadas do Spotify em tempo real enquanto o usuário joga, trabalha ou utiliza aplicações em fullscreen.

O projeto utiliza Electron + React para criar uma janela leve, moderna e sempre visível sobre outros aplicativos.

---

# Preview

- Overlay minimalista
- Letras em tempo real
- Compatível com jogos
- Hotkeys
- Transparência
- Picture-in-Picture mode

---

# Funcionalidades

## Overlay em tempo real

Exibe as letras sincronizadas da música atual do Spotify diretamente na tela.

## Compatibilidade com jogos

O overlay foi pensado para funcionar durante gameplay sem necessidade de alternar janelas.

## Modo Always On Top

Mantém as letras visíveis sobre outros aplicativos.

## Hotkeys

Atalhos para:
- Mostrar/Ocultar overlay
- Ativar modo jogo
- Controle rápido da interface

## Interface moderna

Frontend desenvolvido com React visando:
- fluidez
- baixa latência
- visual clean
- fácil leitura durante gameplay

## Transparência dinâmica

Sistema de transparência para reduzir distrações durante uso.

---

# Stack Utilizada

## Frontend

- React
- Vite

## Desktop

- Electron

## Backend

- Node.js

---

# Estrutura do Projeto

```bash
spotify-pip-lyrics/
│
├── client/          # Interface React
├── server/          # Backend/API
├── package.json
└── README.md

# ⚔️ 1V1.BATTLE — Build & Shoot

A browser-based third-person build-fight shooter inspired by 1v1.lol. Build walls, floors, and ramps while out-gunning your opponent. **Playable online** with a friend — no server or account needed.

## 🎮 Play

Open the game in a browser (GitHub Pages link in the repo description), then:

- **Practice** — solo arena with target dummies
- **Create Game** — generates a 4-letter room code; send it to a friend
- **Join Game** — enter a friend's room code and fight

Online play is peer-to-peer (WebRTC via PeerJS), so both players just need the page open in a modern browser.

First to **10 eliminations** wins the round.

## ⌨️ Controls

| Key | Action |
|---|---|
| `W A S D` | Move |
| `Space` | Jump |
| `Mouse` | Look |
| `Left click` | Shoot / place build |
| `Right click` | Aim (sniper scopes in) |
| `1` `2` `3` | Assault Rifle / Shotgun / Sniper |
| `Z` or `Q` | Build wall |
| `X` | Build floor |
| `C` | Build ramp |
| `R` | Reload |
| `Esc` | Release mouse |

Builds snap to a grid, have HP, and can be shot down. Hold left click in build mode to turbo-build.

## 🛠 Run locally

Any static file server works:

```sh
# Python
python -m http.server 8000
# or Node
npx serve .
```

Then open `http://localhost:8000`.

> Note: open the files through a server (not `file://`) so ES modules load correctly.

## 🧱 Tech

- [Three.js](https://threejs.org/) — 3D rendering (no build step, loaded from CDN)
- [PeerJS](https://peerjs.com/) — WebRTC peer-to-peer multiplayer
- Vanilla JS/HTML/CSS — zero dependencies to install, deploys as a static site

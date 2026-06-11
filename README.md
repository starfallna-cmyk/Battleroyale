# ⚔️ 1V1.BATTLE — Build & Shoot

A browser-based third-person build-fight shooter inspired by 1v1.lol and Fortnite. Drop from the battle bus, build and edit structures, and out-gun **up to 6 players** online — no server or account needed.

## 🎮 Play

**▶ [Play it now](https://chezburgar.github.io/1v1-battle/)** — then:

- **Practice** — solo arena with target dummies
- **Create Game** — generates a 4-letter room code; share it with up to 5 friends
- **Join Game** — enter a room code; you can join mid-match and drop in

Online play is peer-to-peer (WebRTC via PeerJS) with the host relaying for the lobby, so everyone just needs the page open in a modern browser.

Every match starts on the **battle bus** — press `Space` to drop, glide down (hold `Shift` to dive), and fight across a map with houses you can enter, a warehouse, trees, rocks, and jump pads. First to **10 eliminations** wins the round.

## ⌨️ Controls

| Key | Action |
|---|---|
| `W A S D` | Move |
| `Space` | Jump / drop from the bus |
| `Shift` | Dive while gliding |
| `Mouse` | Look |
| `Mouse wheel` | Cycle weapons / build pieces |
| `Left click` | Shoot / swing / place build |
| `Right click` | Aim (sniper scopes in) |
| `1` `2` `3` `4` | Assault Rifle / Shotgun / Sniper / Pickaxe |
| `Z` or `Q` | Build wall |
| `X` | Build floor |
| `C` | Build ramp |
| `F` | **Edit** the build you're aiming at |
| `R` | Reload |
| `Esc` | Release mouse |

Builds snap to a grid, have HP, and can be shot down. Hold left click in build mode to turbo-build; look up while building to place a level higher. Press `F` on a wall to cycle a doorway or window into it, or on a ramp to flip its direction. Headshots deal bonus damage, rifles lose damage at long range, and the sniper only one-shots on a headshot.

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

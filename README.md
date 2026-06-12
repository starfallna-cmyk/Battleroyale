# 🎯 KILLSHOT — Build & Shoot Battle Royale

A browser-based third-person build-fight battle royale. Drop from the battle bus, build and edit structures, and out-gun **up to 6 players** online — no server or account needed.

## 🎮 Play

**▶ [Play it now](https://chezburgar.github.io/1v1-battle/)** — then:

- **Practice** — solo arena with target dummies (respawns on)
- **Create Game** — generates a 4-letter room code; share it with up to 5 friends
- **Join Game** — enter a room code; if a round is running you spectate until the next one

Online play is peer-to-peer (WebRTC via PeerJS) with the host relaying for the lobby, so everyone just needs the page open in a modern browser.

Online matches are **battle royale**: everyone waits in the lobby and **readies up**, then the round starts together on the **battle bus** — press `Space` to drop, glide down (hold `Shift` to dive). **One life per round** — die and you spectate (free-fly camera) until it ends. Last player standing wins the round and a 👑 crown; then it's back to the lobby for the next round. Builds are wiped between rounds.

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

Builds snap to a grid, have HP, and can be shot down. Hold left click in build mode to turbo-build; look up while building to place a level higher. Press `F` on a wall to toggle a window into it, or on a ramp to flip its direction. Headshots deal bonus damage, rifles lose damage at long range, and the sniper only one-shots on a headshot.

## 🔌 Connection troubleshooting

Online play is direct peer-to-peer. If a friend can't join:

- Make sure **everyone hard-refreshes** the page (`Ctrl+F5`) so all players run the same version — mismatches now show a clear error.
- If joining times out with a network error, a router/firewall on one side is blocking peer-to-peer (common on school/office networks and some ISPs). Having one player switch networks — a **phone hotspot** usually works — fixes it.

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

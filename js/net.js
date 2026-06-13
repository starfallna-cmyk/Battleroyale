// PeerJS networking for up to 6 players: star topology through the host.
// The host (id 0) accepts up to 5 guest connections, relays every guest
// message to the other guests (tagged with `f` = sender id), and delivers
// it locally. Guests only ever talk to the host.
const PREFIX = 'ovob1v1-';
export const MAX_PLAYERS = 6;

// bump when messages change shape — mismatched clients get a clear error
export const PROTO = 8;

// TURN relay (metered.ca) makes connections work across any router/firewall.
// Credentials are fetched fresh per session; on failure we fall back to
// STUN-only, which still connects most home-network pairs directly.
const TURN_API = 'https://bettleroyale6.metered.live/api/v1/turn/credentials?apiKey=fa976f310132950e91a193972b7eef3be96e';

const STUN_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

let icePromise = null;
function iceServers() {
  if (!icePromise) {
    icePromise = (async () => {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 5000);
        const res = await fetch(TURN_API, { signal: ctl.signal });
        clearTimeout(timer);
        const servers = await res.json();
        if (Array.isArray(servers) && servers.length) return [...STUN_SERVERS, ...servers];
      } catch (e) { /* relay unreachable — STUN-only fallback */ }
      return STUN_SERVERS;
    })();
  }
  return icePromise;
}

function peerOpts(servers) {
  return { config: { iceServers: servers, sdpSemantics: 'unified-plan' } };
}

const CONNECT_TIMEOUT = 14000;
const NAT_HELP = 'Could not reach the host — a router/firewall on one side is blocking '
  + 'peer-to-peer. Try again, or have one player switch networks (a phone hotspot usually works).';

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.myId = 0;
    this.conns = new Map();  // host: id -> DataConnection
    this.hostConn = null;    // guest: connection to host
    this.onMessage = null;   // (fromId, msg)
    this.onPeerJoin = null;  // host only: (id)
    this.onPeerLeave = null; // (id)
    this.onClose = null;     // guest only: host disconnected
    this._closed = false;
    this._nextId = 1;
  }

  playerCount() {
    return this.isHost ? this.conns.size + 1 : -1; // guests don't track
  }

  host(code, callbacks) {
    iceServers().then((servers) => this._host(code, callbacks, servers));
  }

  _host(code, { onWaiting, onError }, servers) {
    this.isHost = true;
    this.myId = 0;
    this.peer = new Peer(PREFIX + code, peerOpts(servers));
    this.peer.on('open', () => onWaiting(code));
    this.peer.on('connection', (conn) => {
      if (this.conns.size >= MAX_PLAYERS - 1) {
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
        return;
      }
      const id = this._nextId++;
      conn.on('open', () => {
        this.conns.set(id, conn);
        conn.send({ t: 'id', id, pv: PROTO });
        if (this.onPeerJoin) this.onPeerJoin(id);
      });
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object') return;
        for (const [oid, oc] of this.conns) {
          if (oid !== id && oc.open) oc.send({ ...d, f: id });
        }
        if (this.onMessage) this.onMessage(id, d);
      });
      const drop = () => {
        if (!this.conns.has(id)) return;
        this.conns.delete(id);
        for (const [, oc] of this.conns) if (oc.open) oc.send({ t: 'leave', f: id });
        if (this.onPeerLeave) this.onPeerLeave(id);
      };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    this.peer.on('error', (e) => {
      if (e.type === 'unavailable-id') onError('That code is already in use — try creating again.');
      else if (this.conns.size === 0) onError('Connection error: ' + e.type);
    });
    this.peer.on('disconnected', () => { if (!this._closed) this.peer.reconnect(); });
  }

  join(code, callbacks) {
    iceServers().then((servers) => this._join(code, callbacks, servers));
  }

  _join(code, { onConnected, onError }, servers) {
    this.isHost = false;
    let settled = false;
    const fail = (msg) => { if (!settled) { settled = true; onError(msg); } };
    this.peer = new Peer(peerOpts(servers));
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true });
      this.hostConn = conn;
      // if the data channel never opens (NAT/firewall), say so instead of hanging
      const timer = setTimeout(() => fail(NAT_HELP), CONNECT_TIMEOUT);
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object') return;
        if (d.t === 'id') {
          clearTimeout(timer);
          if (d.pv !== PROTO) {
            fail('Game version mismatch — everyone should hard-refresh the page (Ctrl+F5) and retry.');
            return;
          }
          this.myId = d.id;
          if (!settled) { settled = true; onConnected(d.id); }
          return;
        }
        if (d.t === 'full') { clearTimeout(timer); fail('That game is full (6 players max).'); return; }
        if (d.t === 'leave') { if (this.onPeerLeave) this.onPeerLeave(d.f); return; }
        if (this.onMessage) this.onMessage(d.f ?? 0, d);
      });
      conn.on('close', () => { if (!settled) fail(NAT_HELP); else this._fireClose(); });
      conn.on('error', () => { if (!settled) fail(NAT_HELP); else this._fireClose(); });
    });
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') fail('Game not found — check the code.');
      else if (!this.hostConn || !this.hostConn.open) fail('Connection error: ' + e.type);
    });
    this.peer.on('disconnected', () => { if (!this._closed) this.peer.reconnect(); });
  }

  // Broadcast to everyone.
  send(msg) {
    if (this.isHost) {
      for (const [, c] of this.conns) if (c.open) c.send({ ...msg, f: 0 });
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(msg);
    }
  }

  // Host only: direct message to one guest (used for welcome snapshots).
  sendTo(id, msg) {
    if (!this.isHost) return;
    const c = this.conns.get(id);
    if (c && c.open) c.send({ ...msg, f: 0 });
  }

  _fireClose() {
    if (this._closed) return;
    this._closed = true;
    if (this.onClose) this.onClose();
  }
}

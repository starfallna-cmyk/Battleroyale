// PeerJS networking for up to 6 players: star topology through the host.
// The host (id 0) accepts up to 5 guest connections, relays every guest
// message to the other guests (tagged with `f` = sender id), and delivers
// it locally. Guests only ever talk to the host.
const PREFIX = 'ovob1v1-';
export const MAX_PLAYERS = 6;

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

  host(code, { onWaiting, onError }) {
    this.isHost = true;
    this.myId = 0;
    this.peer = new Peer(PREFIX + code);
    this.peer.on('open', () => onWaiting(code));
    this.peer.on('connection', (conn) => {
      if (this.conns.size >= MAX_PLAYERS - 1) {
        conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
        return;
      }
      const id = this._nextId++;
      conn.on('open', () => {
        this.conns.set(id, conn);
        conn.send({ t: 'id', id });
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

  join(code, { onConnected, onError }) {
    this.isHost = false;
    this.peer = new Peer();
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true });
      this.hostConn = conn;
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object') return;
        if (d.t === 'id') { this.myId = d.id; onConnected(d.id); return; }
        if (d.t === 'full') { onError('That game is full (6 players max).'); return; }
        if (d.t === 'leave') { if (this.onPeerLeave) this.onPeerLeave(d.f); return; }
        if (this.onMessage) this.onMessage(d.f ?? 0, d);
      });
      conn.on('close', () => this._fireClose());
      conn.on('error', () => this._fireClose());
    });
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') onError('Game not found — check the code.');
      else if (!this.hostConn || !this.hostConn.open) onError('Connection error: ' + e.type);
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

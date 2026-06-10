// PeerJS wrapper — peer-to-peer 1v1 connection through the free PeerJS cloud broker.
const PREFIX = 'ovob1v1-';

export class Net {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.onMessage = null;
    this.onClose = null;
    this._closed = false;
  }

  host(code, { onWaiting, onConnected, onError }) {
    this.peer = new Peer(PREFIX + code);
    this.peer.on('open', () => onWaiting(code));
    this.peer.on('connection', (conn) => {
      if (this.conn) { conn.close(); return; } // 1v1 only — reject extra joiners
      this.conn = conn;
      conn.on('open', () => onConnected());
      this._wire(conn);
    });
    this.peer.on('error', (e) => {
      if (e.type === 'unavailable-id') onError('That code is already in use — try creating again.');
      else if (!this.conn) onError('Connection error: ' + e.type);
    });
    this.peer.on('disconnected', () => { if (!this._closed) this.peer.reconnect(); });
  }

  join(code, { onConnected, onError }) {
    this.peer = new Peer();
    this.peer.on('open', () => {
      const conn = this.peer.connect(PREFIX + code, { reliable: true });
      this.conn = conn;
      conn.on('open', () => onConnected());
      this._wire(conn);
    });
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') onError('Game not found — check the code.');
      else if (!this.conn || !this.conn.open) onError('Connection error: ' + e.type);
    });
    this.peer.on('disconnected', () => { if (!this._closed) this.peer.reconnect(); });
  }

  _wire(conn) {
    conn.on('data', (d) => { if (this.onMessage) this.onMessage(d); });
    conn.on('close', () => this._fireClose());
    conn.on('error', () => this._fireClose());
  }

  _fireClose() {
    if (this._closed) return;
    this._closed = true;
    if (this.onClose) this.onClose();
  }

  send(obj) {
    if (this.conn && this.conn.open) this.conn.send(obj);
  }
}

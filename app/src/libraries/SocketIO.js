import createLog from 'silk-log';

const log = createLog('SocketIO');

/**
 * Wrap socket-io.client and rejoin rooms upon socket reconnects.
 */
export default class SocketIO {
  constructor(socket) {
    this.socket = socket;
    this.rooms = new Set();

    this._needsRoomReconnect = false;

    // To reduce complexity we do not persist room settings on the server side
    // so we must reconnect manually here.
    this.socket.on('reconnect', () => {
      log.info('Disconnect detected will need to rejoin rooms.');
      this._needsRoomReconnect = true;
    });

    this.socket.on('connect', () => {
      if (!this._needsRoomReconnect) {
        log.info('Connected to socket.');
        return;
      }

      log.info('Reconnected to socket, rejoining previous rooms.');
      for (let room of this.rooms) {
        log.debug('rejoining', room);
        this.emit('join', room);
      }
      this._needsRoomReconnect = false;
    });
  }

  on(event, listener) {
    this.socket.on(event, listener);
  }

  off(event) {
    this.socket.off(event);
  }

  close() {
    this.socket.close();
  }

  get connected() {
    return this.socket.connected;
  }

  /**
   * Overrides superclass emit interface for one that emits on the server.
   *
   * Note: it is safe to call this when disconnected the native side will buffer
   * events and send them on reconnect.
   */
  emit(event, ...data) {
    return this.socket.emit(event, ...data);
  }

  open() {
    this.socket.open();
  }

  connect() {
    this.socket.connect();
  }

  /**
   * Silk-server specific join room.
   *
   * Automatically will rejoin this room on server reconnection.
   */
  join(room) {
    this.rooms.add(room);
    this.emit('join', room);
  }

  /**
   * Silk-server specific leave room.
   */
  leave(room) {
    this.rooms.delete(room);
    this.emit('leave', room);
  }
}

/**
 * The account room is our in memory mapping of who is connected to the
 * socket.io server...
 *
 * NOTE: The intention for this class is to be a relatively dumb mechanism
 * for the account/device routes to talk to without having much knowledge
 * of who else is listening in the room.
 *
 * This class also specificly avoids holding references to the various sockets
 * it registers. When we scale up to use a perisistent adapter holding in memory
 * references will not work as we will have multiple servers.
 *
 * NOTE: All rooms are prefixed by the account id so we do not accidentally
 * collide with other rooms for different accounts.
 *
 * @flow
 */
import createLog from 'log';
import denodeify from 'denodeify';

import type {Socket, Manager} from 'socket.io';
import type {Record as DeviceRecord} from '../server/models/devices';

const log = createLog('socketio:account_room');

type DevicePreviewInfo = {
  width: number;
  height: number;
}

export type DeviceInfo = {
  id: string;
  previewSize: ?DevicePreviewInfo;
  logo: ?any;
  now: number;
}

export const VIDEO_STREAMS_ROOM = 'video-streams';
export const DEVICES_ROOM = 'devices';
export const ACCOUNTS_ROOM = 'accounts';

export const DEVICE_ONLINE_EVENT = 'video-stream-new';
export const DEVICE_OFFLINE_EVENT = 'video-stream-delete';

function deviceRoomName(devicePublicKey: string): string {
  return `${DEVICES_ROOM}/${devicePublicKey}`;
}

type DeviceLiveStream = {
  video: bool;
  diag: bool;
  preview: bool;
}

// How long a device has to send a livestream message when the server is
// expecting one before it will be disconnected on
const VIDEO_IDLE_TIMEOUT_MS = 10000;

// Only permit this number of unacknowledged livestream messages
// (preview/video/diag) to each client.
const MAX_PENDING_ACKS = 3;

/**
 * Manages the global state of devices...
 *
 * NOTE: That this approach is not scalable and will break completely once we
 * move to an adapater that allows us to move beyond a single server...
 */
class Device {
  id: string;
  info: DeviceInfo = {};
  socket: Socket;
  timeout: ?number;
  timeOffset: number = 0;
  livestream: DeviceLiveStream = {
    video: false,
    diag: false,
    preview: false,
  };

  constructor(socket: Socket, id: string) {
    this.socket = socket;
    this.id = id;
    this.info.id = id;
  }

  updateDeviceInfo(info: DeviceInfo) {
    if (typeof info !== 'object') {
      log.warn('Invalid DeviceInfo, not an object');
      return;
    }
    if (typeof info.now === 'number') {
      this.timeOffset = Date.now() - info.now;
    }

    if (typeof info.logo === 'object') {
      this.info.logo = info.logo;
    }

    if (typeof info.previewSize === 'object') {
      this.info.previewSize = info.previewSize;
    }
  }

  updateLiveStream() {
    let cmd = Object.assign({}, this.livestream);
    cmd.msg = 'livestream';
    log.info('updateLiveStream:', JSON.stringify(cmd));
    this.socket.emit('cmd', cmd);

    this.resetTimeout();
  }

  resetTimeout() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }

    if (this.livestream.diag ||
        (this.info.previewSize && (this.livestream.preview || this.livestream.video))) {
      this.timeout = setTimeout(() => {
        log.info(`Device packet timeout. Disconnecting io=${this.socket.id} id=${this.id}`);
        this.socket.disconnect(true);
      }, VIDEO_IDLE_TIMEOUT_MS);
    }
  }

  destroy() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  toJSON() {
    return this.info;
  }
}

export default class AccountRoom {
  /**
   * The account._id property from the mongodb accounts collection.
   */
  accountId: string;
  io: Manager;

  // XXX: This is a hack and non-scalable workaround for not having a way to
  // query all online devices. We should not be keeping in memory representation
  // of any socket.io connection states (we will need to scale to > 1 server).
  devices: Map<string, Device> = new Map();

  // Number of pending acks for each live stream roomType
  pendingAcks: {[key: string]: number} = [];

  constructor(io: Manager, id: string) {
    this.io = io;
    this.accountId = id;
    log.verbose('create account room', id);
  }

  isEmptyRoom(name: string): bool {
    let room = this._prefixRoom(name);
    if (!this.io.nsps) {
      return true;
    }
    let clients = this.io.nsps['/'].adapter.rooms[room];
    if (!clients) {
      return true;
    }
    return 0 === clients.length;
  }

  _prefixRoom(name: string): string {
    return `${this.accountId}/${name}`;
  }

  _pendingAckId(room: string, socketId: string): string {
    return `${socketId}|${room}`;
  }

  async join(room: string, socket: Socket): Promise<any> {
    const prefixedRoom = this._prefixRoom(room);
    log.info(`Join ${prefixedRoom} by ${socket.id}`);
    this.pendingAcks[this._pendingAckId(room, socket.id)] = 0;
    await denodeify(socket.join).call(socket, prefixedRoom);
  }

  async leave(room: string, socket: Socket): Promise<any> {
    room = this._prefixRoom(room);
    log.info(`Leave ${room} by ${socket.id}`);
    await denodeify(socket.leave).call(socket, room);
  }

  broadcast(room: string, ...emit: any): void {
    room = this._prefixRoom(room);
    let event = emit[0];
    log.info(`Broadcast in ${room} with ${event}`);
    this.io.to(room).emit(...emit);
  }

  liveStreamData(room: string, msg: any): void {
    const prefixedRoom = this._prefixRoom(room);
    const ioRoom = this.io.nsps['/'].adapter.rooms[prefixedRoom];

    let clients;
    if (ioRoom.sockets) {
      // When running under |mocha|, the room object is a little different :-/
      clients = Object.keys(ioRoom.sockets);
    } else {
      clients = Object.keys(ioRoom);
    }
    log.info(`Live data to ${prefixedRoom}: ${clients.length} client(s)`);
    clients.forEach(id => {
      const ackId = this._pendingAckId(room, id);
      if (this.pendingAcks[ackId] >= MAX_PENDING_ACKS) {
        log.warn(`  Skipping client ${id}, too many outstanding ack`);
        return;
      }
      ++this.pendingAcks[ackId];
      this.io.nsps['/'].connected[id].emit(room, msg, () => {
        log.info(`Ack from ${id} for ${room}`);
        --this.pendingAcks[ackId];
      });
    });
  }

  async registerDevice(deviceId: string, socket: Socket): Promise<any> {
    await Promise.all([
      this.join(DEVICES_ROOM, socket), // all devices in the account...
      this.join(deviceRoomName(deviceId), socket), // this device...
    ]);
  }

  registerOnlineDevice(
    device: DeviceRecord,
    socket: Socket
  ): Device {
    const id = device.accessToken.publicKey;
    let deviceInstance = new Device(socket, id);
    this.devices.set(id, deviceInstance);
    socket.once('disconnect', () => {
      deviceInstance.destroy();
      this.devices.delete(id);
    });
    return deviceInstance;
  }

  async registerAccount(socket: Socket): Promise<any> {
    await this.join(ACCOUNTS_ROOM, socket);
  }

  emitToDevice(deviceId: string, ...emit: any) {
    this.broadcast(deviceRoomName(deviceId), ...emit);
  }

  broadcastToDevices(...emit: any) {
    this.broadcast(DEVICES_ROOM, ...emit);
  }

  broadcastToAccounts(...emit: any) {
    this.broadcast(ACCOUNTS_ROOM, ...emit);
  }
}

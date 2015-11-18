/**
 * @flow
 */
import createLog from 'log';

import {
  VIDEO_STREAMS_ROOM,
  DEVICE_OFFLINE_EVENT,
} from '../account_room';

import type {default as AccountRoom, DeviceInfo} from '../account_room';
import type {Record as DeviceRecord} from '../../server/models/devices';
import type {Socket} from 'socket.io';
import type {EventHandlers} from '../server';

const log = createLog('socketio:routes:device');

type Session = {
  room: AccountRoom;
  device: DeviceRecord;
  socket: Socket;
  publicKey: string;
}

type VideoMessage = {
  id: string;
  contents: string;
  when: number;
  serverEmitMs: ?number;
}

type DiagMessage = {
  id: string;
  when: number;
  serverEmitMs: ?number;
}

export function deviceRoom(deviceId: string, name: string): string {
  return `${name}-${deviceId}`;
}

export default function(session: Session): EventHandlers {

  function sendToDeviceRoom(roomType, msg) {
    let deviceId = msg.id;
    let device = session.room.devices.get(deviceId);

    if (!device) {
      log.error(`Disconnecting bad device ("info" packet expected first): ` +
                `io=${session.socket.id} id=${deviceId}`);
      session.socket.disconnect(false);
      return;
    }
    let room = deviceRoom(deviceId, roomType);
    let lag = '';
    if (msg.when) {
      lag = `lag=${Date.now() - msg.when - device.timeOffset}ms`;
    }
    log.verbose(`io=${session.socket.id} dest:${room} ${lag}`);

    // If there are no clients in the room tell the device to stop sending
    // this kind of data
    if (session.room.isEmptyRoom(room)) {
      log.error(`${deviceRoom} is empty`);
      device.livestream[roomType] = false;
      device.updateLiveStream();
    } else {
      msg.serverEmitMs = Date.now();
      session.room.broadcast(room, room, msg);
      device.resetTimeout();
    }
  }

  return {
    info: async (msg: DeviceInfo) => {
      // Always ensure we use the authenticated devices's id.
      msg.id = session.publicKey;

      let device = session.room.devices.get(msg.id);
      if (!device) {
        // new device ...
        device = session.room.registerDeviceInfo(session.device, msg, session.socket);
        device.updateLiveStream();
      }

      log.info(`Device info. io=${session.socket.id} name=${msg.name} ` +
                    `timeOffset=${device.timeOffset}ms id=${msg.id}`);

      device.resetTimeout();
    },

    diag: async (msg: DiagMessage) => {
      // Always ensure we use the authenticated devices's id.
      msg.id = session.publicKey;
      sendToDeviceRoom('diag', msg);
    },

    video: async(video: VideoMessage) => {
      // Always ensure we use the authenticated devices's id.
      video.id = session.publicKey;

      switch (video.contents) {
      case 'jpeg':
        sendToDeviceRoom('preview', video);
        break;
      case 'mp4':
        sendToDeviceRoom('video', video);
        break;
      default:
        log.error(`Unknown video type ${video.contents}`);
      }
    },

    disconnect: async () => {
      let msg = { id: session.device.accessToken.publicKey };
      session.room.broadcast(VIDEO_STREAMS_ROOM, DEVICE_OFFLINE_EVENT, msg);
    },
  };
}

/**
 * @flow
 */
import createLog from 'log';

import {
  VIDEO_STREAMS_ROOM,
  DEVICE_ONLINE_EVENT,
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
  contents: string;
  when: number;
  serverEmitMs: ?number;
}

type DiagMessage = {
  when: number;
  serverEmitMs: ?number;
}

export function deviceRoom(deviceId: string, name: string): string {
  return `${name}-${deviceId}`;
}

export default function(session: Session): EventHandlers {

  const deviceId = session.publicKey;

  function sendToDeviceRoom(roomType, msg) {
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
      session.room.liveStreamData(room, msg);
      device.resetTimeout();
    }
  }

  return {
    info: async (msg: DeviceInfo) => {
      let device = session.room.devices.get(deviceId);
      if (!device) {
        // new device ...
        device = session.room.registerOnlineDevice(session.device, session.socket);
        device.updateLiveStream();
      }
      device.updateDeviceInfo(msg);

      log.info(`Device info. io=${session.socket.id} ` +
               `timeOffset=${device.timeOffset}ms id=${deviceId}`);

      device.resetTimeout();
      session.room.broadcast(VIDEO_STREAMS_ROOM, DEVICE_ONLINE_EVENT, device.info);
    },

    diag: async (msg: DiagMessage) => {
      sendToDeviceRoom('diag', msg);
    },

    video: async(video: VideoMessage) => {
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
      const msg = { id: deviceId };
      session.room.broadcast(VIDEO_STREAMS_ROOM, DEVICE_OFFLINE_EVENT, msg);
    },
  };
}

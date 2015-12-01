/**
 * @flow
 */
import {
  default as AccountRoom,
  VIDEO_STREAMS_ROOM,
  DEVICE_ONLINE_EVENT
} from '../account_room';

import createLog from 'log';

import type {Record as AccountRecord} from '../../server/models/accounts';
import type {Socket} from 'socket.io';
import type {RouteContext, EventHandlers} from '../server';

const log = createLog('socketio:account_room');

type Session = {
  room: AccountRoom;
  account: AccountRecord;
  socket: Socket;
  publicKey: string;
}

type CommandMessage = {
  id: ?string;
  // ... any things...
}

// XXX: Should this name be namespaced?
const ROOM_NAMES_REGEX = /(diag|video|preview)-([0-9a-f]+)/;

export function parseRoomName(name: string): Array<string> {
  let found = name.match(ROOM_NAMES_REGEX);
  if (found) {
    let [, stream, id] = found;
    return [stream, id];
  }
  return [];
}

export default function(session: Session, ctx: RouteContext): EventHandlers {
  return {
    join: async (room: string) => {
      if (VIDEO_STREAMS_ROOM === room) {
        await session.room.join(room, session.socket);
        // XXX: Another in memory hack...
        for (let device of session.room.devices.values()) {
          session.socket.emit(DEVICE_ONLINE_EVENT, device.toJSON());
        }
      }

      let [streamType, deviceId] = parseRoomName(room);
      if (streamType && deviceId) {
        await session.room.join(room, session.socket);
        let device = session.room.devices.get(deviceId);
        if (!device) {
          log.warn(`Unknown device id ${deviceId}`);
          return;
        }
        device.livestream[streamType] = true;
        device.updateLiveStream();
      }
    },

    leave: async (room: string) => {
      log.debug(`Leave room. io=${session.socket.id} room=${room}`);
      // Only allow the leaving specific rooms it can enter...
      if (room.match(ROOM_NAMES_REGEX) || room === VIDEO_STREAMS_ROOM) {
        await session.room.leave(room, session.socket);
      } else {
        // TODO: Warn about suspcious activity.
        log.warn(`Attempting to leave invalid room`, room);
      }
    },

    cmd: async (cmd: CommandMessage) => {
      if (typeof cmd.id !== 'string') {
        session.room.broadcastToDevices('cmd', cmd);
        return;
      }

      let deviceId: string = cmd.id;
      // Only allow direct communication if the account owns the device.
      if (!await ctx.devices.belongsToAccount(session.account._id, cmd.id)) {
        // TODO: Warn about suspcious activity.
        log.warn(`Tried to message device not belonging to account ${session.account._id}`);
        return;
      }
      session.room.emitToDevice(deviceId, 'cmd', cmd);
    }
  };

}

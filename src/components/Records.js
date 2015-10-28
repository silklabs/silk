import { Record } from 'immutable';

export const DeviceRecord = Record({ /* eslint new-cap: 0 */
  deviceId: null,
  publicKey: null,
  name: null,
  logo: null,
  previewSize: null,
  haveVideoStream: false,
});

export const ConfiguringDeviceRecord = Record({ /* eslint new-cap: 0 */
  deviceId: null,
  name: null,
  bleDeviceSession: null,
});

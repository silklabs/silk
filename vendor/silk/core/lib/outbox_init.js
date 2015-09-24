/**
 * Helper to initialize outbox and various operations...
 */
import path from 'path';
import createOutbox from './outbox_stream';

const STORAGE_PATH = path.join('/data', 'outbox');

export default function(wifi) {
  let outbox = createOutbox({
    storagePath: STORAGE_PATH
  });

  // Optimistically start running pending operations...
  outbox.start();

  wifi.on('online', () => {
    console.log('outbox: online');
    outbox.online = true;
    outbox.start();
  });

  wifi.on('offline', () => {
    console.log('outbox: offline');
    outbox.online = false;
    outbox.stop();
  });

  return outbox;
}

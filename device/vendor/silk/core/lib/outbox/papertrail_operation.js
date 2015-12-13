import net from 'net';
import { TLSSocket } from 'tls';
import createLog from '../log';

import StreamOperation from './stream_operation';

/**
 * TODO: Use some other not-hardcoded mechanism for log upload.
 */
const HOST = 'logs3.papertrailapp.com';
const PORT = 45075;

const log = createLog('outbox:papertrail_operation');

export default class PapertrailOperation extends StreamOperation {

  static NAME = 'papertrail';

  static StreamClass = () => {
    let sock = net.connect(PORT, HOST);
    let tlsSock = new TLSSocket(sock, {
      isServer: false,
      requestCert: true,
      rejectUnauthorized: true
    });

    tlsSock.once('clientError', (err) => {
      log.warn(`tls client error`, err.stack);
    });

    tlsSock.once('secureConnection', () => {
      log.info(`connected ${HOST} ${PORT}`);
    });

    return tlsSock;
  };

}

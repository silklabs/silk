/**
 * Factory for creating docker interfaces. NOTE: This assumes that you are using
 * docker toolbox (which everyone should be anyhow).
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import URL from 'url';

import Docker from 'dockerode-promise-es6';

export default function() {
  const {
    DOCKER_HOST,
    DOCKER_CERT_PATH
  } = process.env;

  assert(DOCKER_HOST, 'DOCKER_HOST env must be present');
  assert(DOCKER_CERT_PATH, 'DOCKER_CERT_PATH env must be present');

  let {hostname, port} = URL.parse(DOCKER_HOST);
  assert(hostname, 'DOCKER_HOST must have hostname');
  assert(port, 'DOCKER_HOST must have port');

  return new Docker({
    host: hostname,
    port,
    ca: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'ca.pem')),
    cert: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'cert.pem')),
    key: fs.readFileSync(path.join(DOCKER_CERT_PATH, 'key.pem')),
  });
}

'use strict';

const fork = require('child_process').fork;
const neuter = require('../main');
const net = require('net');
const port = parseInt(process.argv[2]);
const packet_size = 64 * 1024;

if (!Number.isNaN(port)) {
  const data = Buffer.alloc(packet_size, Math.random().toString(36));
  let cntr = 0;

  const connection = net.connect(port, () => {
    const start_time = Date.now();
    (function writeData() {
      if (Date.now() - start_time > 15000) return connection.end(data);
      connection.write(data, writeData);
    })();
  });
  return;
}


const should_neuter = !(process.argv[2] === '--no-neuter');
let bytes_read = 0;
let packets_received = 0;
let latest_timeout = null;
let last_time = null;

net.createServer((c) => {
  c.on('data', (chunk) => {
    bytes_read += chunk.length;
    packets_received++;
    // Perform operation on the Buffer, then manually free the memory. 
    if (should_neuter) neuter(chunk);
  });
}).listen(function() {
  const server_port = this.address().port;
  fork(__filename, [ server_port ]).on('close', () => {
    clearTimeout(latest_timeout);
    this.close();
  });
  latest_timeout = setTimeout(printBytesRead, 3000);
  last_time = process.hrtime();
});


function printBytesRead() {
  if (bytes_read <= 0) return;
  const t = process.hrtime(last_time);
  const sec = t[0] + t[1] / 1e9;
  const gbit = ((bytes_read / 1024 / 1024 / 1024 * 8) / sec).toFixed(2);
  prints(`${gbit} Gbit/sec   ${packets_received} packets`);
  bytes_read = 0;
  packets_received = 0;
  latest_timeout = setTimeout(printBytesRead, 3000);
  last_time = process.hrtime();
}


function prints() {
  const writeSync = require('fs').writeSync;
  const inspect = require('util').inspect;
  const args = arguments;
  for (let i = 0; i < args.length; i++) {
    const arg = typeof args[i] === 'string' ? args[i] : inspect(args[i]);
    writeSync(1, arg);
  }
  writeSync(1, '\n');
};

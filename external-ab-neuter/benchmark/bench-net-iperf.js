'use strict';

const neuter = require('../main');
const net = require('net');
const should_neuter = !(process.argv[2] === '--no-neuter');
let bytes_read = 0;
let packets_received = 0;
let last_time = null;


net.createServer(function(c) {
  c.on('data', (chunk) => {
    bytes_read += chunk.length;
    packets_received++;
    // Perform operation on the Buffer, then manually free the memory. 
    if (should_neuter) neuter(chunk);
  });
  c.on('close', () => this.close());
}).listen(5001, () => {
  setTimeout(printBytesRead, 3000).unref();
  last_time = process.hrtime();
});


function printBytesRead() {
  const t = process.hrtime(last_time);
  const sec = t[0] + t[1] / 1e9;
  const gbit = ((bytes_read / 1024 / 1024 / 1024 * 8) / sec).toFixed(2);
  prints(`${gbit} Gbit/sec   ${packets_received} packets`);
  bytes_read = 0;
  packets_received = 0;
  setTimeout(printBytesRead, 3000).unref();
  last_time = process.hrtime();
}


function prints() {
  const writeSync = require('fs').writeSync;
  const inspect = require('util').inspect;
  const args = arguments;
  let output = '';
  for (let i = 0; i < args.length; i++) {
    if (i > 0) output += ' ';
    output += typeof args[i] === 'string' ? args[i] : inspect(args[i]);
  }
  writeSync(1, output + '\n');
};


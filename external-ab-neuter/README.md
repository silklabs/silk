## `ArrayBuffer` Neuter

Remove the underlying data from an `ArrayBuffer` and free the memory manually.
For safety, only `ArrayBuffer`s that have not been externalized can be
neutered.


### Install

```
$ npm install ab-neuter
```

### Usage

```js
const neuter = require('ab-neuter');
const net = require('net');

net.createServer((c) => {
  c.on('data', (chunk) => {
    // Perform operation on the Buffer, then manually free the memory.
    neuter(chunk);
  });
}).listen();
```

### Benchmarks

The included benchmark creates a TCP server and client as a child process then
pumps as much data through as possible. Every three seconds it will print the
amount of Gbit/sec that have been transferred from the client to the server.
Run it using:

```
$ node benchmark/bench-net.js
```

By default the transferred `Buffer` will be neutered in the `'data'` callback.
To disable neutering pass `--no-neuter`:

```
$ node benchmark/bench-net.js --no-neuter
```

The benchmark has been optimized to show the maximum difference between the
two, and at the moment there's no way to change the parameters from the command
line.

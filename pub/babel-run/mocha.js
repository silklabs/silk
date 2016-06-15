process.on('unhandledRejection', (reason) => {
  setImmediate(() => {
    throw reason;
  });
});

require('./node')();

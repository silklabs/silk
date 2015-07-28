/**
Configuration profile used in tests.
*/

export default {
  server: {
    // XXX: This should be using 0 and then passing back the on-demand port
    // instead.
    port: 8888
  },
  testing: {
    value: true
  }
};

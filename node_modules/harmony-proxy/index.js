module.exports = process.env.ESPROXY_COV
  ? require('./lib-cov')
  : require('./lib');

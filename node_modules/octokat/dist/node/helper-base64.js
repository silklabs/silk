(function() {
  var base64encode;

  if (typeof window !== "undefined" && window !== null) {
    base64encode = window.btoa;
  } else if (typeof global !== "undefined" && global !== null ? global['Buffer'] : void 0) {
    base64encode = function(str) {
      var buffer;
      buffer = new global['Buffer'](str, 'binary');
      return buffer.toString('base64');
    };
  } else {
    throw new Error('Native btoa function or Buffer is missing');
  }

  module.exports = base64encode;

}).call(this);

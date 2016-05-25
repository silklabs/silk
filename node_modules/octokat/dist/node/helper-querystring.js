(function() {
  var toQueryString;

  toQueryString = function(options) {
    var key, params, ref, value;
    if (!options || options === {}) {
      return '';
    }
    params = [];
    ref = options || {};
    for (key in ref) {
      value = ref[key];
      params.push(key + "=" + (encodeURIComponent(value)));
    }
    return "?" + (params.join('&'));
  };

  module.exports = toQueryString;

}).call(this);

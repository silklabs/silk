"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = trackForMutations;

function trackForMutations(isImmutable, obj) {
  var trackedProperties = trackProperties(isImmutable, obj);
  return {
    detectMutations: function detectMutations() {
      return _detectMutations(isImmutable, trackedProperties, obj);
    }
  };
}

function trackProperties(isImmutable, obj) {
  var tracked = { value: obj };

  if (!isImmutable(obj)) {
    tracked.children = {};

    for (var key in obj) {
      tracked.children[key] = trackProperties(isImmutable, obj[key]);
    }
  }
  return tracked;
}

function _detectMutations(isImmutable, trackedProperty, obj) {
  var sameParentRef = arguments.length <= 3 || arguments[3] === undefined ? false : arguments[3];
  var path = arguments.length <= 4 || arguments[4] === undefined ? [] : arguments[4];

  var prevObj = trackedProperty ? trackedProperty.value : undefined;

  var sameRef = prevObj === obj;

  if (sameParentRef && !sameRef) {
    return { wasMutated: true, path: path };
  }

  if (isImmutable(prevObj) || isImmutable(obj)) {
    return { wasMutated: false };
  }

  // Gather all keys from prev (tracked) and after objs
  var keysToDetect = {};
  Object.keys(trackedProperty.children).forEach(function (key) {
    keysToDetect[key] = true;
  });
  Object.keys(obj).forEach(function (key) {
    keysToDetect[key] = true;
  });

  var keys = Object.keys(keysToDetect);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var result = _detectMutations(isImmutable, trackedProperty.children[key], obj[key], sameRef, path.concat(key));

    if (result.wasMutated) {
      return result;
    }
  }
  return { wasMutated: false };
}
module.exports = exports["default"];
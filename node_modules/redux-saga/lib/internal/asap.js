"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = asap;
var queue = [];
var isSuspended = false;

function asap(task) {
  if (!isSuspended) {
    isSuspended = true;
    queue.push(task);
    asap.flush();
  } else {
    queue.push(task);
  }
}

asap.suspend = function () {
  return isSuspended = true;
};
asap.flush = function () {
  var nextTask = void 0;
  while (nextTask = queue.shift()) {
    nextTask();
  }
  isSuspended = false;
};
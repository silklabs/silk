'use strict'

// ===================================================================

var AnyPromise = require('any-promise')

// ===================================================================

function makeEventAdder (emitter, arrayArg) {
  var addListener =
    emitter.addEventListener ||
    emitter.addListener ||
    emitter.on

  if (!addListener) {
    throw new Error('cannot register an event listener')
  }

  var removeListener =
    emitter.removeEventListener ||
    emitter.removeListener ||
    emitter.off

  var eventsAndListeners = []

  var cleanUp = removeListener && function () {
    for (var i = 0, n = eventsAndListeners.length; i < n; i += 2) {
      removeListener.call(emitter, eventsAndListeners[i], eventsAndListeners[i + 1])
    }
  }

  return function (event, cb) {
    function listener () {
      cleanUp && cleanUp()

      var arg
      var n = arguments.length
      if (arrayArg) {
        arg = new Array(n)
        for (var i = 0; i < n; ++i) {
          arg[i] = arguments[i]
        }
      } else {
        arg = n > 0 ? arguments[0] : undefined
      }

      cb(arg)
    }

    eventsAndListeners.push(event, listener)
    addListener.call(emitter, event, listener)
  }
}

// ===================================================================

function eventToPromise (emitter, event, opts) {
  return new AnyPromise(function (resolve, reject) {
    var addEvent = makeEventAdder(emitter, opts && opts.array)

    addEvent(event, resolve)

    if (!opts || !opts.ignoreErrors) {
      addEvent(opts && opts.error || 'error', reject)
    }
  })
}

var defaultErrorEvents = [ 'error' ]
eventToPromise.multi = function eventsToPromise (emitter, successEvents, errorEvents, opts) {
  errorEvents || (errorEvents = defaultErrorEvents)

  return new AnyPromise(function (resolve, reject) {
    var addEvent = makeEventAdder(emitter, opts && opts.array)

    var i, n
    for (i = 0, n = successEvents.length; i < n; ++i) {
      addEvent(successEvents[i], resolve)
    }
    for (i = 0, n = errorEvents.length; i < n; ++i) {
      addEvent(errorEvents[i], reject)
    }
  })
}

module.exports = eventToPromise

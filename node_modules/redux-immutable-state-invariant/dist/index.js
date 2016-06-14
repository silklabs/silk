'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports['default'] = immutableStateInvariantMiddleware;

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

var _invariant = require('invariant');

var _invariant2 = _interopRequireDefault(_invariant);

var _jsonStringifySafe = require('json-stringify-safe');

var _jsonStringifySafe2 = _interopRequireDefault(_jsonStringifySafe);

var _isImmutable = require('./isImmutable');

var _isImmutable2 = _interopRequireDefault(_isImmutable);

var _trackForMutations = require('./trackForMutations');

var _trackForMutations2 = _interopRequireDefault(_trackForMutations);

var BETWEEN_DISPATCHES_MESSAGE = ['A state mutation was detected between dispatches, in the path `%s`.', 'This may cause incorrect behavior.', '(http://redux.js.org/docs/Troubleshooting.html#never-mutate-reducer-arguments)'].join(' ');

var INSIDE_DISPATCH_MESSAGE = ['A state mutation was detected inside a dispatch, in the path: `%s`.', 'Take a look at the reducer(s) handling the action %s.', '(http://redux.js.org/docs/Troubleshooting.html#never-mutate-reducer-arguments)'].join(' ');

function immutableStateInvariantMiddleware() {
  var isImmutable = arguments.length <= 0 || arguments[0] === undefined ? _isImmutable2['default'] : arguments[0];

  var track = _trackForMutations2['default'].bind(null, isImmutable);

  return function (_ref) {
    var getState = _ref.getState;

    var state = getState();
    var tracker = track(state);

    var result = undefined;
    return function (next) {
      return function (action) {
        state = getState();

        result = tracker.detectMutations();
        // Track before potentially not meeting the invariant
        tracker = track(state);

        (0, _invariant2['default'])(!result.wasMutated, BETWEEN_DISPATCHES_MESSAGE, (result.path || []).join('.'));

        var dispatchedAction = next(action);
        state = getState();

        result = tracker.detectMutations();
        // Track before potentially not meeting the invariant
        tracker = track(state);

        (0, _invariant2['default'])(!result.wasMutated, INSIDE_DISPATCH_MESSAGE, (result.path || []).join('.'), (0, _jsonStringifySafe2['default'])(action));

        return dispatchedAction;
      };
    };
  };
}

module.exports = exports['default'];
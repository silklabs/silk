'use strict';

var _slicedToArray = require('babel-runtime/helpers/sliced-to-array')['default'];

var _Map = require('babel-runtime/core-js/map')['default'];

var _Set = require('babel-runtime/core-js/set')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

var _coreResolve = require('../core/resolve');

var _coreResolve2 = _interopRequireDefault(_coreResolve);

module.exports = function (context) {
  var imported = new _Map();
  return {
    'ImportDeclaration': function ImportDeclaration(n) {
      // resolved path will cover aliased duplicates
      var resolvedPath = (0, _coreResolve2['default'])(n.source.value, context) || n.source.value;

      if (imported.has(resolvedPath)) {
        imported.get(resolvedPath).add(n.source);
      } else {
        imported.set(resolvedPath, new _Set([n.source]));
      }
    },

    'Program:exit': function ProgramExit() {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(imported.entries()), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var _step$value = _slicedToArray(_step.value, 2);

          var _module2 = _step$value[0];
          var nodes = _step$value[1];

          if (nodes.size > 1) {
            var _iteratorNormalCompletion2 = true;
            var _didIteratorError2 = false;
            var _iteratorError2 = undefined;

            try {
              for (var _iterator2 = _getIterator(nodes), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
                var node = _step2.value;

                context.report(node, '\'' + _module2 + '\' imported multiple times.');
              }
            } catch (err) {
              _didIteratorError2 = true;
              _iteratorError2 = err;
            } finally {
              try {
                if (!_iteratorNormalCompletion2 && _iterator2['return']) {
                  _iterator2['return']();
                }
              } finally {
                if (_didIteratorError2) {
                  throw _iteratorError2;
                }
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator['return']) {
            _iterator['return']();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }
    }
  };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby1kdXBsaWNhdGVzLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OzsyQkFBb0IsaUJBQWlCOzs7O0FBRXJDLE1BQU0sQ0FBQyxPQUFPLEdBQUcsVUFBVSxPQUFPLEVBQUU7QUFDbEMsTUFBTSxRQUFRLEdBQUcsVUFBUyxDQUFBO0FBQzFCLFNBQU87QUFDTCx1QkFBbUIsRUFBRSwyQkFBVSxDQUFDLEVBQUU7O0FBRWhDLFVBQUksWUFBWSxHQUFHLDhCQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFBOztBQUVyRSxVQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLEVBQUU7QUFDOUIsZ0JBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtPQUN6QyxNQUFNO0FBQ0wsZ0JBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxFQUFFLFNBQVEsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFBO09BQ2hEO0tBQ0Y7O0FBRUQsa0JBQWMsRUFBRSx1QkFBWTs7Ozs7O0FBQzFCLDBDQUE0QixRQUFRLENBQUMsT0FBTyxFQUFFLDRHQUFFOzs7Y0FBdEMsUUFBTTtjQUFFLEtBQUs7O0FBQ3JCLGNBQUksS0FBSyxDQUFDLElBQUksR0FBRyxDQUFDLEVBQUU7Ozs7OztBQUNsQixpREFBaUIsS0FBSyxpSEFBRTtvQkFBZixJQUFJOztBQUNYLHVCQUFPLENBQUMsTUFBTSxDQUFDLElBQUksU0FBTSxRQUFNLGlDQUE2QixDQUFBO2VBQzdEOzs7Ozs7Ozs7Ozs7Ozs7V0FDRjtTQUNGOzs7Ozs7Ozs7Ozs7Ozs7S0FDRjtHQUNGLENBQUE7Q0FDRixDQUFBIiwiZmlsZSI6Im5vLWR1cGxpY2F0ZXMuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcmVzb2x2ZSBmcm9tICcuLi9jb3JlL3Jlc29sdmUnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbnRleHQpIHtcbiAgY29uc3QgaW1wb3J0ZWQgPSBuZXcgTWFwKClcbiAgcmV0dXJuIHtcbiAgICAnSW1wb3J0RGVjbGFyYXRpb24nOiBmdW5jdGlvbiAobikge1xuICAgICAgLy8gcmVzb2x2ZWQgcGF0aCB3aWxsIGNvdmVyIGFsaWFzZWQgZHVwbGljYXRlc1xuICAgICAgbGV0IHJlc29sdmVkUGF0aCA9IHJlc29sdmUobi5zb3VyY2UudmFsdWUsIGNvbnRleHQpIHx8IG4uc291cmNlLnZhbHVlXG5cbiAgICAgIGlmIChpbXBvcnRlZC5oYXMocmVzb2x2ZWRQYXRoKSkge1xuICAgICAgICBpbXBvcnRlZC5nZXQocmVzb2x2ZWRQYXRoKS5hZGQobi5zb3VyY2UpXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbXBvcnRlZC5zZXQocmVzb2x2ZWRQYXRoLCBuZXcgU2V0KFtuLnNvdXJjZV0pKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICAnUHJvZ3JhbTpleGl0JzogZnVuY3Rpb24gKCkge1xuICAgICAgZm9yIChsZXQgW21vZHVsZSwgbm9kZXNdIG9mIGltcG9ydGVkLmVudHJpZXMoKSkge1xuICAgICAgICBpZiAobm9kZXMuc2l6ZSA+IDEpIHtcbiAgICAgICAgICBmb3IgKGxldCBub2RlIG9mIG5vZGVzKSB7XG4gICAgICAgICAgICBjb250ZXh0LnJlcG9ydChub2RlLCBgJyR7bW9kdWxlfScgaW1wb3J0ZWQgbXVsdGlwbGUgdGltZXMuYClcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9LFxuICB9XG59XG4iXX0=
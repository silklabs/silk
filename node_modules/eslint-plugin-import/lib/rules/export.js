'use strict';

var _slicedToArray = require('babel-runtime/helpers/sliced-to-array')['default'];

var _Set = require('babel-runtime/core-js/set')['default'];

var _Map = require('babel-runtime/core-js/map')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

var _coreGetExports = require('../core/getExports');

var _coreGetExports2 = _interopRequireDefault(_coreGetExports);

module.exports = function (context) {
  var defaults = new _Set(),
      named = new _Map();

  function addNamed(name, node) {
    var nodes = named.get(name);

    if (nodes == null) {
      nodes = new _Set();
      named.set(name, nodes);
    }

    nodes.add(node);
  }

  return {
    'ExportDefaultDeclaration': function ExportDefaultDeclaration(node) {
      defaults.add(node);
    },

    'ExportSpecifier': function ExportSpecifier(node) {
      addNamed(node.exported.name, node.exported);
    },

    'ExportNamedDeclaration': function ExportNamedDeclaration(node) {
      if (node.declaration == null) return;

      if (node.declaration.id != null) {
        addNamed(node.declaration.id.name, node.declaration.id);
      }

      if (node.declaration.declarations != null) {
        var _iteratorNormalCompletion = true;
        var _didIteratorError = false;
        var _iteratorError = undefined;

        try {
          for (var _iterator = _getIterator(node.declaration.declarations), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
            var declaration = _step.value;

            (0, _coreGetExports.recursivePatternCapture)(declaration.id, function (v) {
              return addNamed(v.name, v);
            });
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
    },

    'ExportAllDeclaration': function ExportAllDeclaration(node) {
      if (node.source == null) return; // not sure if this is ever true

      var remoteExports = _coreGetExports2['default'].get(node.source.value, context);
      if (remoteExports == null) return;

      if (remoteExports.errors.length) {
        context.report({
          node: node.source,
          message: 'Parse errors in imported module ' + ('\'' + node.source.value + '\'.')
        });
        return;
      }

      if (!remoteExports.hasNamed) {
        context.report(node.source, 'No named exports found in module \'' + node.source.value + '\'.');
      }

      var _iteratorNormalCompletion2 = true;
      var _didIteratorError2 = false;
      var _iteratorError2 = undefined;

      try {
        for (var _iterator2 = _getIterator(remoteExports.named), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
          var _name = _step2.value;

          addNamed(_name, node);
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
    },

    'Program:exit': function ProgramExit() {
      if (defaults.size > 1) {
        var _iteratorNormalCompletion3 = true;
        var _didIteratorError3 = false;
        var _iteratorError3 = undefined;

        try {
          for (var _iterator3 = _getIterator(defaults), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
            var node = _step3.value;

            context.report(node, 'Multiple default exports.');
          }
        } catch (err) {
          _didIteratorError3 = true;
          _iteratorError3 = err;
        } finally {
          try {
            if (!_iteratorNormalCompletion3 && _iterator3['return']) {
              _iterator3['return']();
            }
          } finally {
            if (_didIteratorError3) {
              throw _iteratorError3;
            }
          }
        }
      }

      var _iteratorNormalCompletion4 = true;
      var _didIteratorError4 = false;
      var _iteratorError4 = undefined;

      try {
        for (var _iterator4 = _getIterator(named), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
          var _step4$value = _slicedToArray(_step4.value, 2);

          var _name2 = _step4$value[0];
          var nodes = _step4$value[1];

          if (nodes.size <= 1) continue;

          var _iteratorNormalCompletion5 = true;
          var _didIteratorError5 = false;
          var _iteratorError5 = undefined;

          try {
            for (var _iterator5 = _getIterator(nodes), _step5; !(_iteratorNormalCompletion5 = (_step5 = _iterator5.next()).done); _iteratorNormalCompletion5 = true) {
              var node = _step5.value;

              context.report(node, 'Multiple exports of name \'' + _name2 + '\'.');
            }
          } catch (err) {
            _didIteratorError5 = true;
            _iteratorError5 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion5 && _iterator5['return']) {
                _iterator5['return']();
              }
            } finally {
              if (_didIteratorError5) {
                throw _iteratorError5;
              }
            }
          }
        }
      } catch (err) {
        _didIteratorError4 = true;
        _iteratorError4 = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion4 && _iterator4['return']) {
            _iterator4['return']();
          }
        } finally {
          if (_didIteratorError4) {
            throw _iteratorError4;
          }
        }
      }
    }
  };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9leHBvcnQuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7OzhCQUFtRCxvQkFBb0I7Ozs7QUFFdkUsTUFBTSxDQUFDLE9BQU8sR0FBRyxVQUFVLE9BQU8sRUFBRTtBQUNsQyxNQUFNLFFBQVEsR0FBRyxVQUFTO01BQ3BCLEtBQUssR0FBRyxVQUFTLENBQUE7O0FBRXZCLFdBQVMsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUU7QUFDNUIsUUFBSSxLQUFLLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTs7QUFFM0IsUUFBSSxLQUFLLElBQUksSUFBSSxFQUFFO0FBQ2pCLFdBQUssR0FBRyxVQUFTLENBQUE7QUFDakIsV0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUE7S0FDdkI7O0FBRUQsU0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQTtHQUNoQjs7QUFFRCxTQUFPO0FBQ0wsOEJBQTBCLEVBQUUsa0NBQVUsSUFBSSxFQUFFO0FBQzFDLGNBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUE7S0FDbkI7O0FBRUQscUJBQWlCLEVBQUUseUJBQVUsSUFBSSxFQUFFO0FBQ2pDLGNBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7S0FDNUM7O0FBRUQsNEJBQXdCLEVBQUUsZ0NBQVUsSUFBSSxFQUFFO0FBQ3hDLFVBQUksSUFBSSxDQUFDLFdBQVcsSUFBSSxJQUFJLEVBQUUsT0FBTTs7QUFFcEMsVUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsSUFBSSxJQUFJLEVBQUU7QUFDL0IsZ0JBQVEsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLFdBQVcsQ0FBQyxFQUFFLENBQUMsQ0FBQTtPQUN4RDs7QUFFRCxVQUFJLElBQUksQ0FBQyxXQUFXLENBQUMsWUFBWSxJQUFJLElBQUksRUFBRTs7Ozs7O0FBQ3pDLDRDQUF3QixJQUFJLENBQUMsV0FBVyxDQUFDLFlBQVksNEdBQUU7Z0JBQTlDLFdBQVc7O0FBQ2xCLHlEQUF3QixXQUFXLENBQUMsRUFBRSxFQUFFLFVBQUEsQ0FBQztxQkFBSSxRQUFRLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7YUFBQSxDQUFDLENBQUE7V0FDbEU7Ozs7Ozs7Ozs7Ozs7OztPQUNGO0tBQ0Y7O0FBRUQsMEJBQXNCLEVBQUUsOEJBQVUsSUFBSSxFQUFFO0FBQ3RDLFVBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLEVBQUUsT0FBTTs7QUFFL0IsVUFBTSxhQUFhLEdBQUcsNEJBQVUsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFBO0FBQy9ELFVBQUksYUFBYSxJQUFJLElBQUksRUFBRSxPQUFNOztBQUVqQyxVQUFJLGFBQWEsQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO0FBQy9CLGVBQU8sQ0FBQyxNQUFNLENBQUM7QUFDYixjQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU07QUFDakIsaUJBQU8sRUFBRSw2Q0FDSSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssU0FBSTtTQUNuQyxDQUFDLENBQUE7QUFDRixlQUFNO09BQ1A7O0FBRUQsVUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLEVBQUU7QUFDM0IsZUFBTyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsTUFBTSwwQ0FDYSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssU0FBSyxDQUFBO09BQzlEOzs7Ozs7O0FBRUQsMkNBQWlCLGFBQWEsQ0FBQyxLQUFLLGlIQUFFO2NBQTdCLEtBQUk7O0FBQ1gsa0JBQVEsQ0FBQyxLQUFJLEVBQUUsSUFBSSxDQUFDLENBQUE7U0FDckI7Ozs7Ozs7Ozs7Ozs7OztLQUNGOztBQUVELGtCQUFjLEVBQUUsdUJBQVk7QUFDMUIsVUFBSSxRQUFRLENBQUMsSUFBSSxHQUFHLENBQUMsRUFBRTs7Ozs7O0FBQ3JCLDZDQUFpQixRQUFRLGlIQUFFO2dCQUFsQixJQUFJOztBQUNYLG1CQUFPLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSwyQkFBMkIsQ0FBQyxDQUFBO1dBQ2xEOzs7Ozs7Ozs7Ozs7Ozs7T0FDRjs7Ozs7OztBQUVELDJDQUEwQixLQUFLLGlIQUFFOzs7Y0FBdkIsTUFBSTtjQUFFLEtBQUs7O0FBQ25CLGNBQUksS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsU0FBUTs7Ozs7OztBQUU3QiwrQ0FBaUIsS0FBSyxpSEFBRTtrQkFBZixJQUFJOztBQUNYLHFCQUFPLENBQUMsTUFBTSxDQUFDLElBQUksa0NBQStCLE1BQUksU0FBSyxDQUFBO2FBQzVEOzs7Ozs7Ozs7Ozs7Ozs7U0FDRjs7Ozs7Ozs7Ozs7Ozs7O0tBQ0Y7R0FDRixDQUFBO0NBQ0YsQ0FBQSIsImZpbGUiOiJleHBvcnQuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgRXhwb3J0TWFwLCB7IHJlY3Vyc2l2ZVBhdHRlcm5DYXB0dXJlIH0gZnJvbSAnLi4vY29yZS9nZXRFeHBvcnRzJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb250ZXh0KSB7XG4gIGNvbnN0IGRlZmF1bHRzID0gbmV3IFNldCgpXG4gICAgICAsIG5hbWVkID0gbmV3IE1hcCgpXG5cbiAgZnVuY3Rpb24gYWRkTmFtZWQobmFtZSwgbm9kZSkge1xuICAgIGxldCBub2RlcyA9IG5hbWVkLmdldChuYW1lKVxuXG4gICAgaWYgKG5vZGVzID09IG51bGwpIHtcbiAgICAgIG5vZGVzID0gbmV3IFNldCgpXG4gICAgICBuYW1lZC5zZXQobmFtZSwgbm9kZXMpXG4gICAgfVxuXG4gICAgbm9kZXMuYWRkKG5vZGUpXG4gIH1cblxuICByZXR1cm4ge1xuICAgICdFeHBvcnREZWZhdWx0RGVjbGFyYXRpb24nOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgZGVmYXVsdHMuYWRkKG5vZGUpXG4gICAgfSxcblxuICAgICdFeHBvcnRTcGVjaWZpZXInOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgYWRkTmFtZWQobm9kZS5leHBvcnRlZC5uYW1lLCBub2RlLmV4cG9ydGVkKVxuICAgIH0sXG5cbiAgICAnRXhwb3J0TmFtZWREZWNsYXJhdGlvbic6IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICBpZiAobm9kZS5kZWNsYXJhdGlvbiA9PSBudWxsKSByZXR1cm5cblxuICAgICAgaWYgKG5vZGUuZGVjbGFyYXRpb24uaWQgIT0gbnVsbCkge1xuICAgICAgICBhZGROYW1lZChub2RlLmRlY2xhcmF0aW9uLmlkLm5hbWUsIG5vZGUuZGVjbGFyYXRpb24uaWQpXG4gICAgICB9XG5cbiAgICAgIGlmIChub2RlLmRlY2xhcmF0aW9uLmRlY2xhcmF0aW9ucyAhPSBudWxsKSB7XG4gICAgICAgIGZvciAobGV0IGRlY2xhcmF0aW9uIG9mIG5vZGUuZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zKSB7XG4gICAgICAgICAgcmVjdXJzaXZlUGF0dGVybkNhcHR1cmUoZGVjbGFyYXRpb24uaWQsIHYgPT4gYWRkTmFtZWQodi5uYW1lLCB2KSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG5cbiAgICAnRXhwb3J0QWxsRGVjbGFyYXRpb24nOiBmdW5jdGlvbiAobm9kZSkge1xuICAgICAgaWYgKG5vZGUuc291cmNlID09IG51bGwpIHJldHVybiAvLyBub3Qgc3VyZSBpZiB0aGlzIGlzIGV2ZXIgdHJ1ZVxuXG4gICAgICBjb25zdCByZW1vdGVFeHBvcnRzID0gRXhwb3J0TWFwLmdldChub2RlLnNvdXJjZS52YWx1ZSwgY29udGV4dClcbiAgICAgIGlmIChyZW1vdGVFeHBvcnRzID09IG51bGwpIHJldHVyblxuXG4gICAgICBpZiAocmVtb3RlRXhwb3J0cy5lcnJvcnMubGVuZ3RoKSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KHtcbiAgICAgICAgICBub2RlOiBub2RlLnNvdXJjZSxcbiAgICAgICAgICBtZXNzYWdlOiBgUGFyc2UgZXJyb3JzIGluIGltcG9ydGVkIG1vZHVsZSBgICtcbiAgICAgICAgICAgICAgICAgICBgJyR7bm9kZS5zb3VyY2UudmFsdWV9Jy5gLFxuICAgICAgICB9KVxuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgaWYgKCFyZW1vdGVFeHBvcnRzLmhhc05hbWVkKSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KG5vZGUuc291cmNlLFxuICAgICAgICAgIGBObyBuYW1lZCBleHBvcnRzIGZvdW5kIGluIG1vZHVsZSAnJHtub2RlLnNvdXJjZS52YWx1ZX0nLmApXG4gICAgICB9XG5cbiAgICAgIGZvciAobGV0IG5hbWUgb2YgcmVtb3RlRXhwb3J0cy5uYW1lZCkge1xuICAgICAgICBhZGROYW1lZChuYW1lLCBub2RlKVxuICAgICAgfVxuICAgIH0sXG5cbiAgICAnUHJvZ3JhbTpleGl0JzogZnVuY3Rpb24gKCkge1xuICAgICAgaWYgKGRlZmF1bHRzLnNpemUgPiAxKSB7XG4gICAgICAgIGZvciAobGV0IG5vZGUgb2YgZGVmYXVsdHMpIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydChub2RlLCAnTXVsdGlwbGUgZGVmYXVsdCBleHBvcnRzLicpXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZm9yIChsZXQgW25hbWUsIG5vZGVzXSBvZiBuYW1lZCkge1xuICAgICAgICBpZiAobm9kZXMuc2l6ZSA8PSAxKSBjb250aW51ZVxuXG4gICAgICAgIGZvciAobGV0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydChub2RlLCBgTXVsdGlwbGUgZXhwb3J0cyBvZiBuYW1lICcke25hbWV9Jy5gKVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfSxcbiAgfVxufVxuIl19
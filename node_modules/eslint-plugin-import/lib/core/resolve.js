'use strict';

var _slicedToArray = require('babel-runtime/helpers/sliced-to-array')['default'];

var _Map = require('babel-runtime/core-js/map')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.relative = relative;
exports['default'] = resolve;

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var CASE_INSENSITIVE = _fs2['default'].existsSync((0, _path.join)(__dirname, 'reSOLVE.js'));

// http://stackoverflow.com/a/27382838
function fileExistsWithCaseSync(_x) {
  var _again = true;

  _function: while (_again) {
    var filepath = _x;
    _again = false;

    var dir = (0, _path.dirname)(filepath);
    if (dir === '/' || dir === '.' || /^[A-Z]:\\$/i.test(dir)) return true;
    var filenames = _fs2['default'].readdirSync(dir);
    if (filenames.indexOf((0, _path.basename)(filepath)) === -1) {
      return false;
    }
    _x = dir;
    _again = true;
    dir = filenames = undefined;
    continue _function;
  }
}

function fileExists(filepath) {
  if (CASE_INSENSITIVE) {
    // short-circuit if path doesn't exist, ignoring case
    return !(!_fs2['default'].existsSync(filepath) || !fileExistsWithCaseSync(filepath));
  } else {
    return _fs2['default'].existsSync(filepath);
  }
}

function relative(modulePath, sourceFile, settings) {

  function withResolver(resolver, config) {
    // resolve just returns the core module id, which won't appear to exist
    try {
      var filePath = resolver.resolveImport(modulePath, sourceFile, config);
      if (filePath === null) return null;

      if (filePath === undefined || !fileExists(filePath)) return undefined;

      return filePath;
    } catch (err) {
      return undefined;
    }
  }

  var configResolvers = settings['import/resolver'] || { 'node': settings['import/resolve'] }; // backward compatibility

  var resolvers = resolverReducer(configResolvers, new _Map());

  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = _getIterator(resolvers.entries()), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var _step$value = _slicedToArray(_step.value, 2);

      var _name = _step$value[0];
      var config = _step$value[1];

      var resolver = require('eslint-import-resolver-' + _name);

      var fullPath = withResolver(resolver, config);
      if (fullPath !== undefined) return fullPath;
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

function resolverReducer(resolvers, map) {
  if (resolvers instanceof Array) {
    resolvers.forEach(function (r) {
      return resolverReducer(r, map);
    });
    return map;
  }

  if (typeof resolvers === 'string') {
    map.set(resolvers, null);
    return map;
  }

  if (typeof resolvers === 'object') {
    for (var key in resolvers) {
      map.set(key, resolvers[key]);
    }
    return map;
  }

  throw new Error('invalid resolver config');
}

/**
 * Givent
 * @param  {string} p - module path
 * @param  {object} context - ESLint context
 * @return {string} - the full module filesystem path;
 *                    null if package is core;
 *                    undefined if not found
 */

function resolve(p, context) {
  return relative(p, context.getFilename(), context.settings);
}

resolve.relative = relative;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb3JlL3Jlc29sdmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7cUJBb0Z3QixPQUFPOztrQkFwRmhCLElBQUk7Ozs7b0JBQ3FCLE1BQU07O0FBRTlDLElBQU0sZ0JBQWdCLEdBQUcsZ0JBQUcsVUFBVSxDQUFDLGdCQUFLLFNBQVMsRUFBRSxZQUFZLENBQUMsQ0FBQyxDQUFBOzs7QUFHckUsU0FBUyxzQkFBc0I7Ozs0QkFBVztRQUFWLFFBQVE7OztBQUN0QyxRQUFJLEdBQUcsR0FBRyxtQkFBUSxRQUFRLENBQUMsQ0FBQTtBQUMzQixRQUFJLEdBQUcsS0FBSyxHQUFHLElBQUksR0FBRyxLQUFLLEdBQUcsSUFBSSxhQUFhLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLE9BQU8sSUFBSSxDQUFBO0FBQ3RFLFFBQUksU0FBUyxHQUFHLGdCQUFHLFdBQVcsQ0FBQyxHQUFHLENBQUMsQ0FBQTtBQUNuQyxRQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsb0JBQVMsUUFBUSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRTtBQUM5QyxhQUFPLEtBQUssQ0FBQTtLQUNmO1NBQzZCLEdBQUc7O0FBTjdCLE9BQUcsR0FFSCxTQUFTOztHQUtkO0NBQUE7O0FBRUQsU0FBUyxVQUFVLENBQUMsUUFBUSxFQUFFO0FBQzVCLE1BQUksZ0JBQWdCLEVBQUU7O0FBRXBCLFdBQU8sRUFBRSxDQUFDLGdCQUFHLFVBQVUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsQ0FBQyxDQUFBLEFBQUMsQ0FBQTtHQUN4RSxNQUFNO0FBQ0wsV0FBTyxnQkFBRyxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUE7R0FDL0I7Q0FDRjs7QUFFTSxTQUFTLFFBQVEsQ0FBQyxVQUFVLEVBQUUsVUFBVSxFQUFFLFFBQVEsRUFBRTs7QUFFekQsV0FBUyxZQUFZLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRTs7QUFFdEMsUUFBSTtBQUNGLFVBQU0sUUFBUSxHQUFHLFFBQVEsQ0FBQyxhQUFhLENBQUMsVUFBVSxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUN2RSxVQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUUsT0FBTyxJQUFJLENBQUE7O0FBRWxDLFVBQUksUUFBUSxLQUFLLFNBQVMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRSxPQUFPLFNBQVMsQ0FBQTs7QUFFckUsYUFBTyxRQUFRLENBQUE7S0FDaEIsQ0FBQyxPQUFPLEdBQUcsRUFBRTtBQUNaLGFBQU8sU0FBUyxDQUFBO0tBQ2pCO0dBQ0Y7O0FBRUQsTUFBTSxlQUFlLEdBQUksUUFBUSxDQUFDLGlCQUFpQixDQUFDLElBQy9DLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxFQUFFLEFBQUMsQ0FBQTs7QUFFNUMsTUFBTSxTQUFTLEdBQUcsZUFBZSxDQUFDLGVBQWUsRUFBRSxVQUFTLENBQUMsQ0FBQTs7Ozs7OztBQUU3RCxzQ0FBMkIsU0FBUyxDQUFDLE9BQU8sRUFBRSw0R0FBRTs7O1VBQXRDLEtBQUk7VUFBRSxNQUFNOztBQUNwQixVQUFNLFFBQVEsR0FBRyxPQUFPLDZCQUEyQixLQUFJLENBQUcsQ0FBQTs7QUFFMUQsVUFBSSxRQUFRLEdBQUcsWUFBWSxDQUFDLFFBQVEsRUFBRSxNQUFNLENBQUMsQ0FBQTtBQUM3QyxVQUFJLFFBQVEsS0FBSyxTQUFTLEVBQUUsT0FBTyxRQUFRLENBQUE7S0FDNUM7Ozs7Ozs7Ozs7Ozs7OztDQUVGOztBQUVELFNBQVMsZUFBZSxDQUFDLFNBQVMsRUFBRSxHQUFHLEVBQUU7QUFDdkMsTUFBSSxTQUFTLFlBQVksS0FBSyxFQUFFO0FBQzlCLGFBQVMsQ0FBQyxPQUFPLENBQUMsVUFBQSxDQUFDO2FBQUksZUFBZSxDQUFDLENBQUMsRUFBRSxHQUFHLENBQUM7S0FBQSxDQUFDLENBQUE7QUFDL0MsV0FBTyxHQUFHLENBQUE7R0FDWDs7QUFFRCxNQUFJLE9BQU8sU0FBUyxLQUFLLFFBQVEsRUFBRTtBQUNqQyxPQUFHLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQTtBQUN4QixXQUFPLEdBQUcsQ0FBQTtHQUNYOztBQUVELE1BQUksT0FBTyxTQUFTLEtBQUssUUFBUSxFQUFFO0FBQ2pDLFNBQUssSUFBSSxHQUFHLElBQUksU0FBUyxFQUFFO0FBQ3pCLFNBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO0tBQzdCO0FBQ0QsV0FBTyxHQUFHLENBQUE7R0FDWDs7QUFFRCxRQUFNLElBQUksS0FBSyxDQUFDLHlCQUF5QixDQUFDLENBQUE7Q0FDM0M7Ozs7Ozs7Ozs7O0FBVWMsU0FBUyxPQUFPLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRTtBQUMxQyxTQUFPLFFBQVEsQ0FBRSxDQUFDLEVBQ0QsT0FBTyxDQUFDLFdBQVcsRUFBRSxFQUNyQixPQUFPLENBQUMsUUFBUSxDQUNqQixDQUFBO0NBQ2pCOztBQUNELE9BQU8sQ0FBQyxRQUFRLEdBQUcsUUFBUSxDQUFBIiwiZmlsZSI6InJlc29sdmUuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgZnMgZnJvbSAnZnMnXG5pbXBvcnQgeyBkaXJuYW1lLCBiYXNlbmFtZSwgam9pbiB9IGZyb20gJ3BhdGgnXG5cbmNvbnN0IENBU0VfSU5TRU5TSVRJVkUgPSBmcy5leGlzdHNTeW5jKGpvaW4oX19kaXJuYW1lLCAncmVTT0xWRS5qcycpKVxuXG4vLyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8yNzM4MjgzOFxuZnVuY3Rpb24gZmlsZUV4aXN0c1dpdGhDYXNlU3luYyhmaWxlcGF0aCkge1xuICB2YXIgZGlyID0gZGlybmFtZShmaWxlcGF0aClcbiAgaWYgKGRpciA9PT0gJy8nIHx8IGRpciA9PT0gJy4nIHx8IC9eW0EtWl06XFxcXCQvaS50ZXN0KGRpcikpIHJldHVybiB0cnVlXG4gIHZhciBmaWxlbmFtZXMgPSBmcy5yZWFkZGlyU3luYyhkaXIpXG4gIGlmIChmaWxlbmFtZXMuaW5kZXhPZihiYXNlbmFtZShmaWxlcGF0aCkpID09PSAtMSkge1xuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbiAgcmV0dXJuIGZpbGVFeGlzdHNXaXRoQ2FzZVN5bmMoZGlyKVxufVxuXG5mdW5jdGlvbiBmaWxlRXhpc3RzKGZpbGVwYXRoKSB7XG4gIGlmIChDQVNFX0lOU0VOU0lUSVZFKSB7XG4gICAgLy8gc2hvcnQtY2lyY3VpdCBpZiBwYXRoIGRvZXNuJ3QgZXhpc3QsIGlnbm9yaW5nIGNhc2VcbiAgICByZXR1cm4gISghZnMuZXhpc3RzU3luYyhmaWxlcGF0aCkgfHwgIWZpbGVFeGlzdHNXaXRoQ2FzZVN5bmMoZmlsZXBhdGgpKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBmcy5leGlzdHNTeW5jKGZpbGVwYXRoKVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZWxhdGl2ZShtb2R1bGVQYXRoLCBzb3VyY2VGaWxlLCBzZXR0aW5ncykge1xuXG4gIGZ1bmN0aW9uIHdpdGhSZXNvbHZlcihyZXNvbHZlciwgY29uZmlnKSB7XG4gICAgLy8gcmVzb2x2ZSBqdXN0IHJldHVybnMgdGhlIGNvcmUgbW9kdWxlIGlkLCB3aGljaCB3b24ndCBhcHBlYXIgdG8gZXhpc3RcbiAgICB0cnkge1xuICAgICAgY29uc3QgZmlsZVBhdGggPSByZXNvbHZlci5yZXNvbHZlSW1wb3J0KG1vZHVsZVBhdGgsIHNvdXJjZUZpbGUsIGNvbmZpZylcbiAgICAgIGlmIChmaWxlUGF0aCA9PT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgICAgaWYgKGZpbGVQYXRoID09PSB1bmRlZmluZWQgfHwgIWZpbGVFeGlzdHMoZmlsZVBhdGgpKSByZXR1cm4gdW5kZWZpbmVkXG5cbiAgICAgIHJldHVybiBmaWxlUGF0aFxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IGNvbmZpZ1Jlc29sdmVycyA9IChzZXR0aW5nc1snaW1wb3J0L3Jlc29sdmVyJ11cbiAgICB8fCB7ICdub2RlJzogc2V0dGluZ3NbJ2ltcG9ydC9yZXNvbHZlJ10gfSkgLy8gYmFja3dhcmQgY29tcGF0aWJpbGl0eVxuXG4gIGNvbnN0IHJlc29sdmVycyA9IHJlc29sdmVyUmVkdWNlcihjb25maWdSZXNvbHZlcnMsIG5ldyBNYXAoKSlcblxuICBmb3IgKGxldCBbbmFtZSwgY29uZmlnXSBvZiByZXNvbHZlcnMuZW50cmllcygpKSB7XG4gICAgY29uc3QgcmVzb2x2ZXIgPSByZXF1aXJlKGBlc2xpbnQtaW1wb3J0LXJlc29sdmVyLSR7bmFtZX1gKVxuXG4gICAgbGV0IGZ1bGxQYXRoID0gd2l0aFJlc29sdmVyKHJlc29sdmVyLCBjb25maWcpXG4gICAgaWYgKGZ1bGxQYXRoICE9PSB1bmRlZmluZWQpIHJldHVybiBmdWxsUGF0aFxuICB9XG5cbn1cblxuZnVuY3Rpb24gcmVzb2x2ZXJSZWR1Y2VyKHJlc29sdmVycywgbWFwKSB7XG4gIGlmIChyZXNvbHZlcnMgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJlc29sdmVycy5mb3JFYWNoKHIgPT4gcmVzb2x2ZXJSZWR1Y2VyKHIsIG1hcCkpXG4gICAgcmV0dXJuIG1hcFxuICB9XG5cbiAgaWYgKHR5cGVvZiByZXNvbHZlcnMgPT09ICdzdHJpbmcnKSB7XG4gICAgbWFwLnNldChyZXNvbHZlcnMsIG51bGwpXG4gICAgcmV0dXJuIG1hcFxuICB9XG5cbiAgaWYgKHR5cGVvZiByZXNvbHZlcnMgPT09ICdvYmplY3QnKSB7XG4gICAgZm9yIChsZXQga2V5IGluIHJlc29sdmVycykge1xuICAgICAgbWFwLnNldChrZXksIHJlc29sdmVyc1trZXldKVxuICAgIH1cbiAgICByZXR1cm4gbWFwXG4gIH1cblxuICB0aHJvdyBuZXcgRXJyb3IoJ2ludmFsaWQgcmVzb2x2ZXIgY29uZmlnJylcbn1cblxuLyoqXG4gKiBHaXZlbnRcbiAqIEBwYXJhbSAge3N0cmluZ30gcCAtIG1vZHVsZSBwYXRoXG4gKiBAcGFyYW0gIHtvYmplY3R9IGNvbnRleHQgLSBFU0xpbnQgY29udGV4dFxuICogQHJldHVybiB7c3RyaW5nfSAtIHRoZSBmdWxsIG1vZHVsZSBmaWxlc3lzdGVtIHBhdGg7XG4gKiAgICAgICAgICAgICAgICAgICAgbnVsbCBpZiBwYWNrYWdlIGlzIGNvcmU7XG4gKiAgICAgICAgICAgICAgICAgICAgdW5kZWZpbmVkIGlmIG5vdCBmb3VuZFxuICovXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiByZXNvbHZlKHAsIGNvbnRleHQpIHtcbiAgcmV0dXJuIHJlbGF0aXZlKCBwXG4gICAgICAgICAgICAgICAgICwgY29udGV4dC5nZXRGaWxlbmFtZSgpXG4gICAgICAgICAgICAgICAgICwgY29udGV4dC5zZXR0aW5nc1xuICAgICAgICAgICAgICAgICApXG59XG5yZXNvbHZlLnJlbGF0aXZlID0gcmVsYXRpdmVcbiJdfQ==
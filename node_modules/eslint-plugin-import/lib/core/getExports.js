'use strict';

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _Map = require('babel-runtime/core-js/map')['default'];

var _Set = require('babel-runtime/core-js/set')['default'];

var _interopRequireWildcard = require('babel-runtime/helpers/interop-require-wildcard')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
  value: true
});
exports.recursivePatternCapture = recursivePatternCapture;

var _fs = require('fs');

var fs = _interopRequireWildcard(_fs);

var _crypto = require('crypto');

var _parse2 = require('./parse');

var _parse3 = _interopRequireDefault(_parse2);

var _resolve = require('./resolve');

var _resolve2 = _interopRequireDefault(_resolve);

var _ignore = require('./ignore');

var _ignore2 = _interopRequireDefault(_ignore);

// map from settings sha1 => path => export map objects
var exportCaches = new _Map();

var ExportMap = (function () {
  function ExportMap(context) {
    _classCallCheck(this, ExportMap);

    this.context = context;
    this.named = new _Set();

    this.errors = [];
  }

  /**
   * Traverse a patter/identifier node, calling 'callback'
   * for each leaf identifier.
   * @param  {node}   pattern
   * @param  {Function} callback
   * @return {void}
   */

  _createClass(ExportMap, [{
    key: 'resolveReExport',
    value: function resolveReExport(node, base) {
      var remotePath = _resolve2['default'].relative(node.source.value, base, this.settings);
      if (remotePath == null) return null;

      return ExportMap['for'](remotePath, this.context);
    }
  }, {
    key: 'captureDefault',
    value: function captureDefault(n) {
      if (n.type !== 'ExportDefaultDeclaration') return;
      this.named.add('default');
    }

    /**
     * capture all named exports from remote module.
     *
     * returns null if this node wasn't an ExportAllDeclaration
     * returns false if it was not resolved
     * returns true if it was resolved + parsed
     *
     * @param  {node} n
     * @param  {string} path - the path of the module currently parsing
     * @return {boolean?}
     */
  }, {
    key: 'captureAll',
    value: function captureAll(n, path) {
      if (n.type !== 'ExportAllDeclaration') return null;

      var remoteMap = this.resolveReExport(n, path);
      if (remoteMap == null) return false;

      remoteMap.named.forEach((function (name) {
        this.named.add(name);
      }).bind(this));

      return true;
    }
  }, {
    key: 'captureNamedDeclaration',
    value: function captureNamedDeclaration(n, path) {
      var _this = this;

      if (n.type !== 'ExportNamedDeclaration') return;

      // capture declaration
      if (n.declaration != null) {
        switch (n.declaration.type) {
          case 'FunctionDeclaration':
          case 'ClassDeclaration':
          case 'TypeAlias':
            // flowtype with babel-eslint parser
            this.named.add(n.declaration.id.name);
            break;
          case 'VariableDeclaration':
            n.declaration.declarations.forEach(function (d) {
              return recursivePatternCapture(d.id, function (id) {
                return _this.named.add(id.name);
              });
            });
            break;
        }
      }

      // capture specifiers
      var remoteMap = undefined;
      if (n.source) remoteMap = this.resolveReExport(n, path);

      n.specifiers.forEach((function (s) {
        if (s.type === 'ExportDefaultSpecifier') {
          // don't add it if it is not present in the exported module
          if (!remoteMap || !remoteMap.hasDefault) return;
        }

        this.named.add(s.exported.name);
      }).bind(this));
    }
  }, {
    key: 'settings',
    get: function get() {
      return this.context && this.context.settings;
    }
  }, {
    key: 'hasDefault',
    get: function get() {
      return this.named.has('default');
    }
  }, {
    key: 'hasNamed',
    get: function get() {
      return this.named.size > (this.hasDefault ? 1 : 0);
    }
  }], [{
    key: 'get',
    value: function get(source, context) {

      var path = (0, _resolve2['default'])(source, context);
      if (path == null) return null;

      return ExportMap['for'](path, context);
    }
  }, {
    key: 'for',
    value: function _for(path, context) {
      var exportMap = undefined;

      var cacheKey = hashObject(context.settings);
      var exportCache = exportCaches.get(cacheKey);
      if (exportCache === undefined) {
        exportCache = new _Map();
        exportCaches.set(cacheKey, exportCache);
      }

      exportMap = exportCache.get(path);
      // return cached ignore
      if (exportMap === null) return null;

      var stats = fs.statSync(path);
      if (exportMap != null) {
        // date equality check
        if (exportMap.mtime - stats.mtime === 0) {
          return exportMap;
        }
        // future: check content equality?
      }

      exportMap = ExportMap.parse(path, context);
      exportMap.mtime = stats.mtime;

      // ignore empties, optionally
      if (exportMap.named.size === 0 && (0, _ignore2['default'])(path, context)) {
        exportMap = null;
      }

      exportCache.set(path, exportMap);

      return exportMap;
    }
  }, {
    key: 'parse',
    value: function parse(path, context) {
      var m = new ExportMap(context);

      try {
        var ast = (0, _parse3['default'])(path, context);
      } catch (err) {
        m.errors.push(err);
        return m; // can't continue
      }

      ast.body.forEach(function (n) {
        m.captureDefault(n);
        m.captureAll(n, path);
        m.captureNamedDeclaration(n, path);
      });

      return m;
    }
  }]);

  return ExportMap;
})();

exports['default'] = ExportMap;

function recursivePatternCapture(pattern, callback) {
  switch (pattern.type) {
    case 'Identifier':
      // base case
      callback(pattern);
      break;

    case 'ObjectPattern':
      pattern.properties.forEach(function (_ref) {
        var value = _ref.value;

        recursivePatternCapture(value, callback);
      });
      break;

    case 'ArrayPattern':
      pattern.elements.forEach(function (element) {
        if (element == null) return;
        recursivePatternCapture(element, callback);
      });
      break;
  }
}

function hashObject(object) {
  var settingsShasum = (0, _crypto.createHash)('sha1');
  settingsShasum.update(JSON.stringify(object));
  return settingsShasum.digest('hex');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb3JlL2dldEV4cG9ydHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7OztrQkFBb0IsSUFBSTs7SUFBWixFQUFFOztzQkFFYSxRQUFROztzQkFFakIsU0FBUzs7Ozt1QkFDUCxXQUFXOzs7O3NCQUNULFVBQVU7Ozs7O0FBR2hDLElBQU0sWUFBWSxHQUFHLFVBQVMsQ0FBQTs7SUFFVCxTQUFTO0FBQ2pCLFdBRFEsU0FBUyxDQUNoQixPQUFPLEVBQUU7MEJBREYsU0FBUzs7QUFFMUIsUUFBSSxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUE7QUFDdEIsUUFBSSxDQUFDLEtBQUssR0FBRyxVQUFTLENBQUE7O0FBRXRCLFFBQUksQ0FBQyxNQUFNLEdBQUcsRUFBRSxDQUFBO0dBQ2pCOzs7Ozs7Ozs7O2VBTmtCLFNBQVM7O1dBNEViLHlCQUFDLElBQUksRUFBRSxJQUFJLEVBQUU7QUFDMUIsVUFBSSxVQUFVLEdBQUcscUJBQVEsUUFBUSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUE7QUFDekUsVUFBSSxVQUFVLElBQUksSUFBSSxFQUFFLE9BQU8sSUFBSSxDQUFBOztBQUVuQyxhQUFPLFNBQVMsT0FBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUE7S0FDL0M7OztXQUVhLHdCQUFDLENBQUMsRUFBRTtBQUNoQixVQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssMEJBQTBCLEVBQUUsT0FBTTtBQUNqRCxVQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsQ0FBQTtLQUMxQjs7Ozs7Ozs7Ozs7Ozs7O1dBYVMsb0JBQUMsQ0FBQyxFQUFFLElBQUksRUFBRTtBQUNsQixVQUFJLENBQUMsQ0FBQyxJQUFJLEtBQUssc0JBQXNCLEVBQUUsT0FBTyxJQUFJLENBQUE7O0FBRWxELFVBQUksU0FBUyxHQUFH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QVcsTUFBTSxDQUFDLENBQUE7QUFDekMsZ0JBQWMsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFBO0FBQzdDLFNBQU8sY0FBYyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQTtDQUNwQyIsImZpbGUiOiJnZXRFeHBvcnRzLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnXG5cbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nXG5cbmltcG9ydCBwYXJzZSBmcm9tICcuL3BhcnNlJ1xuaW1wb3J0IHJlc29sdmUgZnJvbSAnLi9yZXNvbHZlJ1xuaW1wb3J0IGlzSWdub3JlZCBmcm9tICcuL2lnbm9yZSdcblxuLy8gbWFwIGZyb20gc2V0dGluZ3Mgc2hhMSA9PiBwYXRoID0+IGV4cG9ydCBtYXAgb2JqZWN0c1xuY29uc3QgZXhwb3J0Q2FjaGVzID0gbmV3IE1hcCgpXG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEV4cG9ydE1hcCB7XG4gIGNvbnN0cnVjdG9yKGNvbnRleHQpIHtcbiAgICB0aGlzLmNvbnRleHQgPSBjb250ZXh0XG4gICAgdGhpcy5uYW1lZCA9IG5ldyBTZXQoKVxuXG4gICAgdGhpcy5lcnJvcnMgPSBbXVxuICB9XG5cbiAgZ2V0IHNldHRpbmdzKCkgeyByZXR1cm4gdGhpcy5jb250ZXh0ICYmIHRoaXMuY29udGV4dC5zZXR0aW5ncyB9XG5cbiAgZ2V0IGhhc0RlZmF1bHQoKSB7IHJldHVybiB0aGlzLm5hbWVkLmhhcygnZGVmYXVsdCcpIH1cbiAgZ2V0IGhhc05hbWVkKCkgeyByZXR1cm4gdGhpcy5uYW1lZC5zaXplID4gKHRoaXMuaGFzRGVmYXVsdCA/IDEgOiAwKSB9XG5cbiAgc3RhdGljIGdldChzb3VyY2UsIGNvbnRleHQpIHtcblxuICAgIHZhciBwYXRoID0gcmVzb2x2ZShzb3VyY2UsIGNvbnRleHQpXG4gICAgaWYgKHBhdGggPT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgIHJldHVybiBFeHBvcnRNYXAuZm9yKHBhdGgsIGNvbnRleHQpXG4gIH1cblxuICBzdGF0aWMgZm9yKHBhdGgsIGNvbnRleHQpIHtcbiAgICBsZXQgZXhwb3J0TWFwXG5cbiAgICBjb25zdCBjYWNoZUtleSA9IGhhc2hPYmplY3QoY29udGV4dC5zZXR0aW5ncylcbiAgICBsZXQgZXhwb3J0Q2FjaGUgPSBleHBvcnRDYWNoZXMuZ2V0KGNhY2hlS2V5KVxuICAgIGlmIChleHBvcnRDYWNoZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBleHBvcnRDYWNoZSA9IG5ldyBNYXAoKVxuICAgICAgZXhwb3J0Q2FjaGVzLnNldChjYWNoZUtleSwgZXhwb3J0Q2FjaGUpXG4gICAgfVxuXG4gICAgZXhwb3J0TWFwID0gZXhwb3J0Q2FjaGUuZ2V0KHBhdGgpXG4gICAgLy8gcmV0dXJuIGNhY2hlZCBpZ25vcmVcbiAgICBpZiAoZXhwb3J0TWFwID09PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gICAgY29uc3Qgc3RhdHMgPSBmcy5zdGF0U3luYyhwYXRoKVxuICAgIGlmIChleHBvcnRNYXAgIT0gbnVsbCkge1xuICAgICAgLy8gZGF0ZSBlcXVhbGl0eSBjaGVja1xuICAgICAgaWYgKGV4cG9ydE1hcC5tdGltZSAtIHN0YXRzLm10aW1lID09PSAwKSB7XG4gICAgICAgIHJldHVybiBleHBvcnRNYXBcbiAgICAgIH1cbiAgICAgIC8vIGZ1dHVyZTogY2hlY2sgY29udGVudCBlcXVhbGl0eT9cbiAgICB9XG5cbiAgICBleHBvcnRNYXAgPSBFeHBvcnRNYXAucGFyc2UocGF0aCwgY29udGV4dClcbiAgICBleHBvcnRNYXAubXRpbWUgPSBzdGF0cy5tdGltZVxuXG4gICAgLy8gaWdub3JlIGVtcHRpZXMsIG9wdGlvbmFsbHlcbiAgICBpZiAoZXhwb3J0TWFwLm5hbWVkLnNpemUgPT09IDAgJiYgaXNJZ25vcmVkKHBhdGgsIGNvbnRleHQpKSB7XG4gICAgICBleHBvcnRNYXAgPSBudWxsXG4gICAgfVxuXG4gICAgZXhwb3J0Q2FjaGUuc2V0KHBhdGgsIGV4cG9ydE1hcClcblxuICAgIHJldHVybiBleHBvcnRNYXBcbiAgfVxuXG4gIHN0YXRpYyBwYXJzZShwYXRoLCBjb250ZXh0KSB7XG4gICAgdmFyIG0gPSBuZXcgRXhwb3J0TWFwKGNvbnRleHQpXG5cbiAgICB0cnkge1xuICAgICAgdmFyIGFzdCA9IHBhcnNlKHBhdGgsIGNvbnRleHQpXG4gICAgfSBjYXRjaCAoZXJyKSB7XG4gICAgICBtLmVycm9ycy5wdXNoKGVycilcbiAgICAgIHJldHVybiBtIC8vIGNhbid0IGNvbnRpbnVlXG4gICAgfVxuXG4gICAgYXN0LmJvZHkuZm9yRWFjaChmdW5jdGlvbiAobikge1xuICAgICAgbS5jYXB0dXJlRGVmYXVsdChuKVxuICAgICAgbS5jYXB0dXJlQWxsKG4sIHBhdGgpXG4gICAgICBtLmNhcHR1cmVOYW1lZERlY2xhcmF0aW9uKG4sIHBhdGgpXG4gICAgfSlcblxuICAgIHJldHVybiBtXG4gIH1cblxuICByZXNvbHZlUmVFeHBvcnQobm9kZSwgYmFzZSkge1xuICAgIHZhciByZW1vdGVQYXRoID0gcmVzb2x2ZS5yZWxhdGl2ZShub2RlLnNvdXJjZS52YWx1ZSwgYmFzZSwgdGhpcy5zZXR0aW5ncylcbiAgICBpZiAocmVtb3RlUGF0aCA9PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gICAgcmV0dXJuIEV4cG9ydE1hcC5mb3IocmVtb3RlUGF0aCwgdGhpcy5jb250ZXh0KVxuICB9XG5cbiAgY2FwdHVyZURlZmF1bHQobikge1xuICAgIGlmIChuLnR5cGUgIT09ICdFeHBvcnREZWZhdWx0RGVjbGFyYXRpb24nKSByZXR1cm5cbiAgICB0aGlzLm5hbWVkLmFkZCgnZGVmYXVsdCcpXG4gIH1cblxuICAvKipcbiAgICogY2FwdHVyZSBhbGwgbmFtZWQgZXhwb3J0cyBmcm9tIHJlbW90ZSBtb2R1bGUuXG4gICAqXG4gICAqIHJldHVybnMgbnVsbCBpZiB0aGlzIG5vZGUgd2Fzbid0IGFuIEV4cG9ydEFsbERlY2xhcmF0aW9uXG4gICAqIHJldHVybnMgZmFsc2UgaWYgaXQgd2FzIG5vdCByZXNvbHZlZFxuICAgKiByZXR1cm5zIHRydWUgaWYgaXQgd2FzIHJlc29sdmVkICsgcGFyc2VkXG4gICAqXG4gICAqIEBwYXJhbSAge25vZGV9IG5cbiAgICogQHBhcmFtICB7c3RyaW5nfSBwYXRoIC0gdGhlIHBhdGggb2YgdGhlIG1vZHVsZSBjdXJyZW50bHkgcGFyc2luZ1xuICAgKiBAcmV0dXJuIHtib29sZWFuP31cbiAgICovXG4gIGNhcHR1cmVBbGwobiwgcGF0aCkge1xuICAgIGlmIChuLnR5cGUgIT09ICdFeHBvcnRBbGxEZWNsYXJhdGlvbicpIHJldHVybiBudWxsXG5cbiAgICB2YXIgcmVtb3RlTWFwID0gdGhpcy5yZXNvbHZlUmVFeHBvcnQobiwgcGF0aClcbiAgICBpZiAocmVtb3RlTWFwID09IG51bGwpIHJldHVybiBmYWxzZVxuXG4gICAgcmVtb3RlTWFwLm5hbWVkLmZvckVhY2goZnVuY3Rpb24gKG5hbWUpIHsgdGhpcy5uYW1lZC5hZGQobmFtZSkgfS5iaW5kKHRoaXMpKVxuXG4gICAgcmV0dXJuIHRydWVcbiAgfVxuXG4gIGNhcHR1cmVOYW1lZERlY2xhcmF0aW9uKG4sIHBhdGgpIHtcbiAgICBpZiAobi50eXBlICE9PSAnRXhwb3J0TmFtZWREZWNsYXJhdGlvbicpIHJldHVyblxuXG4gICAgLy8gY2FwdHVyZSBkZWNsYXJhdGlvblxuICAgIGlmIChuLmRlY2xhcmF0aW9uICE9IG51bGwpIHtcbiAgICAgIHN3aXRjaCAobi5kZWNsYXJhdGlvbi50eXBlKSB7XG4gICAgICAgIGNhc2UgJ0Z1bmN0aW9uRGVjbGFyYXRpb24nOlxuICAgICAgICBjYXNlICdDbGFzc0RlY2xhcmF0aW9uJzpcbiAgICAgICAgY2FzZSAnVHlwZUFsaWFzJzogLy8gZmxvd3R5cGUgd2l0aCBiYWJlbC1lc2xpbnQgcGFyc2VyXG4gICAgICAgICAgdGhpcy5uYW1lZC5hZGQobi5kZWNsYXJhdGlvbi5pZC5uYW1lKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgJ1ZhcmlhYmxlRGVjbGFyYXRpb24nOlxuICAgICAgICAgIG4uZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zLmZvckVhY2goKGQpID0+XG4gICAgICAgICAgICByZWN1cnNpdmVQYXR0ZXJuQ2FwdHVyZShkLmlkLCBpZCA9PiB0aGlzLm5hbWVkLmFkZChpZC5uYW1lKSkpXG4gICAgICAgICAgYnJlYWtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBjYXB0dXJlIHNwZWNpZmllcnNcbiAgICBsZXQgcmVtb3RlTWFwXG4gICAgaWYgKG4uc291cmNlKSByZW1vdGVNYXAgPSB0aGlzLnJlc29sdmVSZUV4cG9ydChuLCBwYXRoKVxuXG4gICAgbi5zcGVjaWZpZXJzLmZvckVhY2goZnVuY3Rpb24gKHMpIHtcbiAgICAgIGlmIChzLnR5cGUgPT09ICdFeHBvcnREZWZhdWx0U3BlY2lmaWVyJykge1xuICAgICAgICAvLyBkb24ndCBhZGQgaXQgaWYgaXQgaXMgbm90IHByZXNlbnQgaW4gdGhlIGV4cG9ydGVkIG1vZHVsZVxuICAgICAgICBpZiAoIXJlbW90ZU1hcCB8fCAhcmVtb3RlTWFwLmhhc0RlZmF1bHQpIHJldHVyblxuICAgICAgfVxuXG4gICAgICB0aGlzLm5hbWVkLmFkZChzLmV4cG9ydGVkLm5hbWUpXG4gICAgfS5iaW5kKHRoaXMpKVxuICB9XG59XG5cblxuLyoqXG4gKiBUcmF2ZXJzZSBhIHBhdHRlci9pZGVudGlmaWVyIG5vZGUsIGNhbGxpbmcgJ2NhbGxiYWNrJ1xuICogZm9yIGVhY2ggbGVhZiBpZGVudGlmaWVyLlxuICogQHBhcmFtICB7bm9kZX0gICBwYXR0ZXJuXG4gKiBAcGFyYW0gIHtGdW5jdGlvbn0gY2FsbGJhY2tcbiAqIEByZXR1cm4ge3ZvaWR9XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWN1cnNpdmVQYXR0ZXJuQ2FwdHVyZShwYXR0ZXJuLCBjYWxsYmFjaykge1xuICBzd2l0Y2ggKHBhdHRlcm4udHlwZSkge1xuICAgIGNhc2UgJ0lkZW50aWZpZXInOiAvLyBiYXNlIGNhc2VcbiAgICAgIGNhbGxiYWNrKHBhdHRlcm4pXG4gICAgICBicmVha1xuXG4gICAgY2FzZSAnT2JqZWN0UGF0dGVybic6XG4gICAgICBwYXR0ZXJuLnByb3BlcnRpZXMuZm9yRWFjaCgoeyB2YWx1ZSB9KSA9PiB7XG4gICAgICAgIHJlY3Vyc2l2ZVBhdHRlcm5DYXB0dXJlKHZhbHVlLCBjYWxsYmFjaylcbiAgICAgIH0pXG4gICAgICBicmVha1xuXG4gICAgY2FzZSAnQXJyYXlQYXR0ZXJuJzpcbiAgICAgIHBhdHRlcm4uZWxlbWVudHMuZm9yRWFjaCgoZWxlbWVudCkgPT4ge1xuICAgICAgICBpZiAoZWxlbWVudCA9PSBudWxsKSByZXR1cm5cbiAgICAgICAgcmVjdXJzaXZlUGF0dGVybkNhcHR1cmUoZWxlbWVudCwgY2FsbGJhY2spXG4gICAgICB9KVxuICAgICAgYnJlYWtcbiAgfVxufVxuXG5mdW5jdGlvbiBoYXNoT2JqZWN0KG9iamVjdCkge1xuICBjb25zdCBzZXR0aW5nc1NoYXN1bSA9IGNyZWF0ZUhhc2goJ3NoYTEnKVxuICBzZXR0aW5nc1NoYXN1bS51cGRhdGUoSlNPTi5zdHJpbmdpZnkob2JqZWN0KSlcbiAgcmV0dXJuIHNldHRpbmdzU2hhc3VtLmRpZ2VzdCgnaGV4Jylcbn1cbiJdfQ==
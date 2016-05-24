'use strict';

var _Map = require('babel-runtime/core-js/map')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

var _coreGetExports = require('../core/getExports');

var _coreGetExports2 = _interopRequireDefault(_coreGetExports);

var _importDeclaration = require('../importDeclaration');

var _importDeclaration2 = _interopRequireDefault(_importDeclaration);

module.exports = function (context) {

  var namespaces = new _Map();

  function getImportsAndReport(namespace) {
    var declaration = (0, _importDeclaration2['default'])(context);

    var imports = _coreGetExports2['default'].get(declaration.source.value, context);
    if (imports == null) return null;

    if (imports.errors.length) {
      context.report({
        node: declaration.source,
        message: 'Parse errors in imported module ' + ('\'' + declaration.source.value + '\'.')
      });
      return;
    }

    if (!imports.hasNamed) {
      context.report(namespace, 'No exported names found in module \'' + declaration.source.value + '\'.');
    }

    return imports;
  }

  function message(identifier, namespace) {
    return '\'' + identifier.name + '\' not found in imported namespace ' + namespace.name + '.';
  }

  function declaredScope(name) {
    var references = context.getScope().references,
        i = undefined;
    for (i = 0; i < references.length; i++) {
      if (references[i].identifier.name === name) {
        break;
      }
    }
    if (!references[i]) return undefined;
    return references[i].resolved.scope.type;
  }

  return {
    'ImportNamespaceSpecifier': function ImportNamespaceSpecifier(namespace) {
      var imports = getImportsAndReport(namespace);
      if (imports == null) return;
      namespaces.set(namespace.local.name, imports.named);
    },

    // same as above, but does not add names to local map
    'ExportNamespaceSpecifier': function ExportNamespaceSpecifier(namespace) {
      getImportsAndReport(namespace);
    },

    // todo: check for possible redefinition

    'MemberExpression': function MemberExpression(dereference) {
      if (dereference.object.type !== 'Identifier') return;
      if (!namespaces.has(dereference.object.name)) return;

      if (dereference.parent.type === 'AssignmentExpression' && dereference.parent.left === dereference) {
        context.report(dereference.parent, 'Assignment to member of namespace \'' + dereference.object.name + '\'.');
      }

      if (dereference.computed) {
        context.report(dereference.property, 'Unable to validate computed reference to imported namespace \'' + dereference.object.name + '\'.');
        return;
      }

      var namespace = namespaces.get(dereference.object.name);
      if (!namespace.has(dereference.property.name)) {
        context.report(dereference.property, message(dereference.property, dereference.object));
      }
    },

    'VariableDeclarator': function VariableDeclarator(_ref) {
      var id = _ref.id;
      var init = _ref.init;

      if (init == null) return;
      if (id.type !== 'ObjectPattern') return;
      if (init.type !== 'Identifier') return;
      if (!namespaces.has(init.name)) return;

      // check for redefinition in intermediate scopes
      if (declaredScope(init.name) !== 'module') return;

      var namespace = namespaces.get(init.name);

      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = _getIterator(id.properties), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          var property = _step.value;

          if (property.key.type !== 'Identifier') {
            context.report({
              node: property,
              message: 'Only destructure top-level names.'
            });
          } else if (!namespace.has(property.key.name)) {
            context.report({
              node: property,
              message: message(property.key, init)
            });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uYW1lc3BhY2UuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7OEJBQW9CLG9CQUFvQjs7OztpQ0FDVixzQkFBc0I7Ozs7QUFFcEQsTUFBTSxDQUFDLE9BQU8sR0FBRyxVQUFVLE9BQU8sRUFBRTs7QUFFbEMsTUFBTSxVQUFVLEdBQUcsVUFBUyxDQUFBOztBQUU1QixXQUFTLG1CQUFtQixDQUFDLFNBQVMsRUFBRTtBQUN0QyxRQUFJLFdBQVcsR0FBRyxvQ0FBa0IsT0FBTyxDQUFDLENBQUE7O0FBRTVDLFFBQUksT0FBTyxHQUFHLDRCQUFRLEdBQUcsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQTtBQUM1RCxRQUFJLE9BQU8sSUFBSSxJQUFJLEVBQUUsT0FBTyxJQUFJLENBQUE7O0FBRWhDLFFBQUksT0FBTyxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUU7QUFDekIsYUFBTyxDQUFDLE1BQU0sQ0FBQztBQUNiLFlBQUksRUFBRSxXQUFXLENBQUMsTUFBTTtBQUN4QixlQUFPLEVBQUUsNkNBQ0ksV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLFNBQUk7T0FDMUMsQ0FBQyxDQUFBO0FBQ0YsYUFBTTtLQUNQOztBQUVELFFBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFO0FBQ3JCLGFBQU8sQ0FBQyxNQUFNLENBQUMsU0FBUywyQ0FDZ0IsV0FBVyxDQUFDLE1BQU0sQ0FBQyxLQUFLLFNBQUssQ0FBQTtLQUN0RTs7QUFFRCxXQUFPLE9BQU8sQ0FBQTtHQUNmOztBQUVELFdBQVMsT0FBTyxDQUFDLFVBQVUsRUFBRSxTQUFTLEVBQUU7QUFDdEMsV0FBTyxJQUFJLEdBQUcsVUFBVSxDQUFDLElBQUksR0FDdEIscUNBQXFDLEdBQ3JDLFNBQVMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFBO0dBQzVCOztBQUVELFdBQVMsYUFBYSxDQUFDLElBQUksRUFBRTtBQUMzQixRQUFJLFVBQVUs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QUksQ0FBQyxJQUFJLENBQUMsQ0FBQTs7Ozs7OztBQUUzQywwQ0FBcUIsRUFBRSxDQUFDLFVBQVUsNEdBQUU7Y0FBM0IsUUFBUTs7QUFDZixjQUFJLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxLQUFLLFlBQVksRUFBRTtBQUN0QyxtQkFBTyxDQUFDLE1BQU0sQ0FBQztBQUNiLGtCQUFJLEVBQUUsUUFBUTtBQUNkLHFCQUFPLEVBQUUsbUNBQW1DO2FBQzdDLENBQUMsQ0FBQTtXQUNILE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtBQUM1QyxtQkFBTyxDQUFDLE1BQU0sQ0FBQztBQUNiLGtCQUFJLEVBQUUsUUFBUTtBQUNkLHFCQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDO2FBQ3JDLENBQUMsQ0FBQTtXQUNIO1NBQ0Y7Ozs7Ozs7Ozs7Ozs7OztLQUNGO0dBQ0YsQ0FBQTtDQUNGLENBQUEiLCJmaWxlIjoibmFtZXNwYWNlLmpzIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IEV4cG9ydHMgZnJvbSAnLi4vY29yZS9nZXRFeHBvcnRzJ1xuaW1wb3J0IGltcG9ydERlY2xhcmF0aW9uIGZyb20gJy4uL2ltcG9ydERlY2xhcmF0aW9uJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb250ZXh0KSB7XG5cbiAgY29uc3QgbmFtZXNwYWNlcyA9IG5ldyBNYXAoKVxuXG4gIGZ1bmN0aW9uIGdldEltcG9ydHNBbmRSZXBvcnQobmFtZXNwYWNlKSB7XG4gICAgdmFyIGRlY2xhcmF0aW9uID0gaW1wb3J0RGVjbGFyYXRpb24oY29udGV4dClcblxuICAgIHZhciBpbXBvcnRzID0gRXhwb3J0cy5nZXQoZGVjbGFyYXRpb24uc291cmNlLnZhbHVlLCBjb250ZXh0KVxuICAgIGlmIChpbXBvcnRzID09IG51bGwpIHJldHVybiBudWxsXG5cbiAgICBpZiAoaW1wb3J0cy5lcnJvcnMubGVuZ3RoKSB7XG4gICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgIG5vZGU6IGRlY2xhcmF0aW9uLnNvdXJjZSxcbiAgICAgICAgbWVzc2FnZTogYFBhcnNlIGVycm9ycyBpbiBpbXBvcnRlZCBtb2R1bGUgYCArXG4gICAgICAgICAgICAgICAgIGAnJHtkZWNsYXJhdGlvbi5zb3VyY2UudmFsdWV9Jy5gLFxuICAgICAgfSlcbiAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGlmICghaW1wb3J0cy5oYXNOYW1lZCkge1xuICAgICAgY29udGV4dC5yZXBvcnQobmFtZXNwYWNlLFxuICAgICAgICBgTm8gZXhwb3J0ZWQgbmFtZXMgZm91bmQgaW4gbW9kdWxlICcke2RlY2xhcmF0aW9uLnNvdXJjZS52YWx1ZX0nLmApXG4gICAgfVxuXG4gICAgcmV0dXJuIGltcG9ydHNcbiAgfVxuXG4gIGZ1bmN0aW9uIG1lc3NhZ2UoaWRlbnRpZmllciwgbmFtZXNwYWNlKSB7XG4gICAgcmV0dXJuICdcXCcnICsgaWRlbnRpZmllci5uYW1lICtcbiAgICAgICAgICAgJ1xcJyBub3QgZm91bmQgaW4gaW1wb3J0ZWQgbmFtZXNwYWNlICcgK1xuICAgICAgICAgICBuYW1lc3BhY2UubmFtZSArICcuJ1xuICB9XG5cbiAgZnVuY3Rpb24gZGVjbGFyZWRTY29wZShuYW1lKSB7XG4gICAgbGV0IHJlZmVyZW5jZXMgPSBjb250ZXh0LmdldFNjb3BlKCkucmVmZXJlbmNlc1xuICAgICAgLCBpXG4gICAgZm9yIChpID0gMDsgaSA8IHJlZmVyZW5jZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChyZWZlcmVuY2VzW2ldLmlkZW50aWZpZXIubmFtZSA9PT0gbmFtZSkge1xuICAgICAgICBicmVha1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoIXJlZmVyZW5jZXNbaV0pIHJldHVybiB1bmRlZmluZWRcbiAgICByZXR1cm4gcmVmZXJlbmNlc1tpXS5yZXNvbHZlZC5zY29wZS50eXBlXG4gIH1cblxuICByZXR1cm4ge1xuICAgICdJbXBvcnROYW1lc3BhY2VTcGVjaWZpZXInOiBmdW5jdGlvbiAobmFtZXNwYWNlKSB7XG4gICAgICBjb25zdCBpbXBvcnRzID0gZ2V0SW1wb3J0c0FuZFJlcG9ydChuYW1lc3BhY2UpXG4gICAgICBpZiAoaW1wb3J0cyA9PSBudWxsKSByZXR1cm5cbiAgICAgIG5hbWVzcGFjZXMuc2V0KG5hbWVzcGFjZS5sb2NhbC5uYW1lLCBpbXBvcnRzLm5hbWVkKVxuICAgIH0sXG5cbiAgICAvLyBzYW1lIGFzIGFib3ZlLCBidXQgZG9lcyBub3QgYWRkIG5hbWVzIHRvIGxvY2FsIG1hcFxuICAgICdFeHBvcnROYW1lc3BhY2VTcGVjaWZpZXInOiBmdW5jdGlvbiAobmFtZXNwYWNlKSB7XG4gICAgICBnZXRJbXBvcnRzQW5kUmVwb3J0KG5hbWVzcGFjZSlcbiAgICB9LFxuXG4gICAgLy8gdG9kbzogY2hlY2sgZm9yIHBvc3NpYmxlIHJlZGVmaW5pdGlvblxuXG4gICAgJ01lbWJlckV4cHJlc3Npb24nOiBmdW5jdGlvbiAoZGVyZWZlcmVuY2UpIHtcbiAgICAgIGlmIChkZXJlZmVyZW5jZS5vYmplY3QudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm5cbiAgICAgIGlmICghbmFtZXNwYWNlcy5oYXMoZGVyZWZlcmVuY2Uub2JqZWN0Lm5hbWUpKSByZXR1cm5cblxuICAgICAgaWYgKGRlcmVmZXJlbmNlLnBhcmVudC50eXBlID09PSAnQXNzaWdubWVudEV4cHJlc3Npb24nICYmXG4gICAgICAgICAgZGVyZWZlcmVuY2UucGFyZW50LmxlZnQgPT09IGRlcmVmZXJlbmNlKSB7XG4gICAgICAgICAgY29udGV4dC5yZXBvcnQoZGVyZWZlcmVuY2UucGFyZW50LFxuICAgICAgICAgICAgICBgQXNzaWdubWVudCB0byBtZW1iZXIgb2YgbmFtZXNwYWNlICcke2RlcmVmZXJlbmNlLm9iamVjdC5uYW1lfScuYClcbiAgICAgIH1cblxuICAgICAgaWYgKGRlcmVmZXJlbmNlLmNvbXB1dGVkKSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KGRlcmVmZXJlbmNlLnByb3BlcnR5LFxuICAgICAgICAgICdVbmFibGUgdG8gdmFsaWRhdGUgY29tcHV0ZWQgcmVmZXJlbmNlIHRvIGltcG9ydGVkIG5hbWVzcGFjZSBcXCcnICtcbiAgICAgICAgICBkZXJlZmVyZW5jZS5vYmplY3QubmFtZSArICdcXCcuJylcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIHZhciBuYW1lc3BhY2UgPSBuYW1lc3BhY2VzLmdldChkZXJlZmVyZW5jZS5vYmplY3QubmFtZSlcbiAgICAgIGlmICghbmFtZXNwYWNlLmhhcyhkZXJlZmVyZW5jZS5wcm9wZXJ0eS5uYW1lKSkge1xuICAgICAgICBjb250ZXh0LnJlcG9ydCggZGVyZWZlcmVuY2UucHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgICAsIG1lc3NhZ2UoZGVyZWZlcmVuY2UucHJvcGVydHksIGRlcmVmZXJlbmNlLm9iamVjdClcbiAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICB9XG4gICAgfSxcblxuICAgICdWYXJpYWJsZURlY2xhcmF0b3InOiBmdW5jdGlvbiAoeyBpZCwgaW5pdCB9KSB7XG4gICAgICBpZiAoaW5pdCA9PSBudWxsKSByZXR1cm5cbiAgICAgIGlmIChpZC50eXBlICE9PSAnT2JqZWN0UGF0dGVybicpIHJldHVyblxuICAgICAgaWYgKGluaXQudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm5cbiAgICAgIGlmICghbmFtZXNwYWNlcy5oYXMoaW5pdC5uYW1lKSkgcmV0dXJuXG5cbiAgICAgIC8vIGNoZWNrIGZvciByZWRlZmluaXRpb24gaW4gaW50ZXJtZWRpYXRlIHNjb3Blc1xuICAgICAgaWYgKGRlY2xhcmVkU2NvcGUoaW5pdC5uYW1lKSAhPT0gJ21vZHVsZScpIHJldHVyblxuXG4gICAgICBjb25zdCBuYW1lc3BhY2UgPSBuYW1lc3BhY2VzLmdldChpbml0Lm5hbWUpXG5cbiAgICAgIGZvciAobGV0IHByb3BlcnR5IG9mIGlkLnByb3BlcnRpZXMpIHtcbiAgICAgICAgaWYgKHByb3BlcnR5LmtleS50eXBlICE9PSAnSWRlbnRpZmllcicpIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgICAgICBub2RlOiBwcm9wZXJ0eSxcbiAgICAgICAgICAgIG1lc3NhZ2U6ICdPbmx5IGRlc3RydWN0dXJlIHRvcC1sZXZlbCBuYW1lcy4nLFxuICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSBpZiAoIW5hbWVzcGFjZS5oYXMocHJvcGVydHkua2V5Lm5hbWUpKSB7XG4gICAgICAgICAgY29udGV4dC5yZXBvcnQoe1xuICAgICAgICAgICAgbm9kZTogcHJvcGVydHksXG4gICAgICAgICAgICBtZXNzYWdlOiBtZXNzYWdlKHByb3BlcnR5LmtleSwgaW5pdCksXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0sXG4gIH1cbn1cbiJdfQ==
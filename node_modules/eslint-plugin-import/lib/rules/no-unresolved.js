/**
 * @fileOverview Ensures that an imported path exists, given resolution rules.
 * @author Ben Mosher
 */
'use strict';

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

var _coreResolve = require('../core/resolve');

var _coreResolve2 = _interopRequireDefault(_coreResolve);

module.exports = function (context) {

  function checkSourceValue(source) {
    if (source == null) return;

    if ((0, _coreResolve2['default'])(source.value, context) === undefined) {
      context.report(source, 'Unable to resolve path to module \'' + source.value + '\'.');
    }
  }

  // for import-y declarations
  function checkSource(node) {
    checkSourceValue(node.source);
  }

  // for CommonJS `require` calls
  // adapted from @mctep: http://git.io/v4rAu
  function checkCommon(call) {
    if (call.callee.type !== 'Identifier') return;
    if (call.callee.name !== 'require') return;
    if (call.arguments.length !== 1) return;

    var modulePath = call.arguments[0];
    if (modulePath.type !== 'Literal') return;
    if (typeof modulePath.value !== 'string') return;

    checkSourceValue(modulePath);
  }

  function checkAMD(call) {
    if (call.callee.type !== 'Identifier') return;
    if (call.callee.name !== 'require' && call.callee.name !== 'define') return;
    if (call.arguments.length !== 2) return;

    var modules = call.arguments[0];
    if (modules.type !== 'ArrayExpression') return;

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = _getIterator(modules.elements), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        var element = _step.value;

        if (element.type !== 'Literal') continue;
        if (typeof element.value !== 'string') continue;

        if (element.value === 'require' || element.value === 'exports') continue; // magic modules: http://git.io/vByan

        checkSourceValue(element);
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

  var visitors = {
    'ImportDeclaration': checkSource,
    'ExportNamedDeclaration': checkSource,
    'ExportAllDeclaration': checkSource
  };

  if (context.options[0] != null) {
    (function () {
      var _context$options$0 = context.options[0];
      var commonjs = _context$options$0.commonjs;
      var amd = _context$options$0.amd;

      if (commonjs || amd) {
        visitors['CallExpression'] = function (call) {
          if (commonjs) checkCommon(call);
          if (amd) checkAMD(call);
        };
      }
    })();
  }

  return visitors;
};

module.exports.schema = [{
  'type': 'object',
  'properties': {
    'commonjs': { 'type': 'boolean' },
    'amd': { 'type': 'boolean' }
  },
  'additionalProperties': false
}];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby11bnJlc29sdmVkLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7MkJBSW9CLGlCQUFpQjs7OztBQUVyQyxNQUFNLENBQUMsT0FBTyxHQUFHLFVBQVUsT0FBTyxFQUFFOztBQUVsQyxXQUFTLGdCQUFnQixDQUFDLE1BQU0sRUFBRTtBQUNoQyxRQUFJLE1BQU0sSUFBSSxJQUFJLEVBQUUsT0FBTTs7QUFFMUIsUUFBSSw4QkFBUSxNQUFNLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLLFNBQVMsRUFBRTtBQUNoRCxhQUFPLENBQUMsTUFBTSxDQUFDLE1BQU0sRUFDbkIscUNBQXFDLEdBQUcsTUFBTSxDQUFDLEtBQUssR0FBRyxLQUFLLENBQUMsQ0FBQTtLQUNoRTtHQUNGOzs7QUFHRCxXQUFTLFdBQVcsQ0FBQyxJQUFJLEVBQUU7QUFDekIsb0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0dBQzlCOzs7O0FBSUQsV0FBUyxXQUFXLENBQUMsSUFBSSxFQUFFO0FBQ3pCLFFBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLE9BQU07QUFDN0MsUUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsT0FBTTtBQUMxQyxRQUFJLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRSxPQUFNOztBQUV2QyxRQUFNLFVBQVUsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFBO0FBQ3BDLFFBQUksVUFBVSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsT0FBTTtBQUN6QyxRQUFJLE9BQU8sVUFBVSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsT0FBTTs7QUFFaEQsb0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUE7R0FDN0I7O0FBRUQsV0FBUyxRQUFRLENBQUMsSUFBSSxFQUFFO0FBQ3RCLFFBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLE9BQU07QUFDN0MsUUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLElBQzlCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRSxPQUFNO0FBQ3pDLFFBQUksSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFLE9BQU07O0FBRXZDLFFBQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLENBQUE7QUFDakMsUUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLGlCQUFpQixFQUFFLE9BQU07Ozs7Ozs7QUFFOUMsd0NBQW9CLE9BQU8sQ0FBQyxRQUFRLDRHQUFFO1lBQTdCLE9BQU87O0FBQ2QsWUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLFNBQVMsRUFBRSxTQUFRO0FBQ3hDLFlBQUksT0FBTyxPQUFPLENBQUMsS0FBSyxLQUFLLFFBQVEsRUFBRSxTQUFROztBQUUvQyxZQUFJLE9BQU8sQ0FBQyxLQUFLLEtBQUssU0FBUyxJQUMzQixPQUFPLENBQUMsS0FBSyxLQUFLLFNBQVMsRUFBRSxTQUFROztBQUV6Qyx3QkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQTtPQUMxQjs7Ozs7Ozs7Ozs7Ozs7O0dBQ0Y7O0FBRUQsTUFBTSxRQUFRLEdBQUc7QUFDZix1QkFBbUIsRUFBRSxXQUFXO0FBQ2hDLDRCQUF3QixFQUFFLFdBQVc7QUFDckMsMEJBQXNCLEVBQUUsV0FBVztHQUNwQyxDQUFBOztBQUVELE1BQUksT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxJQUFJLEVBQUU7OytCQUNKLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1VBQXBDLFFBQVEsc0JBQVIsUUFBUTtVQUFFLEdBQUcsc0JBQUgsR0FBRzs7QUFFckIsVUFBSSxRQUFRLElBQUksR0FBRyxFQUFFO0FBQ25CLGdCQUFRLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxVQUFVLElBQUksRUFBRTtBQUMzQyxjQUFJLFFBQVEsRUFBRSxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUE7QUFDL0IsY0FBSSxHQUFHLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFBO1NBQ3hCLENBQUE7T0FDRjs7R0FDRjs7QUFFRCxTQUFPLFFBQVEsQ0FBQTtDQUNoQixDQUFBOztBQUVELE1BQU0sQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQ3RCO0FBQ0UsUUFBTSxFQUFFLFFBQVE7QUFDaEIsY0FBWSxFQUFFO0FBQ1osY0FBVSxFQUFFLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRTtBQUNqQyxTQUFLLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFO0dBQzdCO0FBQ0Qsd0JBQXNCLEVBQUUsS0FBSztDQUM5QixDQUNGLENBQUEiLCJmaWxlIjoibm8tdW5yZXNvbHZlZC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGZpbGVPdmVydmlldyBFbnN1cmVzIHRoYXQgYW4gaW1wb3J0ZWQgcGF0aCBleGlzdHMsIGdpdmVuIHJlc29sdXRpb24gcnVsZXMuXG4gKiBAYXV0aG9yIEJlbiBNb3NoZXJcbiAqL1xuaW1wb3J0IHJlc29sdmUgZnJvbSAnLi4vY29yZS9yZXNvbHZlJ1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChjb250ZXh0KSB7XG5cbiAgZnVuY3Rpb24gY2hlY2tTb3VyY2VWYWx1ZShzb3VyY2UpIHtcbiAgICBpZiAoc291cmNlID09IG51bGwpIHJldHVyblxuXG4gICAgaWYgKHJlc29sdmUoc291cmNlLnZhbHVlLCBjb250ZXh0KSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBjb250ZXh0LnJlcG9ydChzb3VyY2UsXG4gICAgICAgICdVbmFibGUgdG8gcmVzb2x2ZSBwYXRoIHRvIG1vZHVsZSBcXCcnICsgc291cmNlLnZhbHVlICsgJ1xcJy4nKVxuICAgIH1cbiAgfVxuXG4gIC8vIGZvciBpbXBvcnQteSBkZWNsYXJhdGlvbnNcbiAgZnVuY3Rpb24gY2hlY2tTb3VyY2Uobm9kZSkge1xuICAgIGNoZWNrU291cmNlVmFsdWUobm9kZS5zb3VyY2UpXG4gIH1cblxuICAvLyBmb3IgQ29tbW9uSlMgYHJlcXVpcmVgIGNhbGxzXG4gIC8vIGFkYXB0ZWQgZnJvbSBAbWN0ZXA6IGh0dHA6Ly9naXQuaW8vdjRyQXVcbiAgZnVuY3Rpb24gY2hlY2tDb21tb24oY2FsbCkge1xuICAgIGlmIChjYWxsLmNhbGxlZS50eXBlICE9PSAnSWRlbnRpZmllcicpIHJldHVyblxuICAgIGlmIChjYWxsLmNhbGxlZS5uYW1lICE9PSAncmVxdWlyZScpIHJldHVyblxuICAgIGlmIChjYWxsLmFyZ3VtZW50cy5sZW5ndGggIT09IDEpIHJldHVyblxuXG4gICAgY29uc3QgbW9kdWxlUGF0aCA9IGNhbGwuYXJndW1lbnRzWzBdXG4gICAgaWYgKG1vZHVsZVBhdGgudHlwZSAhPT0gJ0xpdGVyYWwnKSByZXR1cm5cbiAgICBpZiAodHlwZW9mIG1vZHVsZVBhdGgudmFsdWUgIT09ICdzdHJpbmcnKSByZXR1cm5cblxuICAgIGNoZWNrU291cmNlVmFsdWUobW9kdWxlUGF0aClcbiAgfVxuXG4gIGZ1bmN0aW9uIGNoZWNrQU1EKGNhbGwpIHtcbiAgICBpZiAoY2FsbC5jYWxsZWUudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm5cbiAgICBpZiAoY2FsbC5jYWxsZWUubmFtZSAhPT0gJ3JlcXVpcmUnICYmXG4gICAgICAgIGNhbGwuY2FsbGVlLm5hbWUgIT09ICdkZWZpbmUnKSByZXR1cm5cbiAgICBpZiAoY2FsbC5hcmd1bWVudHMubGVuZ3RoICE9PSAyKSByZXR1cm5cblxuICAgIGNvbnN0IG1vZHVsZXMgPSBjYWxsLmFyZ3VtZW50c1swXVxuICAgIGlmIChtb2R1bGVzLnR5cGUgIT09ICdBcnJheUV4cHJlc3Npb24nKSByZXR1cm5cblxuICAgIGZvciAobGV0IGVsZW1lbnQgb2YgbW9kdWxlcy5lbGVtZW50cykge1xuICAgICAgaWYgKGVsZW1lbnQudHlwZSAhPT0gJ0xpdGVyYWwnKSBjb250aW51ZVxuICAgICAgaWYgKHR5cGVvZiBlbGVtZW50LnZhbHVlICE9PSAnc3RyaW5nJykgY29udGludWVcblxuICAgICAgaWYgKGVsZW1lbnQudmFsdWUgPT09ICdyZXF1aXJlJyB8fFxuICAgICAgICAgIGVsZW1lbnQudmFsdWUgPT09ICdleHBvcnRzJykgY29udGludWUgLy8gbWFnaWMgbW9kdWxlczogaHR0cDovL2dpdC5pby92QnlhblxuXG4gICAgICBjaGVja1NvdXJjZVZhbHVlKGVsZW1lbnQpXG4gICAgfVxuICB9XG5cbiAgY29uc3QgdmlzaXRvcnMgPSB7XG4gICAgJ0ltcG9ydERlY2xhcmF0aW9uJzogY2hlY2tTb3VyY2UsXG4gICAgJ0V4cG9ydE5hbWVkRGVjbGFyYXRpb24nOiBjaGVja1NvdXJjZSxcbiAgICAnRXhwb3J0QWxsRGVjbGFyYXRpb24nOiBjaGVja1NvdXJjZSxcbiAgfVxuXG4gIGlmIChjb250ZXh0Lm9wdGlvbnNbMF0gIT0gbnVsbCkge1xuICAgIGNvbnN0IHsgY29tbW9uanMsIGFtZCB9ID0gY29udGV4dC5vcHRpb25zWzBdXG5cbiAgICBpZiAoY29tbW9uanMgfHwgYW1kKSB7XG4gICAgICB2aXNpdG9yc1snQ2FsbEV4cHJlc3Npb24nXSA9IGZ1bmN0aW9uIChjYWxsKSB7XG4gICAgICAgIGlmIChjb21tb25qcykgY2hlY2tDb21tb24oY2FsbClcbiAgICAgICAgaWYgKGFtZCkgY2hlY2tBTUQoY2FsbClcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdmlzaXRvcnNcbn1cblxubW9kdWxlLmV4cG9ydHMuc2NoZW1hID0gW1xuICB7XG4gICAgJ3R5cGUnOiAnb2JqZWN0JyxcbiAgICAncHJvcGVydGllcyc6IHtcbiAgICAgICdjb21tb25qcyc6IHsgJ3R5cGUnOiAnYm9vbGVhbicgfSxcbiAgICAgICdhbWQnOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH0sXG4gICAgfSxcbiAgICAnYWRkaXRpb25hbFByb3BlcnRpZXMnOiBmYWxzZSxcbiAgfSxcbl1cbiJdfQ==
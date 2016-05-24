'use strict';

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

var _coreGetExports = require('../core/getExports');

var _coreGetExports2 = _interopRequireDefault(_coreGetExports);

module.exports = function (context) {

  function checkDefault(specifierType, node) {

    // poor man's Array.find
    var defaultSpecifier = undefined;
    node.specifiers.some(function (n) {
      if (n.type === specifierType) {
        defaultSpecifier = n;
        return true;
      }
    });

    if (!defaultSpecifier) return;
    var imports = _coreGetExports2['default'].get(node.source.value, context);
    if (imports == null) return;

    if (imports.errors.length) {
      context.report({
        node: node.source,
        message: 'Parse errors in imported module ' + ('\'' + node.source.value + '\'.')
      });
    } else if (!imports.hasDefault) {
      context.report(defaultSpecifier, 'No default export found in module.');
    }
  }

  return {
    'ImportDeclaration': checkDefault.bind(null, 'ImportDefaultSpecifier'),
    'ExportNamedDeclaration': checkDefault.bind(null, 'ExportDefaultSpecifier')
  };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9kZWZhdWx0LmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7OEJBQW9CLG9CQUFvQjs7OztBQUV4QyxNQUFNLENBQUMsT0FBTyxHQUFHLFVBQVUsT0FBTyxFQUFFOztBQUVsQyxXQUFTLFlBQVksQ0FBQyxhQUFhLEVBQUUsSUFBSSxFQUFFOzs7QUFHekMsUUFBSSxnQkFBZ0IsWUFBQSxDQUFBO0FBQ3BCLFFBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQUMsQ0FBQyxFQUFLO0FBQzFCLFVBQUksQ0FBQyxDQUFDLElBQUksS0FBSyxhQUFhLEVBQUU7QUFDNUIsd0JBQWdCLEdBQUcsQ0FBQyxDQUFBO0FBQ3BCLGVBQU8sSUFBSSxDQUFBO09BQ1o7S0FDRixDQUFDLENBQUE7O0FBRUYsUUFBSSxDQUFDLGdCQUFnQixFQUFFLE9BQU07QUFDN0IsUUFBSSxPQUFPLEdBQUcsNEJBQVEsR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFBO0FBQ3JELFFBQUksT0FBTyxJQUFJLElBQUksRUFBRSxPQUFNOztBQUUzQixRQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO0FBQ3pCLGFBQU8sQ0FBQyxNQUFNLENBQUM7QUFDYixZQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU07QUFDakIsZUFBTyxFQUFFLDZDQUNJLElBQUksQ0FBQyxNQUFNLENBQUMsS0FBSyxTQUFJO09BQ25DLENBQUMsQ0FBQTtLQUNILE1BQU0sSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUU7QUFDOUIsYUFBTyxDQUFDLE1BQU0sQ0FBQyxnQkFBZ0IsRUFBRSxvQ0FBb0MsQ0FBQyxDQUFBO0tBQ3ZFO0dBQ0Y7O0FBRUQsU0FBTztBQUNMLHVCQUFtQixFQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDO0FBQ3RFLDRCQUF3QixFQUFFLFlBQVksQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDO0dBQzVFLENBQUE7Q0FDRixDQUFBIiwiZmlsZSI6ImRlZmF1bHQuanMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgRXhwb3J0cyBmcm9tICcuLi9jb3JlL2dldEV4cG9ydHMnXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKGNvbnRleHQpIHtcblxuICBmdW5jdGlvbiBjaGVja0RlZmF1bHQoc3BlY2lmaWVyVHlwZSwgbm9kZSkge1xuXG4gICAgLy8gcG9vciBtYW4ncyBBcnJheS5maW5kXG4gICAgbGV0IGRlZmF1bHRTcGVjaWZpZXJcbiAgICBub2RlLnNwZWNpZmllcnMuc29tZSgobikgPT4ge1xuICAgICAgaWYgKG4udHlwZSA9PT0gc3BlY2lmaWVyVHlwZSkge1xuICAgICAgICBkZWZhdWx0U3BlY2lmaWVyID0gblxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgfVxuICAgIH0pXG5cbiAgICBpZiAoIWRlZmF1bHRTcGVjaWZpZXIpIHJldHVyblxuICAgIHZhciBpbXBvcnRzID0gRXhwb3J0cy5nZXQobm9kZS5zb3VyY2UudmFsdWUsIGNvbnRleHQpXG4gICAgaWYgKGltcG9ydHMgPT0gbnVsbCkgcmV0dXJuXG5cbiAgICBpZiAoaW1wb3J0cy5lcnJvcnMubGVuZ3RoKSB7XG4gICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgIG5vZGU6IG5vZGUuc291cmNlLFxuICAgICAgICBtZXNzYWdlOiBgUGFyc2UgZXJyb3JzIGluIGltcG9ydGVkIG1vZHVsZSBgICtcbiAgICAgICAgICAgICAgICAgYCcke25vZGUuc291cmNlLnZhbHVlfScuYCxcbiAgICAgIH0pXG4gICAgfSBlbHNlIGlmICghaW1wb3J0cy5oYXNEZWZhdWx0KSB7XG4gICAgICBjb250ZXh0LnJlcG9ydChkZWZhdWx0U3BlY2lmaWVyLCAnTm8gZGVmYXVsdCBleHBvcnQgZm91bmQgaW4gbW9kdWxlLicpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICAnSW1wb3J0RGVjbGFyYXRpb24nOiBjaGVja0RlZmF1bHQuYmluZChudWxsLCAnSW1wb3J0RGVmYXVsdFNwZWNpZmllcicpLFxuICAgICdFeHBvcnROYW1lZERlY2xhcmF0aW9uJzogY2hlY2tEZWZhdWx0LmJpbmQobnVsbCwgJ0V4cG9ydERlZmF1bHRTcGVjaWZpZXInKSxcbiAgfVxufVxuIl19
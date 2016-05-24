'use strict';

var _Object$assign = require('babel-runtime/core-js/object/assign')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var defaultParseOptions = {
  ecmaVersion: 6, // for espree, esprima. not needed for babylon
  sourceType: 'module'
};

exports['default'] = function (path) {
  var _ref = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

  var settings = _ref.settings;
  var ecmaFeatures = _ref.ecmaFeatures;

  var parser = settings && settings['import/parser'] || 'babylon';

  var _require = require(parser);

  var parse = _require.parse;
  var options = getOptions(parser, settings, ecmaFeatures);

  var ast = parse(_fs2['default'].readFileSync(path, { encoding: 'utf8' }), options);

  // bablyon returns top-level "File" node.
  return ast.type === 'File' ? ast.program : ast;
};

function getOptions(parser, settings, ecmaFeatures) {

  var options = _Object$assign({}, defaultParseOptions, settings && settings['import/parse-options']);

  function inferFeature(feat) {
    if (ecmaFeatures[feat] && options.plugins.indexOf(feat) < 0) {
      options.plugins.push(feat);
    }
  }

  // detect and handle "jsx" ecmaFeature
  if (parser === 'babylon') {
    if (ecmaFeatures) {
      options.plugins = options.plugins ? options.plugins.slice() : [];
      inferFeature('jsx');
      inferFeature('flow');
    }
  }

  return options;
}
module.exports = exports['default'];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9jb3JlL3BhcnNlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7a0JBQWUsSUFBSTs7OztBQUVuQixJQUFNLG1CQUFtQixHQUFHO0FBQzFCLGFBQVcsRUFBRSxDQUFDO0FBQ2QsWUFBVSxFQUFFLFFBQVE7Q0FDckIsQ0FBQTs7cUJBRWMsVUFBVSxJQUFJLEVBQW1DO21FQUFKLEVBQUU7O01BQTdCLFFBQVEsUUFBUixRQUFRO01BQUUsWUFBWSxRQUFaLFlBQVk7O0FBQ3JELE1BQU0sTUFBTSxHQUFHLEFBQUMsUUFBUSxJQUFJLFFBQVEsQ0FBQyxlQUFlLENBQUMsSUFBSyxTQUFTLENBQUE7O2lCQUVqRCxPQUFPLENBQUMsTUFBTSxDQUFDOztBQUEzQixNQUFFLEtBQUssWUFBTCxLQUFLLENBQW9CO0FBQzNCLE1BQUEsT0FBTyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLFlBQVksQ0FBQyxDQUFBOztBQUUxRCxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUUsZ0JBQUcsWUFBWSxDQUFDLElBQUksRUFBRSxFQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUMsQ0FBQyxFQUN6QyxPQUFPLENBQ1IsQ0FBQTs7O0FBR2xCLFNBQU8sR0FBRyxDQUFDLElBQUksS0FBSyxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUE7Q0FDL0M7O0FBR0QsU0FBUyxVQUFVLENBQUMsTUFBTSxFQUFFLFFBQVEsRUFBRSxZQUFZLEVBQUU7O0FBRWxELE1BQUksT0FBTyxHQUFHLGVBQWUsRUFBRSxFQUNGLG1CQUFtQixFQUNuQixRQUFRLElBQUksUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQTs7QUFFMUUsV0FBUyxZQUFZLENBQUMsSUFBSSxFQUFFO0FBQzFCLFFBQUksWUFBWSxDQUFDLElBQUksQ0FBQyxJQUFLLE9BQU8sQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQUFBQyxFQUFFO0FBQzdELGFBQU8sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFBO0tBQzNCO0dBQ0Y7OztBQUdELE1BQUksTUFBTSxLQUFLLFNBQVMsRUFBRTtBQUN4QixRQUFJLFlBQVksRUFBRTtBQUNoQixhQUFPLENBQUMsT0FBTyxHQUFHLE9BQU8sQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsR0FBRyxFQUFFLENBQUE7QUFDaEUsa0JBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQTtBQUNuQixrQkFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFBO0tBQ3JCO0dBQ0Y7O0FBRUQsU0FBTyxPQUFPLENBQUE7Q0FDZiIsImZpbGUiOiJwYXJzZS5qcyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBmcyBmcm9tICdmcydcblxuY29uc3QgZGVmYXVsdFBhcnNlT3B0aW9ucyA9IHtcbiAgZWNtYVZlcnNpb246IDYsICAvLyBmb3IgZXNwcmVlLCBlc3ByaW1hLiBub3QgbmVlZGVkIGZvciBiYWJ5bG9uXG4gIHNvdXJjZVR5cGU6ICdtb2R1bGUnLFxufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAocGF0aCwgeyBzZXR0aW5ncywgZWNtYUZlYXR1cmVzIH0gPSB7fSkge1xuICBjb25zdCBwYXJzZXIgPSAoc2V0dGluZ3MgJiYgc2V0dGluZ3NbJ2ltcG9ydC9wYXJzZXInXSkgfHwgJ2JhYnlsb24nXG5cbiAgY29uc3QgeyBwYXJzZSB9ID0gcmVxdWlyZShwYXJzZXIpXG4gICAgICAsIG9wdGlvbnMgPSBnZXRPcHRpb25zKHBhcnNlciwgc2V0dGluZ3MsIGVjbWFGZWF0dXJlcylcblxuICBjb25zdCBhc3QgPSBwYXJzZSggZnMucmVhZEZpbGVTeW5jKHBhdGgsIHtlbmNvZGluZzogJ3V0ZjgnfSlcbiAgICAgICAgICAgICAgICAgICAsIG9wdGlvbnNcbiAgICAgICAgICAgICAgICAgICApXG5cbiAgLy8gYmFibHlvbiByZXR1cm5zIHRvcC1sZXZlbCBcIkZpbGVcIiBub2RlLlxuICByZXR1cm4gYXN0LnR5cGUgPT09ICdGaWxlJyA/IGFzdC5wcm9ncmFtIDogYXN0XG59XG5cblxuZnVuY3Rpb24gZ2V0T3B0aW9ucyhwYXJzZXIsIHNldHRpbmdzLCBlY21hRmVhdHVyZXMpIHtcblxuICBsZXQgb3B0aW9ucyA9IE9iamVjdC5hc3NpZ24oIHt9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICwgZGVmYXVsdFBhcnNlT3B0aW9uc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAsIHNldHRpbmdzICYmIHNldHRpbmdzWydpbXBvcnQvcGFyc2Utb3B0aW9ucyddKVxuXG4gIGZ1bmN0aW9uIGluZmVyRmVhdHVyZShmZWF0KSB7XG4gICAgaWYgKGVjbWFGZWF0dXJlc1tmZWF0XSAmJiAob3B0aW9ucy5wbHVnaW5zLmluZGV4T2YoZmVhdCkgPCAwKSkge1xuICAgICAgb3B0aW9ucy5wbHVnaW5zLnB1c2goZmVhdClcbiAgICB9XG4gIH1cblxuICAvLyBkZXRlY3QgYW5kIGhhbmRsZSBcImpzeFwiIGVjbWFGZWF0dXJlXG4gIGlmIChwYXJzZXIgPT09ICdiYWJ5bG9uJykge1xuICAgIGlmIChlY21hRmVhdHVyZXMpIHtcbiAgICAgIG9wdGlvbnMucGx1Z2lucyA9IG9wdGlvbnMucGx1Z2lucyA/IG9wdGlvbnMucGx1Z2lucy5zbGljZSgpIDogW11cbiAgICAgIGluZmVyRmVhdHVyZSgnanN4JylcbiAgICAgIGluZmVyRmVhdHVyZSgnZmxvdycpXG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9wdGlvbnNcbn1cbiJdfQ==
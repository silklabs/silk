'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});
var rules = {
  'no-unresolved': require('./rules/no-unresolved'),
  'named': require('./rules/named'),
  'default': require('./rules/default'),
  'namespace': require('./rules/namespace'),
  'export': require('./rules/export'),

  'no-named-as-default': require('./rules/no-named-as-default'),

  'no-require': require('./rules/no-require'),
  'no-duplicates': require('./rules/no-duplicates'),
  'imports-first': require('./rules/imports-first')
};

exports.rules = rules;
var rulesConfig = {
  'no-unresolved': 0,
  'named': 0,
  'namespace': 0,
  'default': 0,
  'export': 0,

  'no-named-as-default': 0,

  'no-require': 0,
  'no-duplicates': 0,
  'imports-first': 0
};
exports.rulesConfig = rulesConfig;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFPLElBQU0sS0FBSyxHQUFHO0FBQ25CLGlCQUFlLEVBQUUsT0FBTyxDQUFDLHVCQUF1QixDQUFDO0FBQ2pELFNBQU8sRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDO0FBQ2pDLFdBQVMsRUFBRSxPQUFPLENBQUMsaUJBQWlCLENBQUM7QUFDckMsYUFBVyxFQUFFLE9BQU8sQ0FBQyxtQkFBbUIsQ0FBQztBQUN6QyxVQUFRLEVBQUUsT0FBTyxDQUFDLGdCQUFnQixDQUFDOztBQUVuQyx1QkFBcUIsRUFBRSxPQUFPLENBQUMsNkJBQTZCLENBQUM7O0FBRTdELGNBQVksRUFBRSxPQUFPLENBQUMsb0JBQW9CLENBQUM7QUFDM0MsaUJBQWUsRUFBRSxPQUFPLENBQUMsdUJBQXVCLENBQUM7QUFDakQsaUJBQWUsRUFBRSxPQUFPLENBQUMsdUJBQXVCLENBQUM7Q0FDbEQsQ0FBQTs7O0FBRU0sSUFBTSxXQUFXLEdBQUc7QUFDekIsaUJBQWUsRUFBRSxDQUFDO0FBQ2xCLFNBQU8sRUFBRSxDQUFDO0FBQ1YsYUFBVyxFQUFFLENBQUM7QUFDZCxXQUFTLEVBQUUsQ0FBQztBQUNaLFVBQVEsRUFBRSxDQUFDOztBQUVYLHVCQUFxQixFQUFFLENBQUM7O0FBRXhCLGNBQVksRUFBRSxDQUFDO0FBQ2YsaUJBQWUsRUFBRSxDQUFDO0FBQ2xCLGlCQUFlLEVBQUUsQ0FBQztDQUNuQixDQUFBIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGNvbnN0IHJ1bGVzID0ge1xuICAnbm8tdW5yZXNvbHZlZCc6IHJlcXVpcmUoJy4vcnVsZXMvbm8tdW5yZXNvbHZlZCcpLFxuICAnbmFtZWQnOiByZXF1aXJlKCcuL3J1bGVzL25hbWVkJyksXG4gICdkZWZhdWx0JzogcmVxdWlyZSgnLi9ydWxlcy9kZWZhdWx0JyksXG4gICduYW1lc3BhY2UnOiByZXF1aXJlKCcuL3J1bGVzL25hbWVzcGFjZScpLFxuICAnZXhwb3J0JzogcmVxdWlyZSgnLi9ydWxlcy9leHBvcnQnKSxcblxuICAnbm8tbmFtZWQtYXMtZGVmYXVsdCc6IHJlcXVpcmUoJy4vcnVsZXMvbm8tbmFtZWQtYXMtZGVmYXVsdCcpLFxuXG4gICduby1yZXF1aXJlJzogcmVxdWlyZSgnLi9ydWxlcy9uby1yZXF1aXJlJyksXG4gICduby1kdXBsaWNhdGVzJzogcmVxdWlyZSgnLi9ydWxlcy9uby1kdXBsaWNhdGVzJyksXG4gICdpbXBvcnRzLWZpcnN0JzogcmVxdWlyZSgnLi9ydWxlcy9pbXBvcnRzLWZpcnN0JyksXG59XG5cbmV4cG9ydCBjb25zdCBydWxlc0NvbmZpZyA9IHtcbiAgJ25vLXVucmVzb2x2ZWQnOiAwLFxuICAnbmFtZWQnOiAwLFxuICAnbmFtZXNwYWNlJzogMCxcbiAgJ2RlZmF1bHQnOiAwLFxuICAnZXhwb3J0JzogMCxcblxuICAnbm8tbmFtZWQtYXMtZGVmYXVsdCc6IDAsXG5cbiAgJ25vLXJlcXVpcmUnOiAwLFxuICAnbm8tZHVwbGljYXRlcyc6IDAsXG4gICdpbXBvcnRzLWZpcnN0JzogMCxcbn1cbiJdfQ==
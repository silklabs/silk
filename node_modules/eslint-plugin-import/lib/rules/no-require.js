'use strict';

module.exports = function (context) {
  return {
    'CallExpression': function CallExpression(call) {
      if (call.callee.type !== 'Identifier') return;
      if (call.callee.name !== 'require') return;

      if (call.arguments.length !== 1) return;
      var module = call.arguments[0];

      if (module.type !== 'Literal') return;
      if (typeof module.value !== 'string') return;

      // keeping it simple: all 1-string-arg `require` calls are reported
      context.report({
        node: call.callee,
        message: 'CommonJS require of module \'' + module.value + '\'.'
      });
    }
  };
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ydWxlcy9uby1yZXF1aXJlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsTUFBTSxDQUFDLE9BQU8sR0FBRyxVQUFVLE9BQU8sRUFBRTtBQUNsQyxTQUFPO0FBQ0wsb0JBQWdCLEVBQUUsd0JBQVUsSUFBSSxFQUFFO0FBQ2hDLFVBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssWUFBWSxFQUFFLE9BQU07QUFDN0MsVUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxTQUFTLEVBQUUsT0FBTTs7QUFFMUMsVUFBSSxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUUsT0FBTTtBQUN2QyxVQUFJLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFBOztBQUU5QixVQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFLE9BQU07QUFDckMsVUFBSSxPQUFPLE1BQU0sQ0FBQyxLQUFLLEtBQUssUUFBUSxFQUFFLE9BQU07OztBQUc1QyxhQUFPLENBQUMsTUFBTSxDQUFDO0FBQ2IsWUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNO0FBQ2pCLGVBQU8sb0NBQWlDLE1BQU0sQ0FBQyxLQUFLLFFBQUk7T0FDekQsQ0FBQyxDQUFBO0tBQ0g7R0FDRixDQUFBO0NBQ0YsQ0FBQSIsImZpbGUiOiJuby1yZXF1aXJlLmpzIiwic291cmNlc0NvbnRlbnQiOlsibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAoY29udGV4dCkge1xuICByZXR1cm4ge1xuICAgICdDYWxsRXhwcmVzc2lvbic6IGZ1bmN0aW9uIChjYWxsKSB7XG4gICAgICBpZiAoY2FsbC5jYWxsZWUudHlwZSAhPT0gJ0lkZW50aWZpZXInKSByZXR1cm5cbiAgICAgIGlmIChjYWxsLmNhbGxlZS5uYW1lICE9PSAncmVxdWlyZScpIHJldHVyblxuXG4gICAgICBpZiAoY2FsbC5hcmd1bWVudHMubGVuZ3RoICE9PSAxKSByZXR1cm5cbiAgICAgIHZhciBtb2R1bGUgPSBjYWxsLmFyZ3VtZW50c1swXVxuXG4gICAgICBpZiAobW9kdWxlLnR5cGUgIT09ICdMaXRlcmFsJykgcmV0dXJuXG4gICAgICBpZiAodHlwZW9mIG1vZHVsZS52YWx1ZSAhPT0gJ3N0cmluZycpIHJldHVyblxuXG4gICAgICAvLyBrZWVwaW5nIGl0IHNpbXBsZTogYWxsIDEtc3RyaW5nLWFyZyBgcmVxdWlyZWAgY2FsbHMgYXJlIHJlcG9ydGVkXG4gICAgICBjb250ZXh0LnJlcG9ydCh7XG4gICAgICAgIG5vZGU6IGNhbGwuY2FsbGVlLFxuICAgICAgICBtZXNzYWdlOiBgQ29tbW9uSlMgcmVxdWlyZSBvZiBtb2R1bGUgJyR7bW9kdWxlLnZhbHVlfScuYCxcbiAgICAgIH0pXG4gICAgfSxcbiAgfVxufVxuIl19
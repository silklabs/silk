'use strict';

const MESSAGE = 'all files need to declare @flow or @noflow in their first top-level comment';

module.exports = {
  create: function (context) {
    return {
      Program: function(node) {
        const comments = node.comments;
        if (comments.length &&
            (comments[0].value.indexOf('@flow') !== -1 ||
             comments[0].value.indexOf('@noflow') !== -1)) {
          return;
        }
        context.report({
          node: node,
          message: MESSAGE,
        });
      },
    };
  },
};

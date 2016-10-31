'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
var stripSpacesAfter = exports.stripSpacesAfter = function stripSpacesAfter(node, spaces) {
  return function (fixer) {
    return fixer.removeRange([node.end, node.end + spaces]);
  };
};

var addSpaceAfter = exports.addSpaceAfter = function addSpaceAfter(node) {
  return function (fixer) {
    return fixer.insertTextAfter(node, ' ');
  };
};
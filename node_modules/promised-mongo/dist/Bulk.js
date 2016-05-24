'use strict';

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _Object$defineProperty = require('babel-runtime/core-js/object/define-property')['default'];

var _regeneratorRuntime = require('babel-runtime/regenerator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

_Object$defineProperty(exports, '__esModule', {
  value: true
});

var _mongodbCore = require('mongodb-core');

var _mongodbCore2 = _interopRequireDefault(_mongodbCore);

var Bulk = (function () {
  function Bulk(collection, ordered) {
    _classCallCheck(this, Bulk);

    this.collection = collection;
    this.ordered = ordered;
    this._currentCommand = null;
    this._commands = [];
  }

  _createClass(Bulk, [{
    key: 'execute',
    value: function execute() {
      var self, result, i, cmd, cmdResult;
      return _regeneratorRuntime.async(function execute$(context$2$0) {
        while (1) switch (context$2$0.prev = context$2$0.next) {
          case 0:
            self = this;
            result = {
              writeErrors: [],
              writeConcernErrors: [],
              nInserted: 0,
              nUpdated: 0,
              nMatched: 0,
              nModified: 0,
              nRemoved: 0,
              upserted: []
            };

            self._commands.push(self._currentCommand);

            i = 0;

          case 4:
            if (!(i < self._commands.length)) {
              context$2$0.next = 13;
              break;
            }

            cmd = self._commands[i];
            context$2$0.next = 8;
            return _regeneratorRuntime.awrap(self.collection.db.runCommand(cmd));

          case 8:
            cmdResult = context$2$0.sent;

            if (cmd.update) {
              result.nUpdated += cmdResult.result.n;
            } else if (cmd.insert) {
              result.nInserted += cmdResult.result.n;
            } else if (cmd['delete']) {
              result.nRemoved += cmdResult.result.n;
            }

          case 10:
            ++i;
            context$2$0.next = 4;
            break;

          case 13:

            result.ok = 1;
            return context$2$0.abrupt('return', result);

          case 15:
          case 'end':
            return context$2$0.stop();
        }
      }, null, this);
    }
  }, {
    key: 'find',
    value: function find(query) {
      var findObject, self, remove, update;
      return _regeneratorRuntime.async(function find$(context$2$0) {
        while (1) switch (context$2$0.prev = context$2$0.next) {
          case 0:
            findObject = {};
            self = this;

            remove = function remove(limit) {
              if (!self._currentCommand) {
                self._currentCommand = {
                  'delete': self.collection.collectionName,
                  deletes: [],
                  ordered: self.ordered,
                  writeConcern: { w: 1 }
                };
              } else if (!self._currentCommand['delete']) {
                self._commands.push(self._currentCommand);
                self._currentCommand = {
                  'delete': self.collection.collectionName,
                  deletes: [],
                  ordered: self.ordered,
                  writeConcern: { w: 1 }
                };
              }
              self._currentCommand.deletes.push({ q: query, limit: limit });
            };

            update = function update(updateObject, multiple) {
              if (!self._currentCommand) {
                self._currentCommand = {
                  update: self.collection.collectionName,
                  updates: [],
                  ordered: self.ordered,
                  writeConcern: { w: 1 }
                };
              } else if (!self._currentCommand.update) {
                self._commands.push(self._currentCommand);
                self._currentCommand = {
                  update: self.collection.collectionName,
                  updates: [],
                  ordered: self.ordered,
                  writeConcern: { w: 1 }
                };
              }
              self._currentCommand.updates.push({ q: query, u: updateObject, multi: mulitple, upsert: false });
            };

            findObject.remove = function () {
              remove(0);
            };
            findObject.removeOne = function () {
              remove(1);
            };
            findObject.update = function (updateObject) {
              update(updateObject, true);
            };
            findObject.updateOne = function (updateObject) {
              update(updateObject, false);
            };

            return context$2$0.abrupt('return', findObject);

          case 9:
          case 'end':
            return context$2$0.stop();
        }
      }, null, this);
    }
  }, {
    key: 'insert',
    value: function insert(doc) {
      var self = this;

      if (!self._currentCommand) {
        self._currentCommand = {
          insert: self.collection.collectionName,
          documents: [],
          ordered: self.ordered,
          writeConcern: { w: 1 }
        };
      } else if (!self._currentCommand.insert) {
        self._commands.push(self._currentCommand);
        self._currentCommand = {
          insert: self.collection.collectionName,
          documents: [],
          ordered: self.ordered,
          writeConcern: { w: 1 }
        };
      }

      if (!doc._id) {
        doc._id = _mongodbCore2['default'].BSON.ObjectID.createPk();
      }
      this._currentCommand.documents.push(doc);
    }
  }, {
    key: 'tojson',
    value: function tojson() {
      var result = {
        nInsertOps: 0,
        nUpdateOps: 0,
        nRemoveOps: 0,
        nBatches: this._commands.length
      };

      this._commands.forEach(function (cmd) {
        if (cmd.update) {
          result.nUpdateOps += cmd.updates.length;
        } else if (cmd.insert) {
          result.nInsertOps += cmd.documents.length;
        } else if (cmd['delete']) {
          result.nRemoveOps += cmd.deletes.length;
        }
      });

      return result;
    }
  }]);

  return Bulk;
})();

exports['default'] = Bulk;
;
module.exports = exports['default'];

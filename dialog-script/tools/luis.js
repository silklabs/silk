/**
 * @noflow
 */

'use strict';

let https = require('https');
let createLog = require('silk-log');
const log = createLog(`luis-api`);

const LUIS_HOSTNAME = `api.projectoxford.ai`;
const LUIS_PORT = 443;
const LUIS_BASE_PATH = `/luis/v1.0/prog/apps/`;

class Luis {
  constructor(options) {
    this._appId = options.appId;
    this._subscriptionKey = options.subscriptionKey;
  }

  _req(method, resource, data, params) {
    data = JSON.stringify(data);

    params = (params === undefined) ? {} : params;
    let urlParams = '';
    let paramSeparator = '?';
    for (let arg in params) {
      urlParams += `${paramSeparator}${arg}=${params[arg]}`;
      paramSeparator = '&';
    }

    let opts = {
      hostname: LUIS_HOSTNAME,
      port: LUIS_PORT,
      path: LUIS_BASE_PATH + this._appId + '/' + resource + urlParams,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Ocp-Apim-Subscription-Key': this._subscriptionKey,
      },
    };

    log.debug('http request: ' + JSON.stringify(opts));

    return new Promise((resolve, reject) => {
      const req = https.request(opts, (res) => {
        let json = '';
        res.once('error', error => reject(error));
        res.on('data', chunk => {
          json += chunk;
        });
        res.once('end', () => {
          if (res.statusCode >= 200 || res.statusCode <= 202) {
            log.debug(`Request complete`);
            if (method !== 'DELETE') {
              json = JSON.parse(json);
            }
            log.debug(json);
            resolve(json);
          } else {
            log.error(json);
            reject(new Error(`Request failed: ` + `${res.statusCode}`));
          }
        });
      });
      log.debug('http request data: ' + data);
      req.write(data);
      req.end();
    });
  }

  get(resource, data, params) {
    return this._req('GET', resource, data, params);
  }

  post(resource, data, params) {
    return this._req('POST', resource, data, params);
  }

  delete(resource, data, params) {
    return this._req('DELETE', resource, data, params);
  }

  _doAllParallel(funcs) {
    let promises = [];

    for (let func of funcs) {
      promises.push(func());
    }
    return Promise.all(promises);
  }

  _doAllSerial(funcs) {
    let promise = Promise.resolve();

    for (let func of funcs) {
      promise = promise.then(() => func());
      //.then(() => new Promise(resolve => setTimeout(resolve, 0)));
    }
    return promise;
  }

  _checkClassifierType(type) {
    if (type !== 'intents' && type !== 'entities' && type !== 'prebuilts') {
      throw new Error(`${type} is an invalid classifier type`);
    }
  }

  _addClassifiers(type, names) {
    log.info(`Adding ${type} classifier`);
    let funcs = [];

    this._checkClassifierType(type);

    for (let name of names) {
      funcs.push(() => {
        log.info(`Adding ${type} classifier: ${name}`);
        return this.post(type, { name: name, children: {} });
      });
    }
    return this._doAllSerial(funcs);
  }

  _removeAllClassifiers(type) {
    log.info(`Removing all ${type} classifiers`);

    this._checkClassifierType(type);

    return this.get(type, {})
    .then(classifiers => {
      let funcs = [];

      for (let classifier of classifiers) {
        funcs.push(() => {
          if (type === 'intents' && classifier.name === 'None') {
            log.info(`Not removing 'None' intent: ${classifier.id}`);
            return Promise.resolve();
          } else {
            log.info(`Removing ${type} classifier: ${classifier.id}`);
            return this.delete(type + '/' + classifier.id, {});
          }
        });
      }
      return this._doAllSerial(funcs);
    });
  }

  addEntities(names) {
    return this._addClassifiers('entities', names);
  }

  removeAllEntities() {
    return this._removeAllClassifiers('entities');
  }

  addIntents(names) {
    return this._addClassifiers('intents', names);
  }

  removeAllIntents() {
    return this._removeAllClassifiers('intents');
  }

  addPrebuilts(names) {
    return this.post('prebuilts', names);
  }

  removeAllPrebuilts() {
    return this._removeAllClassifiers('prebuilts');
  }

  newExample(exampleText, intent, entities) {
    entities = (entities === undefined) ? {} : entities;
    let example = {
      ExampleText: exampleText,
      SelectedIntentName: intent,
      EntityLabels: [],
    };

    for (let entity in entities) {
      let entityToken = entities[entity];
      let startToken = exampleText.indexOf(entityToken);
      let endToken = startToken + entityToken.length;
      if (startToken === -1 ) {
        throw new Error(`Bad example. ${entityToken} not in ${exampleText}`);
      } else {
        example.EntityLabels.push({
          EntityType: entity,
          StartToken: startToken,
          EndToken: endToken,
        });
      }
    }
    return example;
  }

  addExamples(examples) {
    return this.post('examples', examples)
    .then(results => {
      for (let result of results) {
        if (result.has_error) {
          throw new Error(`Add example error for: ${result.error.message}`);
        }
      }
    });
  }

  removeAllExamples() {
    log.info(`Removing all examples`);

    return this.get('examples', {}, {skip: 0, count: 100})
    .then(examples => {
      let funcs = [];

      for (let example of examples) {
        funcs.push(() => {
          log.info(`Removing example: ${example.exampleId}`);
          return this.delete(`examples/${example.exampleId}`, {});
        });
      }
      return this._doAllSerial(funcs);
    });
  }

  waitForTrainingDone() {
    return this.get('train', {})
    .then(results => {
      let done;
      for (let result of results) {
        let status = result.Details.Status;
        if (status === 'In progress') {
          // some training still ongoing, so not all done
          done = false;
          break;
        } else if (status === 'Success' || status === 'Up to date') {
          done = true;
        } else {
          // error! the horrors.
          throw new Error(`Training failed ` + result);
        }
      }
      if (done) {
        return Promise.resolve(true);
      } else {
        return this.waitForTrainingDone();
      }
    });
  }

  train() {
    return this.post('train', {})
    .then(() => this.waitForTrainingDone());
  }
}

module.exports = Luis;

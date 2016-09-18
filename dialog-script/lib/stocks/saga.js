/**
 * @flow
 */

import createLog from 'silk-log/device';
import * as http from 'http';
import {call} from 'redux-saga/effects';
import invariant from 'assert';

import type {Environment} from '../environment';
import {urlEncodeParams} from '../utils';
import type {Entities} from 'silk-dialog-engine';

const log = createLog(`script-generic-stock-saga`);

export type CurrentStockPrice = {
  price: number,
  change: number,
};

type CurrentStockName = {
  ticker: string,
  name: string,
};

function fetchStockTicker(stock: string): Promise<CurrentStockName> {
  log.info(`Getting current stock ticker for ${stock}`);

  return new Promise((resolve, reject) => {
    const params = urlEncodeParams({ 'query': stock });
    const opts = {
      hostname: 'autoc.finance.yahoo.com',
      path: `/autoc?${params}&region=1&lang=en`,
      method: 'GET',
    };

    log.debug(`Issuing http stock request`);
    log.debug(`options`, opts);

    const req = http.request(opts, (res) => {
      let data = '';
      res.once(`error`, (error) => reject(error));
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.once('end', () => {
        log.debug(`Request complete ${res.statusCode}`);

        if (res.statusCode === 200) {
          try {
            let results = JSON.parse(data).ResultSet.Result;
            log.debug(results);

            let ticker = results.find((result) => {
              return result.exchDisp === 'NASDAQ' || result.exchDisp === 'NYSE';
            });
            if (!ticker) {
              throw new Error(`Failed to get ticker`);
            }
            resolve({ticker: ticker.symbol, name: ticker.name});
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`Request failed code: ${res.statusCode}`));
        }
      });
    });
    req.end();
  });
}

function fetchStockPrice(ticker: string): Promise<CurrentStockPrice> {
  log.debug(`Getting current stock price for ${ticker}`);

  return new Promise((resolve, reject) => {
    // http://www.google.com/finance/info?q=NASDAQ%3aqcom
    const params = urlEncodeParams({ 'q': ticker });
    const opts = {
      hostname: 'www.google.com',
      path: `/finance/info?${params}`,
      method: 'GET',
    };

    log.debug(`Issuing http stock request`);
    log.debug(`options`, opts);

    const req = http.request(opts, (res) => {
      let data = '';
      res.once(`error`, (error) => reject(error));
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.once('end', () => {
        log.info(`Request complete ${res.statusCode}`);

        if (res.statusCode === 200) {
          try {
            // results has '// ' prepended, remove that before JSON conversion
            let result = JSON.parse(data.substring(3));
            log.debug(result);

            if ('l' in result[0] && 'cp' in result[0]) {
              resolve({price: result[0].l, change: result[0].cp});
            } else {
              reject(new Error(`${result}`));
            }
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error(`Request failed code: ${res.statusCode}`));
        }
      });
    });
    req.end();
  });
}

export function* getStockPrice(
  environment: Environment,
  entities: Entities,
): Generator<Object, void, any> {
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting stock saga`);

  if (entities.length === 0 || entities[0].type !== 'stock' ||
      !entities[0].entity || entities[0].entity.length === 0) {
    yield call(speak,
        `Sorry, I'm not sure which stock you are asking about`, `idle`);
    return;
  }

  const stock = entities[0].entity;
  let stockPrice;
  let stockName;
  try {
    let result = yield call(fetchStockTicker, stock);
    if (!result) {
      throw new Error('Invalid result');
    }
    stockPrice = yield call(fetchStockPrice, result.ticker);
    stockName = result.name;
    invariant(stockPrice);
  } catch (err) {
    log.error(`${err}`);
    yield call(speak, `Sorry, I'm unable to get the stock price for ${stock}`, `idle`);
    return;
  }

  let text;
  if (stockPrice.change < 0) {
    text = `is down ${Math.abs(stockPrice.change)}%`;
  } else if (stockPrice.change === 0) {
    text = `has not changed`;
  } else {
    text = `is up ${stockPrice.change}%`;
  }
  text = `${stockName} ${text}, currently at $${stockPrice.price}`;
  yield call(speak, text, `idle`);
}

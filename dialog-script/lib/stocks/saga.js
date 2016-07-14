/**
 * @flow
 */

import createLog from 'silk-log';
import * as http from 'http';
import {call} from 'redux-saga/effects';
import invariant from 'assert';

import type {Environment} from '../environment';
import {urlEncodeParams} from '../utils';

const log = createLog(`script-generic-stock-saga`);

export type CurrentStockPrice = {
  price: number,
  change: number
};

function fetchStockPrice(stock: string): Promise<CurrentStockPrice> {
  log.info(`Getting current stock price for ${stock}`);

  // TODO, use service for this mapping
  const ticker = {
    'apple': 'nasdaq:aapl',
    'qualcomm': 'nasdaq:qcom',
    'google': 'nasdaq:goog',
    'amazon': 'nasdaq:amzn',
    'mattel': 'nasdaq:mat',
    'microsoft': 'nasdaq:msft',
  }[stock];

  if (!ticker) {
    return Promise.resolve({ price: 0, change: 0});
  }

  return new Promise((resolve, reject) => {
    // http://www.google.com/finance/info?q=NASDAQ%3aqcom
    const params = urlEncodeParams({ 'q': ticker });
    const opts = {
      hostname: 'www.google.com',
      path: `/finance/info?${params}`,
      method: 'GET',
    };

    log.info(`Issuing http stock request`);
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
              resolve({price: 0, change: 0});
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
  stock: string,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting stock saga for ${stock}`);
  let stockPrice = yield call(fetchStockPrice, stock);
  invariant(stockPrice);

  log.debug(stockPrice);

  if (stockPrice.price === 0) {
    yield call(speak,
        `Sorry, I'm unable to get the stock price of ${stock}`, `idle`);
  } else {
    let text;
    if (stockPrice.change < 0) {
      text = `is down ${Math.abs(stockPrice.change)}%`;
    } else if (stockPrice.change === 0) {
      text = `has not changed`;
    } else {
      text = `is up ${stockPrice.change}%`;
    }
    text = `${stock} ${text}, currently at $${stockPrice.price}`;
    yield call(speak, text, `idle`);
  }

}

/**
 * @flow
 */

import createLog from 'silk-log';
import * as http from 'http';
import {call, put, select, take} from 'redux-saga/effects';
import invariant from 'assert';

import type {Environment} from '../environment';
import {urlEncodeParams} from '../utils';

import {updateZipcode, clearZipcode} from './actions';

const log = createLog(`script-generic-weather-saga`);

const getWeatherState = (state) => Object.assign({}, state.weather);

export type CurrentWeather = {
  temp: number,
  description: string,
  location: string,
};

function fetchWeather(zipcode: number): Promise<CurrentWeather> {
  log.info(`Getting current weather for zipcode ${zipcode}`);

  return new Promise((resolve, reject) => {
    //http://api.openweathermap.org/data/2.5/weather?units=imperial&zip=94103,us&appid=54472ed7a293dd7d1b57da42b163030f
    const params = urlEncodeParams({
      'units': 'imperial',
      'zip': `${zipcode},us`,
      'appid': '54472ed7a293dd7d1b57da42b163030f',
    });
    const opts = {
      hostname: 'api.openweathermap.org',
      path: `/data/2.5/weather?${params}`,
      method: 'GET',
    };

    log.info(`Issuing http weather request`);
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
            let result = JSON.parse(data);
            log.debug(result);

            let location = result.name;
            let temp = Math.round(result.main.temp);
            let weatherDesc = '';
            let weatherId = result.weather[0].id;

            if (weatherId < 300) {
              weatherDesc = 'thunderstorms';
            } else if (weatherId < 400) {
              weatherDesc = 'drizzling';
            } else if (weatherId < 600) {
              weatherDesc = 'raining';
            } else if (weatherId < 700) {
              weatherDesc = 'snowing';
            } else if (weatherId < 800) {
              weatherDesc = '';
            } else if (weatherId === 800) {
              weatherDesc = 'sunny';
            } else if (weatherId < 900) {
              weatherDesc = 'cloudy';
            }

            resolve({temp, description: weatherDesc, location});
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

export function* resetZipcode(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

  const {speak} = environment;
  invariant(speak);

  log.info(`Starting reset zipcode saga`);
  yield put(clearZipcode());
  yield call(speak, `Cleared zipcode`, `idle`);
}

export function* getWeather(
  environment: Environment,
): Generator<Object, void, any> {                // eslint-disable-line no-undef
  invariant(environment);

  const {micChannel, speak} = environment;
  invariant(micChannel);
  invariant(speak);

  log.info(`Starting weather saga`);

  const state = yield select(getWeatherState);
  invariant(state);

  let zipcode = state.zipcode;
  if (!zipcode) {
    log.info(`No zipcode found. Ask user for their zipcode`);
    for (let retryCount = 0; retryCount <= 2; retryCount++) {
      const intro = retryCount ? `Sorry, I didn't get that. ` : '';
      const query = 'What is your zipcode?';

      yield call(speak, intro + query, `waiting`);

      let event = yield take(micChannel);
      invariant(event);

      const newZipcode = event.text;
      if (!newZipcode.match(/\d{5}/)) {
        continue;
      }

      log.info(`Got new zipcode ${newZipcode}`);
      yield put(updateZipcode(newZipcode));
      zipcode = newZipcode;
      break;
    }
  }

  if (!zipcode) {
    yield call(speak, `Sorry, I'm not understanding. Please try again`, `idle`);
    return;
  }

  let weather = yield call(fetchWeather, zipcode);
  invariant(weather);

  log.debug(weather);

  let text = `It's currently ${weather.temp} degrees`;
  if (weather.description === 'thunderstorms') {
    text = `${text} with thunderstorms`;
  } else if (weather.description !== '') {
    text = `${text} and ${weather.description}`;
  }
  text += ` in ${weather.location}`;
  yield call(speak, text, `idle`);
}

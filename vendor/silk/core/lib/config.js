/* -*- Mode: js2; tab-width: 2; indent-tabs-mode: nil; js2-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

let api = require('./api');
let events = require('events');
let btle = require('./btle');
let log = require('./log')('config');
let wifi = require('./wifi');
let util = require('./util');

class DeviceConfig extends events.EventEmitter {

  constructor() {
    super();
  }

  _runConfigService(id) {
    return new Promise((resolve, reject) => {
      log.info('Launching config service ...');
      const STATE = api.btleConfigService.state;
      let configService = btle.configService(id.pub);
      let updateRssiInterval = null;

      let bleno = btle.bleno;

      bleno.setServices([configService]);
      bleno.once('servicesSet', errServicesSet => {
        if (errServicesSet) {
          throw new Error(errServicesSet);
        }
        log.info(`Started config service for device ${id}`);

        // TODO: get name from build config
        bleno.startAdvertising('Silkcam', [configService.uuid],
                               err => err && log.warn('Error: ' + err));
      });

      let advertisingStartListener = err => {
        if (err) {
          return reject(`runConfigService: ${err}`);
        }
        log.info('Started advertising');
      };
      bleno.once('advertisingStart', advertisingStartListener);

      let acceptListener = clientAddr => {
        log.info('Accepted connection from', clientAddr);
        // TODO: how do we associate the RSSI with a particular
        // connected central?
        let updateRssi = () => {
          bleno.updateRssi((err, rssi) => {
            if (err) {
              return reject(`runConfigService: ${err}`);
            }
            configService.updateRssi(rssi);
          });
        };
        if (updateRssiInterval) {
          clearInterval(updateRssiInterval);
        }
        updateRssiInterval = setInterval(updateRssi, 100);
      };
      bleno.on('accept', acceptListener);

      let disconnectListener = clientAddr => {
        log.info('GATT client', clientAddr, 'disconnected');
        if (updateRssiInterval) {
          clearInterval(updateRssiInterval);
        }
      };
      bleno.on('disconnect', disconnectListener);

      let stateChangeListener = state => {
        log.info('Device configuration state is now', state);
        if (state !== STATE.REGISTERED) {
          return;
        }

        configService.removeListener('stateChange', stateChangeListener);
        bleno.removeListener('advertisingStart', advertisingStartListener);
        bleno.removeListener('accept', acceptListener);
        bleno.removeListener('disconnect', disconnectListener);

        clearInterval(updateRssiInterval);
        bleno.stopAdvertising(() => {
          log.info('Stopped advertising');
          bleno.once('servicesSet', errServicesSet => {
            if (errServicesSet) {
              throw new Error(errServicesSet);
            }
            log.info(`Stopped config service`);
          });
          bleno.setServices();
        });

        wifi.forgetNetwork()
        .then(() => {
          wifi.joinNetwork(configService.ap,
            configService.unsecured ? '' : configService.secret);
        })
        .then(() => {
          log.info(`Successfully joined the network: ${configService.ap}`);
          // TODO: It might be better to block here until the device successfully
          //       contacts the server for the first time to confirm a valid
          //       SSID/PSK was provided.
          resolve();
        })
        .catch(e => util.processthrow(e));

      };
      configService.on('stateChange', stateChangeListener);
    });
  }

  _isConfigured() {
    return wifi.networkConfigured();
  }

  init() {
    return this._isConfigured()
      .then(() => this.emit('configured'))
      .catch(() => this.emit('unconfigured'));
  }

  unconfigure() {
    return this._isConfigured().then(() => {
      return wifi.forgetNetwork().then(() => {
        return this.emit('unconfigured');
      });
    }, () => {
      log.info('Device already unconfigured');
    });
  }

  configure(id) {
    return this._runConfigService(id).then(() => {
      this.emit('configured');
    });
  }
}

module.exports = new DeviceConfig();

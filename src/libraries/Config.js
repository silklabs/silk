import {
  AsyncStorage,
} from 'react-native';
import {
  EventEmitter,
} from 'events';
import merge from 'lodash.merge';
import mklog from 'log'; const log = mklog('Config');

// Default configuration...
const DEFAULT = {
  'debug': 'silk-*,-silk-*:debug',
  'react-native': {},
  'server': {
    choices: [
      {name: 'default', value: null},
      {name: 'master', value: 'https://silk-server-master.herokuapp.com'},
      {name: 'next', value: 'https://silk-server-next.herokuapp.com'},
      {name: 'release', value: 'https://silk-server-release.herokuapp.com'},
      {name: 'localhost', value: 'http://localhost:5000'},
    ],
  },

  /**
   * Development preferences intended to be overriden in config.local.json
   */
  'preferences': {
    showLiveLag: false,

    // Very verbose socket.io logging!
    socketioLogs: false,

    // If `true`, draw object boxes for detected events.
    //
    // Currently disabled because of
    //
    //  https://github.com/silklabs/silk-app/issues/546 and
    //  https://github.com/silklabs/silk-app/issues/344
    drawObjectBoxesFullscreenVideo: false,

    allowDevAccount: true,
    showServerPicker: true,
  },
};

const STORAGE_KEY = 'app.config';

class Config extends EventEmitter {

  config = null;
  _initialized = false;
  _buildConfig = null;
  _userConfig = null;

  constructor() {
    super();
    this._loadBuildConfig();
  }

  _loadBuildConfig() {
    let config;
    try {
      // Note: that to resolve this path correctly it must be passed as string
      // literal
      config = require('../../config.local.json');
    } catch (e) {
      config = {};
    }
    this._buildConfig = merge({}, DEFAULT, config);
  }

  async _loadUserConfig() {
    let value = await AsyncStorage.getItem(STORAGE_KEY);
    if (!value) {
      return {};
    }
    let config;
    try {
      config = JSON.parse(value);
    } catch (ex) {
      log.warn('Could not JSON parse config:', ex);
      config = {};
    }
    this._userConfig = config;
  }

  async init() {
    if (this._initialized) {
      return;
    }
    await this._loadUserConfig();
    this.config = merge({}, this._buildConfig, this._userConfig);

    this._initialized = true;
    this.emit('init');
    this.emit('change', this.config);
  }

  getDefault() {
    return this._buildConfig;
  }

  get() {
    if (!this._initialized) {
      throw new Error('Need to initialize before accessing config!');
    }
    return this.config;
  }

  async set(customization) {
    if (!this._initialized) {
      throw new Error('Not initialized yet.');
    }
    let newUserConfig = merge({}, this.userConfig, customization);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newUserConfig));

    this._userConfig = newUserConfig;
    this.config = merge({}, this._buildConfig, this._userConfig);
    this.emit('change', this.config);
  }

}

const config = new Config();
export default config;

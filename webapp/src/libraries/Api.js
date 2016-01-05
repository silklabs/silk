
import Config from './Config';
import createApi from 'silk-api';

let api = createApi({ serverUrl: Config.serverUrl });
export default api;

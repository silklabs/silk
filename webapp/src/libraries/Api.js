import Config from './Config';
import createApi from 'silk-api';

let api = createApi({
  serverUrl: Config.serverUrl,
  metrics: {
    type: 'account',
    tags: {},
  },
});
export default api;

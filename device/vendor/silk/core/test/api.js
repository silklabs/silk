import { default as createApi, AccessToken } from 'silk-api';
import realAPI from '../lib/api';

// Helper will use developer account and register a device...
export default async function(config = {}) {
  let api = createApi({
    metrics: {
      type: 'device',
      tags: { },
    },
  });
  api.accessToken = await AccessToken.gen();

  // Semi-nasty hack where we set the accessToken that the lib code will use.
  realAPI.accessToken = api.accessToken;

  let accessToken = new AccessToken(
    api.devAccount.publicKey,
    api.devAccount.privateKey,
  );

  // API as the developer account...
  let accountApi = createApi({
    metrics: {
      type: 'account',
      tags: { },
    },
  });
  accountApi.accessToken = accessToken;

  // update local configuration (useful for changing server url).
  if (config) {
    [api, realAPI, accountApi].forEach(api => api.loadConfig(config));
  }

  // register the device...
  let token = accountApi.accessToken.sign(api.accessToken.toString());
  await accountApi.account.registerDevice({
    devicePublicKey: api.accessToken.toString(),
    name: 'testing',
    type: 'camera',
    registrationToken: token,
  });

  await api.device.completeRegistration({
    registrarPublicKey: accountApi.accessToken.toString(),
    registrationToken: token,
  });

  return { device: api, account: accountApi };
}

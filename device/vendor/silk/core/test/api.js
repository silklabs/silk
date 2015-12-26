import { default as createApi, AccessToken } from 'silk-api';
import realAPI from '../lib/api';

// Helper will use developer account and register a device...
export default async function() {
  let api = createApi();
  api.accessToken = api.id.create();

  // Semi-nasty hack where we set the acessToken that the lib code will use.
  realAPI.accessToken = api.accessToken;

  let accessToken = new AccessToken(
    api.devAccount.publicKey,
    api.devAccount.privateKey,
  );

  // API as the developer account...
  let accountApi = createApi();
  accountApi.accessToken = accessToken;

  // register the device...
  let token = accountApi.accessToken.sign(api.accessToken.toString());
  await accountApi.account.registerDevice({
    devicePublicKey: api.accessToken.toString(),
    name: 'testing',
    type: 'camera',
    registrationToken: token
  });

  await api.device.completeRegistration({
    registrarPublicKey: accountApi.accessToken.toString(),
    registrationToken: token
  });

  return { device: api, account: accountApi };
}

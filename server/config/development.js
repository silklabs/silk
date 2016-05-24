/**
Configuration profile used in development.
*/

import * as azureCreds from '../../credentials/azure';

export default {
  // For development we use same credentials as the test environment but we use
  // the default table names (which are the same as used in the production
  // credentials).
  azure: {
    init: false,
    setServiceProps: false,
    regions: {
      uswest: azureCreds.uswest,
      useast: azureCreds.useast,
    }
  }
};

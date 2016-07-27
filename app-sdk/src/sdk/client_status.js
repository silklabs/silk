/**
 * @flow
 */

type ClientConnectionStatus =
    'NOT_CONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  ;
type ClientConnectionError =
    'SERVER_UNREACHABLE'
  ;

type ClientAuthStatus =
    'NOT_AUTHENTICATED'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  ;

// TODO:
type ClientAuthError = string;

export type ClientStatusMessage = {
  type: 'CLIENT_STATUS';
  clientConnectionStatus: ClientConnectionStatus;
  clientConnectionError: ?ClientConnectionError;
  clientAuthStatus: ClientAuthStatus;
  clientAuthError: ?ClientAuthError;
};

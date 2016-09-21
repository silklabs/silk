/**
 * Account manipulation (adding devices/etc...)
 *
 * @flow
 */

import BaseClass from '../http_client';

export type SocketioUrlInput = {
};

export type SocketioUrlOutput = {
 url: string;
};

export type WriteMetricsInput = {
 firstPointTimestamp: ?number;
 submissionTimestamp: ?number;
 droppedCount: ?number;
 points: Array<any>;
};

export type WriteMetricsOutput = {
};

export type WhoamiInput = {
};

export type WhoamiOutput = {
 accountId: string;
};

export type RegisterDeviceInput = {
 devicePublicKey: string;
 type: string;
 name: string;
 registrationToken: string;
};

export type RegisterDeviceOutput = {
 success: bool;
 beaconUUID: ?string;
};

export type ListDevicesInput = {
};

export type ListDevicesOutputDevices = {
 name: string;
 type: string;
 registered: bool;
 accountDeviceNumber: number;
 publicKey: string;
 deviceId: string;
 lastSeenAt: string;
};

export type ListDevicesOutput = {
 devices: Array<ListDevicesOutputDevices>;
};

export type UnregisterDeviceInput = {
 devicePublicKey: string;
 factoryResetMessage: string;
};

export type UnregisterDeviceOutput = {
 success: bool;
};

export type QueryMetricsInput = {
 query: string;
};

export type QueryMetricsOutputResults = {
};

export type QueryMetricsOutput = {
 results: ?QueryMetricsOutputResults;
 error: ?string;
};

export type GetSasForDeviceSignalingInput = {
};

export type GetSasForDeviceSignalingOutput = {
 publicUrl: ?string;
 sas: Array<any>;
};

export type ListClientsInput = {
};

export type ListClientsOutputClients = {
 publicKey: string;
 userAgent: string;
 scopes: Array<string>;
 issued: string;
 expires: string;
 lastSeenAt: string;
};

export type ListClientsOutput = {
 clients: Array<ListClientsOutputClients>;
};

export type PostMessageInput = {
 devicePublicKey: string;
 message: string;
};

export type PostMessageOutput = {
};

export type RevokeClientInput = {
 clientPublicKey: string;
 revokeClientMessageForDevices: string;
};

export type RevokeClientOutput = {
 success: bool;
};

export type SetClientUserAgentInput = {
 clientPublicKey: string;
 userAgent: string;
};

export type SetClientUserAgentOutput = {
 success: bool;
};

export default class Account extends BaseClass {

  name: string = 'api-account';
  prefix: string = '/v1/account/';

  
  /**
  Get socket.io url for device...

  @param Object payload of request
  */
  socketioURL(payload: SocketioUrlInput): Promise<SocketioUrlOutput> {
    let method = 'post';
    let url = '/v1/account/socketio/url';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  

  @param Object payload of request
  */
  writeMetrics(payload: WriteMetricsInput): Promise<WriteMetricsOutput> {
    let method = 'post';
    let url = '/v1/account/metrics/point';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Get basic details about the current account

  @param Object payload of request
  */
  whoami(payload: WhoamiInput): Promise<WhoamiOutput> {
    let method = 'post';
    let url = '/v1/account/whoami';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Create a user account

  @param Object payload of request
  */
  registerDevice(payload: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
    let method = 'post';
    let url = '/v1/account/register_device';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  List all registered devices

  @param Object payload of request
  */
  listDevices(payload: ListDevicesInput): Promise<ListDevicesOutput> {
    let method = 'post';
    let url = '/v1/account/list_devices';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Remove device from the account

  @param Object payload of request
  */
  unregisterDevice(payload: UnregisterDeviceInput): Promise<UnregisterDeviceOutput> {
    let method = 'post';
    let url = '/v1/account/unregister_device';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Query metrics /w influxql

  @param Object payload of request
  */
  queryMetrics(payload: QueryMetricsInput): Promise<QueryMetricsOutput> {
    let method = 'post';
    let url = '/v1/account/metrics/query';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Return SAS credentials for querying avaiable devices -> singaling servers

  @param Object payload of request
  */
  getSasForDeviceSignaling(payload: GetSasForDeviceSignalingInput): Promise<GetSasForDeviceSignalingOutput> {
    let method = 'post';
    let url = '/v1/account/sas_signaling_devices';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  List all registered clients

  @param Object payload of request
  */
  listClients(payload: ListClientsInput): Promise<ListClientsOutput> {
    let method = 'post';
    let url = '/v1/account/list_clients';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Deliver a message to a device

  @param Object payload of request
  */
  postMessage(payload: PostMessageInput): Promise<PostMessageOutput> {
    let method = 'post';
    let url = '/v1/account/post_message';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Revoke a client

  @param Object payload of request
  */
  revokeClient(payload: RevokeClientInput): Promise<RevokeClientOutput> {
    let method = 'post';
    let url = '/v1/account/revoke_client';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Set the userAgent for a client

  @param Object payload of request
  */
  setClientUserAgent(payload: SetClientUserAgentInput): Promise<SetClientUserAgentOutput> {
    let method = 'post';
    let url = '/v1/account/set_client_user_agent';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}
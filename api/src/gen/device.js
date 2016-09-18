/**
 * API calls for devices...
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

export type GetFactoryResetMessageInput = {
};

export type GetFactoryResetMessageOutput = {
 factoryResetMessage: ?string;
};

export type GetSasForSignalingInput = {
};

export type GetSasForSignalingOutput = {
 publicUrl: ?string;
 sas: Array<any>;
 messages: Array<string>;
};

export type CompleteRegistrationInput = {
 registrarPublicKey: string;
 registrationToken: ?string;
};

export type CompleteRegistrationOutput = {
 success: bool;
 accountDeviceNumber: ?number;
 beaconUUID: ?string;
};

export type UnregisterInput = {
 factoryResetMessage: string;
};

export type UnregisterOutput = {
 success: bool;
};

export type AcknowledgeMessageInput = {
};

export type AcknowledgeMessageOutput = {
};

export default class Device extends BaseClass {

  name: string = 'api-device';
  prefix: string = '/v1/device/';

  
  /**
  Get socket.io url for device...

  @param Object payload of request
  */
  socketioURL(payload: SocketioUrlInput): Promise<SocketioUrlOutput> {
    let method = 'post';
    let url = '/v1/device/socketio/url';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  

  @param Object payload of request
  */
  writeMetrics(payload: WriteMetricsInput): Promise<WriteMetricsOutput> {
    let method = 'post';
    let url = '/v1/device/metrics/point';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Return a factory reset message for this device if it was unregistered

  @param Object payload of request
  */
  getFactoryResetMessage(payload: GetFactoryResetMessageInput): Promise<GetFactoryResetMessageOutput> {
    let method = 'post';
    let url = '/v1/device/factory_reset_message';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Return SAS credentials for querying available signaling servers

  @param Object payload of request
  */
  getSasForSignaling(payload: GetSasForSignalingInput): Promise<GetSasForSignalingOutput> {
    let method = 'post';
    let url = '/v1/device/sas_signaling_servers';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Complete registration of the deivce

  @param Object payload of request
  */
  completeRegistration(payload: CompleteRegistrationInput): Promise<CompleteRegistrationOutput> {
    let method = 'post';
    let url = '/v1/device/complete_registration';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Remove this device from the account

  @param Object payload of request
  */
  unregister(payload: UnregisterInput): Promise<UnregisterOutput> {
    let method = 'post';
    let url = '/v1/device/unregister';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Acknowledge processing the oldest message

  @param Object payload of request
  */
  acknowledgeMessage(payload: AcknowledgeMessageInput): Promise<AcknowledgeMessageOutput> {
    let method = 'post';
    let url = '/v1/device/message_ack';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}
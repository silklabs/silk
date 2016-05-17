/**
 * Metadata reading methods...
 *
 * @flow
 */

import BaseClass from '../http_client';

export type FindOneNearInput = {
 deviceId: string;
 metaType: string;
 time: number;
 strict: ?bool;
};

export type FindOneNearOutput = {
};

export type FindAllInTimeIntervalInput = {
 deviceId: ?string;
 deviceIds: ?Array<string>;
 metaType: string;
 startTime: number;
 endTime: number;
 maxCount: number;
};

export type FindAllInTimeIntervalOutput = {
};

export type FindOneAfterTimeInput = {
 deviceId: string;
 metaType: string;
 time: number;
};

export type FindOneAfterTimeOutput = {
};

export type FindAllBeforeTimeInput = {
 deviceId: ?string;
 deviceIds: ?Array<string>;
 metaType: string;
 time: number;
 maxCount: number;
};

export type FindAllBeforeTimeOutput = {
};

export default class Metadata extends BaseClass {

  name: string = 'api-metadata';
  prefix: string = '/v1/metadata/';

  
  /**
  Find metadata id

  @param Object payload of request
  */
  findOneNear(payload: FindOneNearInput): Promise<FindOneNearOutput> {
    let method = 'post';
    let url = '/v1/metadata/find/near';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Find all metadata entries in a particular time interval

  @param Object payload of request
  */
  findAllInTimeInterval(payload: FindAllInTimeIntervalInput): Promise<FindAllInTimeIntervalOutput> {
    let method = 'post';
    let url = '/v1/metadata/findall/interval';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Find one metadata entry after given time

  @param Object payload of request
  */
  findOneAfterTime(payload: FindOneAfterTimeInput): Promise<FindOneAfterTimeOutput> {
    let method = 'post';
    let url = '/v1/metadata/find/aftertime';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  Find all metadata entries in a before a particular time

  @param Object payload of request
  */
  findAllBeforeTime(payload: FindAllBeforeTimeInput): Promise<FindAllBeforeTimeOutput> {
    let method = 'post';
    let url = '/v1/metadata/findall/beforetime';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}
/**
 * Test routes for validating security features.
 *
 * @flow
 */

import BaseClass from '../http_client';

export type APostInput = {
};

export type APutInput = {
};

export type BPutInput = {
};

export type RetryMeInput = {
};

export default class Test extends BaseClass {

  name: string = 'api-test';
  prefix: string = '/v1/test/';

  
  /**
  

  @param Object payload of request
  */
  aPost(payload: APostInput): any {
    let method = 'post';
    let url = '/v1/test/a';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  

  @param Object payload of request
  */
  aPut(payload: APutInput): any {
    let method = 'put';
    let url = '/v1/test/a';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  

  @param Object payload of request
  */
  bPut(payload: BPutInput): any {
    let method = 'put';
    let url = '/v1/test/b';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }

  /**
  

  @param Object payload of request
  */
  retryMe(payload: RetryMeInput): any {
    let method = 'post';
    let url = '/v1/test/test';
    // Perform url subtitutions:

    return this._apiRequestWithBody(method, url, payload);
  }
}
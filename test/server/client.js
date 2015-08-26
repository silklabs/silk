import fetch from 'node-fetch';
import URL from 'url';

export default class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async requestWithBody(method, url, body) {
    body = JSON.stringify(body);

    let headers = {
      'content-type': 'application/json'
    };

    let res = await fetch(URL.resolve(this.baseUrl, url), {
      method,
      body: body,
      headers: headers
    });

    let json = await res.json()
    return { status: res.status, body: json };
  }

  async request(method, url) {
    let res = await fetch(URL.resolve(this.baseUrl, url), { method });
    let json = await res.json()
    return { status: res.status, body: json };
  }
}

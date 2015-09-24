import http from 'http';
import URL from 'url';

export default function(url, method = 'POST') {
  let params = URL.parse(url);
  params.method = method;
  return http.request(params);
}

import bodyParser from 'body-parser';
import crypto from 'crypto';
import createLog from 'log';

const log = createLog('travis-webhook-middleware');

export default function(options) {
  return bodyParser.urlencoded({
    type: 'application/x-www-form-urlencoded',
    verify: function(req, res, buffer) {
      let slug = req.headers['travis-repo-slug'];
      log.debug('Travis-Repo-Slug header:', slug);
      if (!slug) {
        throw new Error('No Travis-Repo-Slug header found on request!');
      }

      let userToken = options.getUserToken(slug);
      log.debug('User token:', userToken);
      if (!userToken) {
        throw new Error(`No user token known for ${slug}!`);
      }

      let authHeader = req.headers.authorization;
      log.debug('Authorization header:', authHeader);
      if (!authHeader) {
        throw new Error('No Authorization header found on request!');
      }

      let hash = crypto.createHash('sha256')
        .update(slug + userToken)
        .digest('hex');
      log.debug('Expect Authorization header to be:', hash);
      if (hash !== authHeader) {
        throw new Error('Authorization header does not match!');
      }
    },
  });
}

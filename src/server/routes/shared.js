import * as Joi from 'joi';
import URL from 'url';
import path from 'path';

/**
 * Helper for routes shared between accounts and devices...
 */
export default function(api, type, ctx) {
  // Semi-nasty hack so we don't need to run this in autogenerate.
  if (!api || !api.define) return;

  /**
   * The base socket.io url must be annotated with some special details in particular:
   *
   *  - encode websocket transport
   *  - encode type of connection (deivce/account)
   *
   * This ensures that the socket.io server has enough information to authenticate.
   */
  let url;
  function getUrl() {
    if (url) {
      return url;
    }
    let parsed = URL.parse(ctx.config.socketio.publicUrl, true);
    parsed.pathname = path.join(parsed.pathname, './');
    delete parsed.search;

    let query = parsed.query || {};
    query.type = type;
    query.EIO = 3;
    query.transport = 'websocket';
    parsed.query = query;

    url = URL.format(parsed);
    return url;
  }

  api.define({
    path: 'socketio/url',
    method: 'post',
    params: [],
    name: 'socketioURL',
    description: 'Get socket.io url for device...',
    output: Joi.object().keys({
      url: Joi.string().required()
    }),
    input: Joi.object()
  }, async (req, res) => {
    res.respond({
      url: getUrl()
    });
  });
}

import * as Joi from 'joi';

/**
 * Helper for routes shared between accounts and devices...
 */
export default function(api, ctx) {
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
      url: ctx.config.socketio.publicUrl
    });
  });
}

/* @flow */
import { SES } from 'aws-sdk-promise';
import { readdirSync } from 'fs';
import path from 'path';
import * as Joi from 'joi';

let log = require('log')('email-sender');

const TEMPLATE_SRC = path.join(__dirname, 'emails');
const ASSET_SRC = path.join(__dirname, '../../assets/emails/');

const ALLOWED_TEMPLATES = new Set(readdirSync(ASSET_SRC).map(v => {
  return v.split('.').shift();
}));

const SEND_INPUT = Joi.object().keys({
  // Subject text:
  subject: Joi.string().min(1).required(),
  // Who to send email to:
  recipient: Joi.string().email().required(),
  // The body of the email itself (html/text are both required)
  body: Joi.object().keys({
    txt: Joi.string().required(),
    html: Joi.string().required(),
  }),
});

export type PasswordResetInput = {
  email: string;
  url: string;
};

export default class EmailSender {
  // Cache of all the templates loaded...
  _templates: any = {};
  sourceEmail: string;
  ses: any;

  constructor(config: any) {
    // Who is on the "from" label in emails...
    this.sourceEmail = config.emails.sender;
    this.ses = new SES({
      region: config.ses.region
    });
  }

  /**
   * Load and render templates for an email.
   *
   * Note: Never use untrusted input for name of email template!
   *
   * @param {String} name of email template.
   * @param {Object} context to use in template.
   * @param {Array} types of email templates to load.
   */
  renderTemplate(name: string, context: any = {}, types: Array<string> = ['html', 'txt']): any {
    if (!ALLOWED_TEMPLATES.has(name)) {
      throw new Error(`Attempted to use invalid email template: ${name}`);
    }

    let result = {};
    for (let type of types) {
      let modulePath = path.join(TEMPLATE_SRC, `${name}.${type}.js`);
      let module = this._templates[modulePath] || require(modulePath);
      this._templates[modulePath] = module;
      log.info('render', modulePath);
      result[type] = module.render(context);
    }
    return result;
  }

  async resetPassword(options: PasswordResetInput): Promise<any> {
    return await this.send({
      subject: 'Reset password',
      recipient: options.email,
      body: this.renderTemplate('reset_password', {
        resetPasswordUrl: options.url
      })
    });
  }

  /**
   * Send an email over SES
   *
   *    await emailSender.send({
   *      subject: 'who likes emails',
   *      recipient: 'user@example.com',
   *      body: emailSender.renderTemplate('tpl', context)
   *    });
   *
   * @param {Object} options for email to be sent.
   */
  async send(options: any): any {
    Joi.assert(options, SEND_INPUT);
    let send = this.ses.sendEmail({
      // Note: we pay per destination so more destinations here does not make
      // anything cheaper
      Destination: {
        ToAddresses: [options.recipient]
      },
      Source: this.sourceEmail,
      Message: {
        // Yay: we don't need to mess with MIME
        Body: {
          Html: {
            Data: options.body.html
          },
          Text: {
            Data: options.body.txt
          }
        },
        Subject: {
          Data: options.subject
        }
      }
    });

    return await send.promise();
  }

}

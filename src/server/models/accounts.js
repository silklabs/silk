/**
 * User account store.
*/
import * as Joi from 'joi';
import Base from './base';
import scrypt from 'scrypt';

const EMAIL = Joi.string().trim().email().lowercase().required();
const passwordHash = Joi.string().required().min(64).max(256);

/**
 * The time in MS which a password check is valid.
 */
const AUTHENTICATED_DURATION = 60 * 1000 * 15;

export default class Accounts extends Base {
  static AUTHENTICATED_DURATION = AUTHENTICATED_DURATION

  static ERROR = {
    duplicateEmail: 'DuplicateEmail',
    checkPasswordFailure: 'CheckPasswordFailure'
  }

  static SCHEMA = {
    findByPublicKey: Joi.object().keys({
      publicKey: Joi.string().hex().required().min(32)
    }),

    create: Joi.object().keys({
      email: EMAIL,
      passwordHash: passwordHash,
      publicKey: Joi.string().required(),
      userAgent: Joi.string().required()
    }).required(),

    checkPassword: Joi.object().keys({
      publicKey: Joi.string().required(),
      email: EMAIL,
      passwordHash: passwordHash
    }),

    /**
     * This is the canonical representation of accounts in our datastore it is
     * designed so it can be updated atomically as a single record.
     */
    record: Joi.object().keys({
      email: Joi.string().email().required(),

      password: Joi.object().keys({
        // Date when the password was set/created.
        date: Joi.date().required(),
        // scrypt hash this includes things like iterations/etc...
        hash: Joi.string().hex().required(),
      }).required(),

      /**
       * Individual account tokens that are used to talk to our API servers an
       * account many have many of these with varying scopes.
       */
      accountTokens: Joi.array().items(Joi.object().keys({
        // List of scopes (like OAuth2) reserved for future use.
        scopes: Joi.array().items(Joi.string().max(255)),

        // ed25519 public key as string...
        publicKey: Joi.string().hex().required(),

        // When this key was issued...
        issued: Joi.date().required(),

        // When this key should expire (if ever).
        expires: Joi.date().required(),

        // Information about who issued the public key
        userAgent: Joi.string(),

        /**
         * When this key was last authenticated against a password.
         *
         * A user should be re-authenticated for special operations such as
         * changing the password/email/etc...
         */
        passwordCheck: Joi.object({
          date: Joi.date()
        }).required(),

        /**
         * Details about pending or current identification of this key. This
         * should generally be something like sms / remote notification / etc..
         *
         * (Not required)
         */
        identified: Joi.object({
          // Identification method.
          method: Joi.string().valid(['sms']),
          // Token to use in identification (typically JWT but may be anything)
          token: Joi.string().required(),
          // If this identification has happened.
          validated: Joi.boolean().required(),
          // When the token associated with this method expires.
          expires: Joi.date().required()
        })

      })).required()

    }).required()
  }

  get collectionName() {
    return 'accounts';
  }

  scryptHash(value) {
    // These values are taken from http://www.tarsnap.com/scrypt/scrypt-slides.pdf
    // from 2009 we can and likely should tune these values.
    // Also see: http://tools.ietf.org/html/draft-josefsson-scrypt-kdf-01#section-5
    let params = {
      N: 2 ^ 14,
      r: 8,
      p: 1
    };

    return scrypt.hash(new Buffer(value), params).toString('hex');
  }

  scryptVerify(hash, key) {
    return scrypt.verify(new Buffer(hash, 'hex'), new Buffer(key));
  }

  /**
   * Find an account by its mongodb id.
   */
  async findByPublicKey(payload) {
    payload = this.validate(payload, 'findByPublicKey');
    let { publicKey } = payload;

    return await this.collection.findOne({
      'accountTokens.publicKey': publicKey
    });
  }

  /**
   * Create an initial account this in no way grants the user permissions but
   * allows them to use their public/private key pair to make further requests
   * to authenticate their account.
   */
  async create(payload) {
    payload = this.validate(payload, 'create');
    let password = this.scryptHash(payload.passwordHash);

    let account = this.validate({
      email: payload.email,
      password: {
        date: new Date(),
        hash: password
      },
      accountTokens: [{
        issued: new Date(),
        // Keys will not normally expire unless we have some sort of security
        // event.
        expires: new Date(3000),
        scopes: [],
        passwordCheck: {},
        publicKey: payload.publicKey,
        userAgent: payload.userAgent
      }]
    }, 'record');

    // Insert the document but do not override any other accounts with the same
    // email address!
    let insert = await this.collection.update(
      {
        $or: [
          { email: payload.email },
          { 'accountTokens.publicKey': payload.publicKey }
        ]
      },
      { $setOnInsert: account },
      { upsert: true }
    );

    let didInsert = insert.upserted;
    if (didInsert && didInsert[0]._id) {
      return { id: didInsert[0]._id.toString() };
    }

    return this.error('duplicateEmail');
  }

  /**
   * Check the users password this is run in cases where the accessToken has not
   * been checked against the users password in some time and we want to perform
   * a sensitive operation.
   */
  async checkPassword(payload) {
    payload = this.validate(payload, 'checkPassword');

    let account = await this.collection.findOne({
      email: payload.email,
      'accountTokens.publicKey': payload.publicKey
    });

    if (!account) {
      return this.error('checkPasswordFailure');
    }

    let validate = this.scryptVerify(account.password.hash, payload.passwordHash);
    if (validate) {
      let update = await this.collection.update({
        _id: account._id,
        'accountTokens.publicKey': payload.publicKey
      }, {
        passwordCheck: { date: new Date() }
      });

      if (update.n !== 1) {
        throw new Error(
          `checkPassword update failed for unknown reasons: ${
            JSON.stringify(update)
          }`
        );
      }

      return { id: account._id.toString() };
    }

    return this.error('checkPasswordFailure');
  }
}


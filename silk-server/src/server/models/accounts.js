/**
 * User account store.
*/
import * as Joi from 'joi';
import Base from './base';
import scrypt from 'scrypt';
import uuid from 'uuid';

const EMAIL = Joi.string().trim().email().lowercase().required();
const PASSWORD_HASH = Joi.string().required().min(64).max(256);

/**
 * Any operation which adds an accessToken will require these details...
 */
const ACCESS_TOKEN_ADD_SCHEMA = Joi.object().keys({
  email: EMAIL,
  passwordHash: PASSWORD_HASH,
  publicKey: Joi.string().required(),
  userAgent: Joi.string().required()
}).required();

const ACCESS_TOKEN_SCHEMA = Joi.object().keys({
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
});

const log = require('log')('models:accounts');

/**
 * The time in MS which a password check is valid.
 */
const AUTHENTICATED_DURATION = 60 * 1000 * 15;

export default class Accounts extends Base {
  static AUTHENTICATED_DURATION = AUTHENTICATED_DURATION

  static ERROR = {
    duplicateEmail: 'DuplicateEmail',
    checkPasswordFailure: 'CheckPasswordFailure',
    unknownAccount: 'UnknownAccount'
  }

  static INDEX = [
    /**
     * Public key must be unique...
     */
    {
      props: {
        'accountTokens.publicKey': 1
      },
      options: { unique: true }
    },

    /**
     * Email must be unique...
     */
    {
      props: {
        email: 1
      },
      options: { unique: true }
    },

    /**
     * Beacon uuid must be unique...
     */
    {
      props: {
        beaconUUID: 1
      },
      options: { unique: true, sparse: true }
    }
  ]

  static SCHEMA = {
    findByPublicKey: Joi.object().keys({
      publicKey: Joi.string().hex().required().min(32)
    }),

    ensureDevAccount: Joi.object().keys({
      email: EMAIL,
      passwordHash: PASSWORD_HASH,
      publicKey: Joi.string().hex().required(),
    }).unknown(true).required(),

    create: ACCESS_TOKEN_ADD_SCHEMA,

    signIn: ACCESS_TOKEN_ADD_SCHEMA,

    checkPassword: Joi.object().keys({
      publicKey: Joi.string().required(),
      email: EMAIL,
      passwordHash: PASSWORD_HASH
    }),

    accessToken: ACCESS_TOKEN_SCHEMA,

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

      // Unique beacon id per account...
      beaconUUID: Joi.string().guid().required(),

      /**
       * Individual account tokens that are used to talk to our API servers an
       * account many have many of these with varying scopes.
       */
      accountTokens: Joi.array().items(ACCESS_TOKEN_SCHEMA).required()

    }).required()
  }

  static COLLECTION = 'accounts';

  async scryptHash(value) {
    // These values are taken from http://www.tarsnap.com/scrypt/scrypt-slides.pdf
    // from 2009 we can and likely should tune these values.
    // Also see: http://tools.ietf.org/html/draft-josefsson-scrypt-kdf-01#section-5
    let params = {
      N: 2 ^ 14,
      r: 8,
      p: 1
    };

    let hash = await scrypt.kdf(new Buffer(value), params);
    return hash.toString('hex');
  }

  async scryptVerify(hash, key) {
    return await scrypt.verifyKdf(new Buffer(hash, 'hex'), new Buffer(key));
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
   * Common access token generation stuff.
   */
  accessToken(payload) {
    let { publicKey, userAgent } = payload;
    return this.validate({
      issued: new Date(),
      // Keys will not normally expire unless we have some sort of security
      // event.
      expires: new Date(3000, 1),
      scopes: [],
      passwordCheck: {},
      publicKey: publicKey,
      userAgent: userAgent
    }, 'accessToken');
  }

  /**
   * Set beacon UUID if it is missing from the account.
   */
  async setBeaconUUIDIfMissing(publicKey) {
    let id = uuid.v4();
    let status = await this.collection.update(
      {
        'accountTokens.publicKey': publicKey,
        'beaconUUID': {
          $exists: false
        }
      },
      {
        $set: {
          'beaconUUID': id
        }
      }
    );

    if (status.nModified === 1) {
      return id;
    }
    return false;
  }

  /**
   * Create an initial account this in no way grants the user permissions but
   * allows them to use their public/private key pair to make further requests
   * to authenticate their account.
   */
  async create(payload) {
    payload = this.validate(payload, 'create');
    let password = await this.scryptHash(payload.passwordHash);

    let account = this.validate({
      email: payload.email,
      password: {
        date: new Date(),
        hash: password
      },
      accountTokens: [this.accessToken(payload)],
      beaconUUID: uuid.v4(),
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

  async ensureDevAccount(payload) {
    payload = this.validate(payload, 'ensureDevAccount');
    let { email, passwordHash, publicKey } = payload;

    // We don't care if there is a duplicate or not...
    let create = await this.create({
      userAgent: 'developer account',
      email,
      passwordHash,
      publicKey,
    });

    if (create.id) {
      log.info('Created developer account', email);
    } else {
      log.info('Developer account probably exists already', email, create);
    }
  }

  async signIn(payload) {
    payload = this.validate(payload, 'signIn');

    let account = await this.collection.findOne({
      email: payload.email
    });

    if (!account) {
      return this.error('unknownAccount');
    }

    let validate = await this.scryptVerify(account.password.hash, payload.passwordHash);
    if (validate) {
      let accessToken = this.accessToken(payload);

      /**
       * We need to take some extra steps... While multiple accounts are
       * enforced not to have duplicate publicKeys at the collection level those
       * protections do not work within a single document.
       */
      let update = await this.collection.update(
        {
          _id: account._id,
          'accountTokens.publicKey': {
            $ne: payload.publicKey
          }
        },
        {
          $push: {
            accountTokens: accessToken
          }
        }
      );

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

    let validate = await this.scryptVerify(account.password.hash, payload.passwordHash);
    if (validate) {
      let update = await this.collection.update({
        _id: account._id,
        'accountTokens.publicKey': payload.publicKey
      }, {
        $set: {
          passwordCheck: { date: new Date() }
        }
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

/* @flow */
/**
 * User account store.
 */
import * as Joi from 'joi';
import Base from './base';
import scrypt from 'scrypt';
import uuid from 'uuid';
import AccessToken from '../../api/id';

/**
 * Password reset expires in 4 hours...
 */
const PASSWORD_RESET_EXPIRES_MS = (1000 * 60 * 60) * 4;

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

type PasswordResetInput = {
  email: string;
}

export type PasswordResetResult = {
  token: string;
  expires: number;
}

type UsePasswordResetTokenInput = {
  email: string;
  token: string;
}

export type UsePasswordResetTokenOutput = {
  success: boolean;
}

export default class Accounts extends Base {
  static AUTHENTICATED_DURATION = AUTHENTICATED_DURATION;

  static ERROR = {
    duplicateEmail: 'DuplicateEmail',
    checkPasswordFailure: 'CheckPasswordFailure',
    unknownAccount: 'UnknownAccount',
    resetPasswordFailure: 'ResetPasswordFailure',
    resetPasswordTokenMismatch: 'ResetPasswordTokenMismatch',
  };

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
  ];

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

    }).required(),

    resetPassword: Joi.object().keys({
      email: EMAIL,
    }).required(),

    usePasswordResetToken: Joi.object().keys({
      email: EMAIL,
      token: Joi.string().hex().required(),
      passwordHash: PASSWORD_HASH,
    }).required(),
  };

  static COLLECTION = 'accounts';

  async scryptHash(value: string): Promise<string> {
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

  async scryptVerify(hash: string, key: string): Promise<bool> {
    return await scrypt.verifyKdf(new Buffer(hash, 'hex'), new Buffer(key));
  }

  /**
   * Find an account by its mongodb id.
   */
  async findByPublicKey(payload: any): any {
    payload = this.validate(payload, 'findByPublicKey');
    let { publicKey } = payload;

    return await this.collection.findOne({
      'accountTokens.publicKey': publicKey
    });
  }

  /**
   * Common access token generation stuff.
   */
  accessToken(payload: any): any {
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
  async setBeaconUUIDIfMissing(publicKey: any): any {
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
    return null;
  }

  /**
   * Create an initial account this in no way grants the user permissions but
   * allows them to use their public/private key pair to make further requests
   * to authenticate their account.
   */
  async create(payload: any): any {
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
      return {
        id: didInsert[0]._id.toString(),
        beaconUUID: account.beaconUUID,
      };
    }

    return this.error('duplicateEmail');
  }

  async ensureDevAccount(payload: any): any {
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

  async signIn(payload: any): any {
    payload = this.validate(payload, 'signIn');

    let account = await this.collection.findOne({
      email: payload.email
    });

    if (!account) {
      return this.error('unknownAccount');
    }

    let validate = await this.scryptVerify(account.password.hash, payload.passwordHash);
    if (!validate) {
      return this.error('checkPasswordFailure');
    }

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
        `signIn update failed for unknown reasons: ${
            JSON.stringify(update)
          }`
      );
    }
    return {
      id: account._id.toString(),
      beaconUUID: account.beaconUUID,
    };
  }

  /**
   * Check the users password this is run in cases where the accessToken has not
   * been checked against the users password in some time and we want to perform
   * a sensitive operation.
   */
  async checkPassword(payload: any): any {
    payload = this.validate(payload, 'checkPassword');

    let account = await this.collection.findOne({
      email: payload.email,
      'accountTokens.publicKey': payload.publicKey
    });

    if (!account) {
      return this.error('checkPasswordFailure');
    }

    let validate = await this.scryptVerify(account.password.hash, payload.passwordHash);
    if (!validate) {
      return this.error('checkPasswordFailure');
    }

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

  /**
   * NOTE: This current impl is only suitable for development and early production....
   * TODO: Security questions silk-server#401
   */
  async resetPassword(
    payload: PasswordResetInput
  ): Promise<PasswordResetResult|Object> {
    payload = this.validate(payload, 'resetPassword');

    // Noted a few times but again this is sketchy effectively anyone can just
    // request a "reset" password for a range of known email addresses costing
    // us time and money...
    let account = await this.collection.findOne({
      email: payload.email,
    });

    if (!account) {
      return this.error('resetPasswordFailure');
    }

    if (account.passwordReset) {
      let previousExpires =
        account.passwordReset.created.valueOf() + PASSWORD_RESET_EXPIRES_MS;

      let {pub, priv} = account.passwordReset.accessToken;

      if (previousExpires > Date.now()) {
        return {
          token: new AccessToken(pub, priv).sign(account.passwordReset.secret),
          expires: previousExpires,
        };
      }
    }

    /**
     * Tokens are ed25519 signed uuids this makes it very very difficult for
     * an attacker to guess or craft the token.
     */
    let accessToken = AccessToken.create();
    let secret = uuid.v4();

    let created = new Date();
    let expires = created.valueOf() + PASSWORD_RESET_EXPIRES_MS;

    let update = await this.collection.update(
      { _id: account._id },
      {
        $set: {
          passwordReset: {
            secret: secret,
            accessToken: {
              pub: accessToken.pub,
              priv: accessToken.priv,
            },
            created
          }
        }
      }
    );

    if (update.n !== 1) {
      throw new Error(`Unexpected error updating account ${account._id}`);
    }

    return {
      token: accessToken.sign(secret),
      expires
    };
  }

  async usePasswordResetToken(
    payload: UsePasswordResetTokenInput
  ): Promise<UsePasswordResetTokenOutput|Object> {
    payload = this.validate(payload, 'usePasswordResetToken');

    let account = await this.collection.findOne({
      email: payload.email
    });

    if (!account) {
      return this.error('resetPasswordFailure');
    }

    let {passwordReset} = account;
    if (!passwordReset) {
      return this.error('resetPasswordFailure');
    }

    let {pub, priv} = passwordReset.accessToken;
    let accessToken = new AccessToken(pub, priv);

    if (!accessToken.verify(passwordReset.secret, payload.token)) {
      return this.error('resetPasswordTokenMismatch');
    }

    let password = await this.scryptHash(payload.passwordHash);

    let update = await this.collection.update(
      { _id: account._id },
      {
        // Tokens should only be used once to prevent abuses!
        $unset: { passwordReset: '' },
        $set: {
          password: {
            date: new Date(),
            hash: password,
          }
        }
      }
    );

    if (update.n !== 1) {
      throw new Error(`Unexpected error updating account ${account._id}`);
    }

    return { success: true };
  }
}

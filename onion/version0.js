/**
 * Version 0 of the Silk Onion format, using msgpack and ed25519 signatures.
 *
 * @flow
 */

import invariant from 'assert';
import * as Joi from 'joi';
import msgpack from 'msgpack-lite';
import {AccessToken} from 'silk-api';
import * as silkCrypto from 'silk-crypto';

import type {
  EncodeArgsInternal,
  DecodeArgsInternal,
  ReceivedMessageInternal,
} from './args';

/**
 * The payload (T) is wrapped in a SilkOnionPayload that indicates the
 * intended recipient of the payload and which channel this payload is
 * meant to be sent and received over (e.g. HTTP API, BLE, WebRTC,
 * etc.)
 */
type SignedMessage<T> = {
  /**
   * Recipient verifying key.
   */
  r?: Buffer;

  /**
   * Channel.
   */
  c: string;

  /**
   * The message payload we're intending to send.
   */
  p: T;
};

const SignedMessageSchema = Joi.object().keys({
  r: Joi.binary().length(silkCrypto.ED25519_KEY_BYTES).optional(),
  c: Joi.string().required(),
  p: Joi.any().required(),
}).unknown(false).required();

/**
 * Outer layer that contains the message, signature, and sender identity.
 */
type Onion = {
  /**
   * Sender verifying key.
   */
  i: Buffer;

  /**
   * Signature of serialized SignedMessage.
   */
  s: Buffer;

  /**
   * SignedMessage serialized to a buffer.
   */
  m: Buffer;
};

const OnionSchema = Joi.object().keys({
  i: Joi.binary().length(silkCrypto.ED25519_KEY_BYTES).required(),
  s: Joi.binary().length(silkCrypto.ED25519_SIG_BYTES).required(),
  m: Joi.binary().required(),
}).unknown(false).required();

// API

export function genEncode<T>(args: EncodeArgsInternal<T>): Promise<Buffer> {
  const {senderIdentity, recipientIdentity} = args;

  const message: SignedMessage<T> = {
    c: args.channel,
    p: args.payload,
  };
  if (recipientIdentity) {
    message.r = new Buffer(recipientIdentity.pub, 'hex');
  }
  Joi.assert(message, SignedMessageSchema);

  const msg = msgpack.encode(message);
  return senderIdentity.genSign(msg).then((signatureHex) => {
    const onion: Onion = {
      i: new Buffer(senderIdentity.pub, 'hex'),
      s: new Buffer(signatureHex, 'hex'),
      m: msg,
    };
    Joi.assert(onion, OnionSchema);
    return msgpack.encode(onion);
  });
}

export function genDecodeAndVerify<T>(
  args: DecodeArgsInternal
): Promise<ReceivedMessageInternal<T>> {
  const {input, allowedSenders, allowedChannels, recipientIdentity} = args;

  invariant(Buffer.isBuffer(input));
  const onion = msgpack.decode(input);
  Joi.assert(onion, OnionSchema);

  const senderIdentity = AccessToken.importPub(onion.i.toString('hex'));
  if (allowedSenders) {
    invariant(
      allowedSenders.map(id => id.pub).indexOf(senderIdentity.pub) !== -1,
      `Invalid sender. ${senderIdentity.pub} not in found in {allowedSenders}`
    );
  }

  return senderIdentity.genVerify(onion.m, onion.s.toString('hex'))
    .then((verified) => {
      invariant(verified, 'Invalid signature.');

      const message = msgpack.decode(onion.m);
      Joi.assert(message, SignedMessageSchema);

      invariant(
        allowedChannels.indexOf(message.c) !== -1,
        `Invalid channel type. '${message.c}' not found in ` +
        allowedChannels.toString()
      );

      let recipientVerifyingKeyHex = null;
      if (message.r) {
        recipientVerifyingKeyHex = message.r.toString('hex');
      }

      if (recipientIdentity) {
        invariant(recipientIdentity.pub === recipientVerifyingKeyHex,
          `Invalid recipient. Expected ${recipientIdentity.pub} instead of ` +
          (recipientVerifyingKeyHex || 'no recipient.')
        );
      }

      return {
        senderIdentity,
        recipientIdentity,
        channel: message.c,
        payload: message.p,
      };
    });
}

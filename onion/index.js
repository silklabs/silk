/**
 *
 * "Some highborn fools call you Onion Knight and think they insult you.
 *  So you take the onion for your sigil, sew it on your coat, fly the
 *  onion flag."
 *
 *
 * This package provides a mechanism for a sender to send a signed
 * message payload to a recipient, and for that recipient to verify
 * that signature, the intended recipient, and the communication
 * channel.
 *
 * An encoded message consists of the version number followed by the
 * encoded onion, e.g.:
 *
 *  00 <encoded onion in binary format>
 *
 * How the message payload, signature, and sender identity are encoded
 * is up to the specific version implementation.
 *
 * @flow
 */

import invariant from 'assert';
import * as current from './version0';

import type {
  EncodeArgsForKnownParties,
  EncodeForUnknownRecipientArgs,
  DecodeArgsForKnownParties,
  DecodeArgsForUnknownSender,
  DecodeArgsForUnknownRecipient,
  DecodeArgsForUnknownParties,
  ReceivedMessageForKnownRecipient,
  ReceivedMessageForUnknownRecipient,
  EncodeArgsInternal,
  DecodeArgsInternal,
  ReceivedMessageInternal,
} from './args';

const CURRENT_VERSION = 0;

export function genEncode<T>(
  args: EncodeArgsForKnownParties<T>
): Promise<Buffer> {
  const {senderIdentity, recipientIdentity, channel, payload} = args;
  return genEncodeCurrentVersion(
    {senderIdentity, recipientIdentity, channel, payload}
  );
}

export function genEncodeForUnknownRecipient<T>(
  args: EncodeForUnknownRecipientArgs<T>
): Promise<Buffer> {
  return genEncodeCurrentVersion(args);
}

export function genDecodeAndVerify<T>(
  args: DecodeArgsForKnownParties
): Promise<ReceivedMessageForKnownRecipient<T>> {
  const {input, allowedChannels, allowedSenders, recipientIdentity} = args;
  return genDecodeAndVerifyCurrentVersion(
    {input, allowedChannels, allowedSenders, recipientIdentity}
  ).then((message) => {
    const {channel, recipientIdentity, senderIdentity, payload} = message;
    invariant(recipientIdentity);
    return {channel, recipientIdentity, senderIdentity, payload};
  });
}

export function genDecodeAndVerifyForUnknownSender<T>(
  args: DecodeArgsForUnknownSender
): Promise<ReceivedMessageForKnownRecipient<T>> {
  const {input, allowedChannels, allowedSenders, recipientIdentity} = args;
  return genDecodeAndVerifyCurrentVersion(
    {input, allowedChannels, allowedSenders, recipientIdentity}
  ).then((message) => {
    const {channel, recipientIdentity, senderIdentity, payload} = message;
    invariant(recipientIdentity);
    return {channel, recipientIdentity, senderIdentity, payload};
  });
}

export function genDecodeAndVerifyForUnknownRecipient<T>(
  args: DecodeArgsForUnknownRecipient
): Promise<ReceivedMessageForUnknownRecipient<T>> {
  const {input, allowedChannels, allowedSenders, recipientIdentity} = args;
  return genDecodeAndVerifyCurrentVersion(
    {input, allowedChannels, allowedSenders, recipientIdentity}
  ).then((message) => {
    const {channel, senderIdentity, payload} = message;
    return {channel, senderIdentity, payload};
  });
}

export function genDecodeAndVerifyForUnknownParties<T>(
  args: DecodeArgsForUnknownParties
): Promise<ReceivedMessageForUnknownRecipient<T>> {
  return genDecodeAndVerifyCurrentVersion(args).then((message) => {
    const {channel, senderIdentity, payload} = message;
    return {channel, senderIdentity, payload};
  });
}

// Helpers:

function genEncodeCurrentVersion<T>(
  args: EncodeArgsInternal<T>
): Promise<Buffer> {
  return current.genEncode(args).then((onion) => {
    return Buffer.concat(
      [new Buffer([CURRENT_VERSION]), onion],
      onion.length + 1
    );
  });
}

function genDecodeAndVerifyCurrentVersion<T>(
  args: DecodeArgsInternal
): Promise<ReceivedMessageInternal<T>> {
  invariant(args.input.length >= 1);
  invariant(args.input[0] === CURRENT_VERSION);
  return current.genDecodeAndVerify({
    ...args,
    input: args.input.slice(1),
  });
}

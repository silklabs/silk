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
  EncodeArgs,
  EncodeForUnknownRecipientArgs,
  DecodeArgs,
  DecodeArgsForUnknownRecipient,
  DecodeArgsForUnknownParties,
  ReceivedMessage,
} from './args';

const CURRENT_VERSION = 0;

export function genEncode<T>(args: EncodeArgs<T>): Promise<Buffer> {
  const {senderIdentity, recipientIdentity, channel, payload} = args;
  return genEncodeForUnknownRecipient(
    {senderIdentity, recipientIdentity, channel, payload}
  );
}

export function genEncodeForUnknownRecipient<T>(
  args: EncodeForUnknownRecipientArgs<T>
): Promise<Buffer> {
  return current.genEncodeForUnknownRecipient(args).then((onion) => {
    return Buffer.concat(
      [new Buffer([CURRENT_VERSION]), onion],
      onion.length + 1
    );
  });
}

export function genDecodeAndVerify<T>(
  args: DecodeArgs
): Promise<ReceivedMessage<T>> {
  const {input, allowedChannels, allowedSenders, recipientIdentity} = args;
  return genDecodeAndVerifyForUnknownParties(
    {input, allowedChannels, allowedSenders, recipientIdentity}
  );
}

export function genDecodeAndVerifyForUnknownRecipient<T>(
  args: DecodeArgsForUnknownRecipient
): Promise<ReceivedMessage<T>> {
  const {input, allowedChannels, allowedSenders, recipientIdentity} = args;
  return genDecodeAndVerifyForUnknownParties(
    {input, allowedChannels, allowedSenders, recipientIdentity}
  );
}

export function genDecodeAndVerifyForUnknownParties<T>(
  args: DecodeArgsForUnknownParties
): Promise<ReceivedMessage<T>> {
  invariant(args.input.length >= 1);
  invariant(args.input[0] === CURRENT_VERSION);
  return current.genDecodeAndVerifyForUnknownParties({
    ...args,
    input: args.input.slice(1),
  });
}

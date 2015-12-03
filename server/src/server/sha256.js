import crypto from 'crypto';
export default function (buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

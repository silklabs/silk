import { S3 } from 'aws-sdk-promise';
import uuid from 'uuid';

class S3Blobs {
  constructor(bucket, s3) {
    this.s3 = s3;
    this.bucket = bucket;
  }

  async sign(key, contentType) {
    key = key || uuid.v4();
    return this.s3.getSignedUrl('putObject', {
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType
    });
  }
}

export default async function(config) {
  let s3 = new S3(config.blobs.s3);
  return new S3Blobs(config.blobs.s3.bucket, s3);
}

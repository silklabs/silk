/* @flow */
type GetObjectParams = {
  Bucket: string;
  Key: string;
  Expires: ?number;
}

type PutObjectParams = {
  Bucket: string;
  Key: string;
  ContentLength: number;
  ContentType: string;
  Expires: ?number;
};

type SignedUrlParams = PutObjectParams | GetObjectParams;

// NOTE: aws-sdk-promise must be ignored in .flowconfig for this to work.
declare module "aws-sdk-promise" {
  declare class Foo {
    bar(): string;
  }

  declare class SES {
  }

  declare class S3 {
    getSignedUrl(operation: string, params: SignedUrlParams): string;
  }
}

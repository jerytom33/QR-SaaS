declare module '@aws-sdk/client-s3' {
  export class S3Client {
    constructor(config?: any);
    send(command: any, options?: any): Promise<any>;
  }
  export class PutObjectCommand { constructor(params?: any); }
  export class GetObjectCommand { constructor(params?: any); }
  export class DeleteObjectCommand { constructor(params?: any); }
  export class ListObjectsV2Command { constructor(params?: any); }
  export class HeadBucketCommand { constructor(params?: any); }
}

declare module '@aws-sdk/s3-request-presigner' {
  export function getSignedUrl(client: any, command: any, options?: any): Promise<string>;
}

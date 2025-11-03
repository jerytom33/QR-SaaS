declare module './s3' {
  export class S3StorageProvider {
    constructor(config: any);
  }
}

declare module './local' {
  export class LocalStorageProvider {
    constructor(config: any);
  }
}

declare module './azure' {
  export class AzureStorageProvider {
    constructor(config: any);
  }
}

declare module './gcs' {
  export class GCSStorageProvider {
    constructor(config: any);
  }
}

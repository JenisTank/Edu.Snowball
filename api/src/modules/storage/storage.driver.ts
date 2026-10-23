import { Logger } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';

/**
 * Storage behind a port, exactly like the payment and messaging adapters.
 *
 * LOCAL keeps files on the API's own volume — right for a single VPS, and the
 * default because it needs no account. S3 talks to any S3-compatible bucket
 * (AWS, Spaces, MinIO) with plain SigV4, so switching is an env change rather
 * than a code change.
 */
export interface StorageDriver {
  readonly name: 'LOCAL' | 'S3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class LocalDriver implements StorageDriver {
  readonly name = 'LOCAL' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  private path(key: string): string {
    const full = resolve(join(this.root, key));
    // Path traversal guard: a key can never escape the storage root.
    if (!full.startsWith(this.root)) throw new Error('Invalid storage key');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.path(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async delete(key: string): Promise<void> {
    const full = this.path(key);
    if (!existsSync(full)) return; // idempotent: deleting twice is not an error
    await unlink(full);
  }

  async exists(key: string): Promise<boolean> {
    return existsSync(this.path(key));
  }

  /** Streaming read for large downloads (not needed for 10 MB caps, but free). */
  stream(key: string) {
    return createReadStream(this.path(key));
  }
}

/**
 * Minimal S3 client: only PUT/GET/DELETE with SigV4, no SDK.
 *
 * The SDK is ~40 MB in the image for three calls, and `@aws-sdk/client-s3` is
 * not a dependency here. The signature is standard; the endpoint is overridable
 * so a MinIO or DigitalOcean Spaces bucket works unchanged.
 */
class S3Driver implements StorageDriver {
  readonly name = 'S3' as const;
  private readonly log = new Logger('Storage:S3');

  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly endpoint: string,
    private readonly accessKey: string,
    private readonly secretKey: string,
  ) {}

  private async sign(
    method: string,
    key: string,
    body: Buffer | null,
    contentType?: string,
  ): Promise<Record<string, string>> {
    const { createHash, createHmac } = await import('crypto');
    const host = new URL(this.endpoint).host;
    const amzDate = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = createHash('sha256')
      .update(body ?? Buffer.alloc(0))
      .digest('hex');
    const canonicalUri = `/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
    const canonicalHeaders =
      `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const kDate = createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    return {
      Authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    };
  }

  private url(key: string): string {
    return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const res = await fetch(this.url(key), {
      method: 'PUT',
      headers: await this.sign('PUT', key, body, contentType),
      body,
    });
    if (!res.ok) throw new Error(`S3 PUT failed (${res.status})`);
  }

  async get(key: string): Promise<Buffer> {
    const res = await fetch(this.url(key), { headers: await this.sign('GET', key, null) });
    if (!res.ok) throw new Error(`S3 GET failed (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string): Promise<void> {
    const res = await fetch(this.url(key), {
      method: 'DELETE',
      headers: await this.sign('DELETE', key, null),
    });
    // 404 is success: the object is gone, which is what the caller wanted.
    if (!res.ok && res.status !== 404) this.log.warn(`S3 DELETE ${key} → ${res.status}`);
  }

  async exists(key: string): Promise<boolean> {
    const res = await fetch(this.url(key), {
      method: 'HEAD',
      headers: await this.sign('HEAD', key, null),
    });
    return res.ok;
  }
}

let driver: StorageDriver | null = null;

export function storageDriver(): StorageDriver {
  if (driver) return driver;
  const mode = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (mode === 's3' && process.env.STORAGE_S3_BUCKET) {
    driver = new S3Driver(
      process.env.STORAGE_S3_BUCKET,
      process.env.STORAGE_S3_REGION ?? 'ap-south-1',
      process.env.STORAGE_S3_ENDPOINT ??
        `https://s3.${process.env.STORAGE_S3_REGION ?? 'ap-south-1'}.amazonaws.com`,
      process.env.STORAGE_S3_ACCESS_KEY ?? '',
      process.env.STORAGE_S3_SECRET_KEY ?? '',
    );
  } else {
    driver = new LocalDriver(process.env.STORAGE_DIR ?? './var/documents');
  }
  return driver;
}

/** Test seam. */
export function resetStorageDriver(next?: StorageDriver | null): void {
  driver = next ?? null;
}

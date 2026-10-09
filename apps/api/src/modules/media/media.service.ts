import {
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { Runtime } from "../../common/runtime.js";
const input = z
  .object({
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
    alt: z.string().min(3).max(250),
  })
  .strict();
export function imageMatches(bytes: Buffer, mime: string) {
  return mime === "image/jpeg"
    ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === "image/png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.subarray(0, 4).toString() === "RIFF" &&
        bytes.subarray(8, 12).toString() === "WEBP";
}
@Injectable()
export class MediaService {
  constructor(@Inject(Runtime) readonly r: Runtime) {}
  private client() {
    const e = this.r.env;
    if (
      !e.STORAGE_ENDPOINT ||
      !e.STORAGE_BUCKET ||
      !e.STORAGE_ACCESS_KEY_ID ||
      !e.STORAGE_SECRET_ACCESS_KEY ||
      !e.STORAGE_CDN_URL
    )
      throw new ServiceUnavailableException("Image storage is not configured");
    return new S3Client({
      endpoint: e.STORAGE_ENDPOINT,
      region: e.STORAGE_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: e.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: e.STORAGE_SECRET_ACCESS_KEY,
      },
    });
  }
  private signature(id: string) {
    return createHmac("sha256", this.r.env.PROXY_SECRET)
      .update(`upload:${id}`)
      .digest("hex");
  }
  async ticket(body: unknown, actorId: string) {
    this.client();
    const data = input.parse(body);
    const upload = await this.r.db.mediaUpload.create({
      data: {
        ...data,
        actorId,
        storageKey: `products/${randomUUID()}.${data.mimeType.split("/")[1]}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
    return {
      id: upload.id,
      uploadUrl: `/api/v1/admin/media/${upload.id}?signature=${this.signature(upload.id)}`,
      method: "PUT",
      expiresAt: upload.expiresAt,
    };
  }
  async upload(id: string, signature: string, bytes: Buffer, actorId: string) {
    const expected = this.signature(id);
    if (
      !/^[a-f0-9]{64}$/.test(signature) ||
      !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    )
      throw new UnauthorizedException("Invalid upload ticket");
    const u = await this.r.db.mediaUpload.findUnique({ where: { id } });
    if (
      !u ||
      u.actorId !== actorId ||
      u.expiresAt.getTime() < Date.now() ||
      u.state !== "PENDING"
    )
      throw new BadRequestException("Upload expired or already finalized");
    if (bytes.length !== u.size || !imageMatches(bytes, u.mimeType))
      throw new BadRequestException("Image size or type does not match");
    const claimed = await this.r.db.mediaUpload.updateMany({
      where: { id, state: "PENDING" },
      data: { state: "UPLOADING" },
    });
    if (claimed.count !== 1)
      throw new BadRequestException("Upload is already in progress");
    try {
      await this.client().send(
        new PutObjectCommand({
          Bucket: this.r.env.STORAGE_BUCKET,
          Key: u.storageKey,
          Body: bytes,
          ContentType: u.mimeType,
          CacheControl: "public,max-age=31536000,immutable",
        }),
      );
      await this.r.db.mediaUpload.update({
        where: { id },
        data: { state: "UPLOADED" },
      });
    } catch {
      await this.r.db.mediaUpload.updateMany({
        where: { id, state: "UPLOADING" },
        data: { state: "PENDING" },
      });
      throw new ServiceUnavailableException(
        "Image upload failed; retry the same ticket",
      );
    }
    return {
      url: `${this.r.env.STORAGE_CDN_URL!.replace(/\/$/, "")}/${u.storageKey}`,
      alt: u.alt,
      storageKey: u.storageKey,
    };
  }
  async cleanup() {
    if (!this.r.env.STORAGE_BUCKET) return;
    const uploads = await this.r.db.mediaUpload.findMany({
      where: {
        state: { in: ["PENDING", "UPLOADING", "UPLOADED"] },
        expiresAt: { lt: new Date(Date.now() - 86400000) },
      },
      take: 20,
    });
    for (const u of uploads) {
      if (
        await this.r.db.productImage.findFirst({
          where: { storageKey: u.storageKey },
        })
      ) {
        await this.r.db.mediaUpload.update({
          where: { id: u.id },
          data: { state: "FINALIZED" },
        });
        continue;
      }
      await this.client().send(
        new DeleteObjectCommand({
          Bucket: this.r.env.STORAGE_BUCKET,
          Key: u.storageKey,
        }),
      );
      await this.r.db.mediaUpload.update({
        where: { id: u.id },
        data: { state: "REMOVED" },
      });
    }
  }
}

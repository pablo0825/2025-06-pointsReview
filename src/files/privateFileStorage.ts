import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export interface StoredFile {
  storageKey: string;
  fileSize: number;
}

export interface PrivateFileStorage {
  saveFromPath(storageKey: string, sourcePath: string): Promise<StoredFile>;
  remove(storageKey: string): Promise<void>;
}

export class LocalPrivateFileStorage implements PrivateFileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveKey(storageKey: string): string {
    if (!/^[A-Za-z0-9/_\-.]+$/.test(storageKey)) {
      throw new Error("Invalid private storage key");
    }
    const resolved = path.resolve(this.root, storageKey);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new Error("Private storage key escapes storage root");
    }
    return resolved;
  }

  async saveFromPath(
    storageKey: string,
    sourcePath: string,
  ): Promise<StoredFile> {
    const destination = this.resolveKey(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await pipeline(
        createReadStream(sourcePath),
        createWriteStream(destination, { flags: "wx", mode: 0o600 }),
      );
    } catch (error) {
      await rm(destination, { force: true });
      throw error;
    }
    const saved = await stat(destination);
    return { storageKey, fileSize: saved.size };
  }

  async remove(storageKey: string): Promise<void> {
    await rm(this.resolveKey(storageKey), { force: true });
  }
}

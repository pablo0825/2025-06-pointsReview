import argon2 from "argon2";

export const PASSWORD_HASH_ALGORITHM = "argon2id";

export const argon2idOptions = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, argon2idOptions);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function passwordHashNeedsRehash(passwordHash: string): boolean {
  return argon2.needsRehash(passwordHash, argon2idOptions);
}

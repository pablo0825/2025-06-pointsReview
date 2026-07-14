import type { Request } from "express";

export function getClientIp(req: Request): string | null {
  return normalizeIpAddress(req.socket.remoteAddress ?? req.ip);
}

function normalizeIpAddress(ipAddress: string | undefined): string | null {
  if (!ipAddress) {
    return null;
  }

  if (ipAddress.startsWith("::ffff:")) {
    return ipAddress.slice("::ffff:".length);
  }

  return ipAddress;
}

import { z } from "zod";

import { closePool } from "../db/pool";
import {
  InitialAdminError,
  InitialAdminService,
} from "../services/initialAdmin.service";

const argumentsSchema = z.object({
  email: z.string().trim().email().max(320).toLowerCase(),
  displayName: z.string().trim().min(1).max(100),
  resend: z.boolean(),
});

export function parseAdminCreateArguments(args: string[]) {
  const resend = args.includes("--resend");
  const positional = args.filter((argument) => argument !== "--resend");

  if (positional.length !== 2) {
    throw new Error(
      'Usage: npm run admin:create -- admin@example.com "系統管理員" [--resend]',
    );
  }

  return argumentsSchema.parse({
    email: positional[0],
    displayName: positional[1],
    resend,
  });
}

async function main(): Promise<void> {
  try {
    const input = parseAdminCreateArguments(process.argv.slice(2));
    const result = await InitialAdminService.createInitialAdmin(input);
    console.log(
      result.resent
        ? `Activation Email task recreated for admin user ${result.userId}.`
        : `Initial admin user ${result.userId} created; activation Email task is pending.`,
    );
  } catch (error) {
    if (error instanceof InitialAdminError) {
      console.error(`${error.code}: ${error.message}`);
    } else if (error instanceof z.ZodError) {
      console.error("Invalid command arguments.");
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Initial admin command failed.");
    }
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  void main();
}

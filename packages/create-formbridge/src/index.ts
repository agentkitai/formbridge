#!/usr/bin/env node

/**
 * @agentkitai/formbridge-create — CLI scaffolding tool for FormBridge intake projects.
 *
 * Usage:
 *   npx @agentkitai/formbridge-create
 *   npx @agentkitai/formbridge-create --name my-project --schema zod --interface mcp,http --template vendor-onboarding
 */

import { runInteractive } from "./prompts.js";
import { generateProject } from "./generator.js";
import { parseArgs, type CliArgs } from "./cli-args.js";

async function main(): Promise<void> {
  const cliArgs = parseArgs(process.argv.slice(2));

  let options: Required<CliArgs>;

  if (cliArgs.name && cliArgs.schema && cliArgs.interfaces.length > 0) {
    // Non-interactive mode — all required args provided
    options = {
      name: cliArgs.name,
      schema: cliArgs.schema,
      interfaces: cliArgs.interfaces,
      template: cliArgs.template ?? "none",
    };
  } else {
    // Interactive mode
    options = await runInteractive(cliArgs);
  }

  await generateProject(options);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});

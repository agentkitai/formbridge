/**
 * Interactive prompts using @clack/prompts.
 */

import * as p from "@clack/prompts";
import type { CliArgs, SchemaFormat, InterfaceType } from "./cli-args.js";
import { TEMPLATE_CHOICES } from "./templates/index.js";

export async function runInteractive(
  defaults: CliArgs
): Promise<Required<CliArgs>> {
  p.intro("Create a new FormBridge project");

  // Build prompts only for fields not already provided via CLI args
  const prompts: Record<string, () => Promise<unknown> | unknown> = {};

  if (!defaults.name) {
    prompts.name = () =>
      p.text({
        message: "Project name",
        placeholder: "my-formbridge-intake",
        initialValue: "",
        validate: (value) => {
          if (!value) return "Project name is required";
          if (!/^[a-z0-9@][a-z0-9._/-]*$/.test(value))
            return "Invalid package name (lowercase, no spaces)";
        },
      });
  }

  if (!defaults.schema) {
    prompts.schema = () =>
      p.select({
        message: "Schema format",
        initialValue: "zod",
        options: [
          { value: "zod", label: "Zod", hint: "TypeScript-first validation" },
          { value: "json-schema", label: "JSON Schema", hint: "Standard JSON Schema" },
          { value: "openapi", label: "OpenAPI", hint: "OpenAPI 3.x schema component" },
        ],
      });
  }

  if (defaults.interfaces.length === 0) {
    prompts.interfaces = () =>
      p.multiselect({
        message: "Interfaces to generate",
        initialValues: ["http"] as InterfaceType[],
        options: [
          { value: "http", label: "HTTP API", hint: "Hono-based REST endpoints" },
          { value: "mcp", label: "MCP Server", hint: "Model Context Protocol tools" },
          { value: "react", label: "React Form", hint: "React form renderer" },
        ],
        required: true,
      });
  }

  if (!defaults.template) {
    prompts.template = () =>
      p.select({
        message: "Starting template",
        initialValue: "none",
        options: [
          { value: "none", label: "Blank project", hint: "Start from scratch" },
          ...TEMPLATE_CHOICES,
        ],
      });
  }

  const answers = Object.keys(prompts).length > 0
    ? await p.group(
        prompts as any,
        {
          onCancel: () => {
            p.cancel("Project creation cancelled.");
            process.exit(0);
          },
        }
      )
    : {};

  p.outro("Generating project...");

  return {
    name: (defaults.name ?? (answers as any).name) as string,
    schema: (defaults.schema ?? (answers as any).schema) as SchemaFormat,
    interfaces: defaults.interfaces.length > 0
      ? defaults.interfaces
      : ((answers as any).interfaces as InterfaceType[]),
    template: (defaults.template ?? (answers as any).template ?? "none") as string,
  };
}

/**
 * File content generators for scaffolded project files.
 *
 * Each function returns a template string with {{variable}} placeholders.
 */

import type { SchemaFormat } from "../cli-args.js";
import type { TemplateContext } from "../template-engine.js";

// =============================================================================
// § package.json
// =============================================================================

export function getPackageJson(ctx: TemplateContext): string {
  const deps: Record<string, string> = {
    "@agentkitai/formbridge-mcp-server": "^0.1.0",
    zod: "^3.25.0",
  };
  const devDeps: Record<string, string> = {
    "@types/node": "^20.0.0",
    typescript: "^5.3.0",
    vitest: "^1.0.0",
  };

  if (ctx.interfaces.includes("http")) {
    deps["hono"] = "^4.0.0";
  }
  if (ctx.interfaces.includes("mcp")) {
    deps["@modelcontextprotocol/sdk"] = "^1.0.0";
  }
  if (ctx.interfaces.includes("react")) {
    deps["react"] = "^18.2.0";
    deps["react-dom"] = "^18.2.0";
    devDeps["@types/react"] = "^18.2.0";
    devDeps["@types/react-dom"] = "^18.2.0";
  }

  const scripts: Record<string, string> = {
    build: "tsc",
    typecheck: "tsc --noEmit",
    test: "vitest run",
    dev: ctx.interfaces.includes("http")
      ? "node --loader ts-node/esm src/server.ts"
      : "tsc --watch",
  };

  const pkg = {
    name: ctx.projectName,
    version: "0.1.0",
    type: "module",
    scripts,
    dependencies: deps,
    devDependencies: devDeps,
    engines: { node: ">=18.0.0" },
  };

  return JSON.stringify(pkg, null, 2) + "\n";
}

// =============================================================================
// § tsconfig.json
// =============================================================================

export function getTsConfig(): string {
  const config = {
    compilerOptions: {
      target: "ES2022",
      module: "Node16",
      moduleResolution: "Node16",
      lib: ["ES2022"],
      outDir: "./dist",
      rootDir: "./src",
      strict: true,
      esModuleInterop: true,
      declaration: true,
      skipLibCheck: true,
      jsx: "react-jsx",
    },
    include: ["src"],
    exclude: ["node_modules", "dist"],
  };

  return JSON.stringify(config, null, 2) + "\n";
}

// =============================================================================
// § Schema files
// =============================================================================

export function getSchemaFile(
  format: SchemaFormat,
  templateId: string
): string {
  if (templateId !== "none") {
    return getTemplateSchemaFile(format, templateId);
  }
  return getBlankSchemaFile(format);
}

function getBlankSchemaFile(format: SchemaFormat): string {
  switch (format) {
    case "zod":
      return `import { z } from "zod";

/**
 * {{pascalName}} intake schema.
 */
export const {{camelName}}Schema = z.object({
  // Add your fields here
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
});

export type {{pascalName}}Data = z.infer<typeof {{camelName}}Schema>;
`;

    case "json-schema":
      return `/**
 * {{pascalName}} intake — JSON Schema definition.
 */
export const {{camelName}}JsonSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
  },
  required: ["name", "email"],
};

export default {{camelName}}JsonSchema;
`;

    case "openapi":
      return `/**
 * {{pascalName}} intake — OpenAPI 3.x schema component.
 */
export const {{camelName}}OpenApiSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string", minLength: 1, description: "Full name" },
    email: { type: "string", format: "email", description: "Email address" },
  },
  required: ["name", "email"],
};

export default {{camelName}}OpenApiSchema;
`;
  }
}

function getTemplateSchemaFile(format: SchemaFormat, templateId: string): string {
  // Reference the template from @agentkitai/formbridge-templates
  switch (format) {
    case "zod":
      return `/**
 * {{pascalName}} intake schema — based on "${templateId}" template.
 *
 * Customize the schema below to fit your requirements.
 */
import { z } from "zod";

// TODO: Import from @agentkitai/formbridge-templates when published:
// import { ${toCamelCase(templateId)} } from "@agentkitai/formbridge-templates";

export const {{camelName}}Schema = z.object({
  // Schema fields from "${templateId}" template
  // Customize as needed for your project
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
});

export type {{pascalName}}Data = z.infer<typeof {{camelName}}Schema>;
`;

    case "json-schema":
      return `/**
 * {{pascalName}} intake — JSON Schema based on "${templateId}" template.
 */
export const {{camelName}}JsonSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
  },
  required: ["name", "email"],
};

export default {{camelName}}JsonSchema;
`;

    case "openapi":
      return `/**
 * {{pascalName}} intake — OpenAPI schema based on "${templateId}" template.
 */
export const {{camelName}}OpenApiSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
  },
  required: ["name", "email"],
};

export default {{camelName}}OpenApiSchema;
`;
  }
}

function toCamelCase(name: string): string {
  return name
    .split(/[-_]/)
    .map((part, i) =>
      i === 0
        ? part.toLowerCase()
        : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    )
    .join("");
}

// =============================================================================
// § Server file (HTTP)
// =============================================================================

export function getServerFile(): string {
  return `/**
 * {{pascalName}} — HTTP API server (Hono).
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";

const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/", (c) =>
  c.json({
    name: "{{projectName}}",
    description: "FormBridge intake API",
    endpoints: ["/health"],
  })
);

const port = Number(process.env.PORT ?? 3000);
console.log(\`Server running at http://localhost:\${port}\`);
serve({ fetch: app.fetch, port });
`;
}

// =============================================================================
// § MCP server file
// =============================================================================

export function getMcpFile(): string {
  return `/**
 * {{pascalName}} — MCP Server.
 *
 * Exposes intake tools via the Model Context Protocol.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "{{projectName}}",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register your MCP tools here
// server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("{{pascalName}} MCP server running on stdio");
}

main().catch(console.error);
`;
}

// =============================================================================
// § React form file
// =============================================================================

export function getReactFile(): string {
  return `/**
 * {{pascalName}} — React form component.
 */

import React from "react";

export interface {{pascalName}}FormProps {
  onSubmit: (data: Record<string, unknown>) => void;
}

export function {{pascalName}}Form({ onSubmit }: {{pascalName}}FormProps): React.ReactElement {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    onSubmit(data);
  };

  return React.createElement(
    "form",
    { onSubmit: handleSubmit, className: "formbridge-form" },
    React.createElement(
      "div",
      { className: "formbridge-field" },
      React.createElement("label", { htmlFor: "name" }, "Name"),
      React.createElement("input", {
        id: "name",
        name: "name",
        type: "text",
        required: true,
      })
    ),
    React.createElement(
      "div",
      { className: "formbridge-field" },
      React.createElement("label", { htmlFor: "email" }, "Email"),
      React.createElement("input", {
        id: "email",
        name: "email",
        type: "email",
        required: true,
      })
    ),
    React.createElement(
      "button",
      { type: "submit", className: "formbridge-submit" },
      "Submit"
    )
  );
}
`;
}

// =============================================================================
// § README
// =============================================================================

export function getReadme(): string {
  return `# {{projectName}}

A FormBridge intake project.

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Schema Format

**{{schemaFormat}}** — Edit \`src/schema.*\` to define your intake fields.

## Interfaces

{{interfaces}}

## Learn More

- [FormBridge Documentation](https://formbridge.dev)
- [API Reference](https://formbridge.dev/api/)
- [MCP Integration Guide](https://formbridge.dev/mcp/)
`;
}

// =============================================================================
// § .env.example
// =============================================================================

export function getEnvExample(): string {
  return `# FormBridge Configuration
PORT=3000
NODE_ENV=development
`;
}

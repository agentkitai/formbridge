/**
 * End-to-end tests for `create-formbridge` CLI.
 *
 * These tests invoke the built CLI as a child process (simulating `npx @agentkitai/formbridge-create`)
 * with non-interactive CLI args, then verify the generated output on disk.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CLI_ENTRY = path.resolve(
  __dirname,
  "../../packages/create-formbridge/dist/index.js"
);

let tmpRoot: string;

function freshDir(): string {
  const dir = fs.mkdtempSync(path.join(tmpRoot, "cli-e2e-"));
  return dir;
}

function runCli(args: string[], cwd: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [CLI_ENTRY, ...args], {
      cwd,
      encoding: "utf-8",
      timeout: 15_000,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { stdout, status: 0 };
  } catch (err: any) {
    return {
      stdout: (err.stdout ?? "") + (err.stderr ?? ""),
      status: err.status ?? 1,
    };
  }
}

function readGenerated(cwd: string, projectName: string, relPath: string): string {
  return fs.readFileSync(path.join(cwd, projectName, relPath), "utf-8");
}

function generatedExists(cwd: string, projectName: string, relPath: string): boolean {
  return fs.existsSync(path.join(cwd, projectName, relPath));
}

function listGenerated(cwd: string, projectName: string): string[] {
  const base = path.join(cwd, projectName);
  const results: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        results.push(path.relative(base, full));
      }
    }
  }
  walk(base);
  return results.sort();
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  // Ensure the CLI is built
  execSync("npx tsc", {
    cwd: path.resolve(__dirname, "../../packages/create-formbridge"),
    encoding: "utf-8",
    timeout: 30_000,
  });

  // Verify the entry point exists
  if (!fs.existsSync(CLI_ENTRY)) {
    throw new Error(`CLI entry point not found at ${CLI_ENTRY}. Build may have failed.`);
  }

  // Create temp root
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "formbridge-e2e-"));
});

afterEach(() => {
  // Clean up any generated projects in tmpRoot after each test
  // (we use fresh subdirs so this is mainly defensive)
});

// Global cleanup — remove tmpRoot after all tests
import { afterAll } from "vitest";
afterAll(() => {
  if (tmpRoot && fs.existsSync(tmpRoot)) {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

// =============================================================================
// § Non-interactive CLI invocation
// =============================================================================

describe("CLI non-interactive invocation", () => {
  it("should create a project with all required args", () => {
    const cwd = freshDir();
    const { stdout, status } = runCli(
      ["--name", "my-test", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );

    expect(status).toBe(0);
    expect(stdout).toContain("Project created at");
    expect(generatedExists(cwd, "my-test", "package.json")).toBe(true);
    expect(generatedExists(cwd, "my-test", "tsconfig.json")).toBe(true);
    expect(generatedExists(cwd, "my-test", "src/schema.ts")).toBe(true);
    expect(generatedExists(cwd, "my-test", "README.md")).toBe(true);
    expect(generatedExists(cwd, "my-test", ".gitignore")).toBe(true);
    expect(generatedExists(cwd, "my-test", ".env.example")).toBe(true);
  });

  it("should create a project with multiple interfaces", () => {
    const cwd = freshDir();
    const { status } = runCli(
      ["--name", "multi-iface", "--schema", "zod", "--interface", "http,mcp,react", "--template", "none"],
      cwd
    );

    expect(status).toBe(0);
    expect(generatedExists(cwd, "multi-iface", "src/server.ts")).toBe(true);
    expect(generatedExists(cwd, "multi-iface", "src/mcp-server.ts")).toBe(true);
    expect(generatedExists(cwd, "multi-iface", "src/Form.tsx")).toBe(true);
  });

  it("should fail if project directory already exists and is non-empty", () => {
    const cwd = freshDir();
    const projDir = path.join(cwd, "existing");
    fs.mkdirSync(projDir);
    fs.writeFileSync(path.join(projDir, "file.txt"), "occupied");

    const { stdout, status } = runCli(
      ["--name", "existing", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );

    expect(status).toBe(1);
    expect(stdout).toContain("already exists");
  });

  it("should succeed in an existing but empty directory", () => {
    const cwd = freshDir();
    fs.mkdirSync(path.join(cwd, "empty-dir"));

    const { status } = runCli(
      ["--name", "empty-dir", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );

    expect(status).toBe(0);
    expect(generatedExists(cwd, "empty-dir", "package.json")).toBe(true);
  });
});

// =============================================================================
// § Generated package.json validation
// =============================================================================

describe("Generated package.json", () => {
  it("should be valid JSON with correct name", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "pkg-test", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );

    const raw = readGenerated(cwd, "pkg-test", "package.json");
    const pkg = JSON.parse(raw);
    expect(pkg.name).toBe("pkg-test");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.type).toBe("module");
    expect(pkg.engines.node).toBe(">=18.0.0");
  });

  it("should include hono when http interface selected", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "http-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const pkg = JSON.parse(readGenerated(cwd, "http-proj", "package.json"));
    expect(pkg.dependencies).toHaveProperty("hono");
  });

  it("should include @modelcontextprotocol/sdk when mcp selected", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "mcp-proj", "--schema", "zod", "--interface", "mcp", "--template", "none"],
      cwd
    );
    const pkg = JSON.parse(readGenerated(cwd, "mcp-proj", "package.json"));
    expect(pkg.dependencies).toHaveProperty("@modelcontextprotocol/sdk");
    expect(pkg.dependencies).not.toHaveProperty("hono");
  });

  it("should include react deps when react selected", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "react-proj", "--schema", "zod", "--interface", "react", "--template", "none"],
      cwd
    );
    const pkg = JSON.parse(readGenerated(cwd, "react-proj", "package.json"));
    expect(pkg.dependencies).toHaveProperty("react");
    expect(pkg.dependencies).toHaveProperty("react-dom");
    expect(pkg.devDependencies).toHaveProperty("@types/react");
  });

  it("should have scripts including build, test, and dev", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "scripts-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const pkg = JSON.parse(readGenerated(cwd, "scripts-proj", "package.json"));
    expect(pkg.scripts).toHaveProperty("build");
    expect(pkg.scripts).toHaveProperty("test");
    expect(pkg.scripts).toHaveProperty("dev");
    expect(pkg.scripts).toHaveProperty("typecheck");
  });
});

// =============================================================================
// § Generated tsconfig.json validation
// =============================================================================

describe("Generated tsconfig.json", () => {
  it("should be valid JSON with strict mode", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "ts-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const tsconfig = JSON.parse(readGenerated(cwd, "ts-proj", "tsconfig.json"));
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
    expect(tsconfig.compilerOptions.module).toBe("Node16");
    expect(tsconfig.include).toContain("src");
  });
});

// =============================================================================
// § Schema format variations
// =============================================================================

describe("Schema format variations", () => {
  it("should generate .ts schema file for zod", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "zod-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    expect(generatedExists(cwd, "zod-proj", "src/schema.ts")).toBe(true);
    const content = readGenerated(cwd, "zod-proj", "src/schema.ts");
    expect(content).toContain('import { z } from "zod"');
    expect(content).toContain("zodProjSchema");
    expect(content).toContain("ZodProjData");
  });

  it("should generate .json.ts schema file for json-schema", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "json-proj", "--schema", "json-schema", "--interface", "http", "--template", "none"],
      cwd
    );
    expect(generatedExists(cwd, "json-proj", "src/schema.json.ts")).toBe(true);
    const content = readGenerated(cwd, "json-proj", "src/schema.json.ts");
    expect(content).toContain("jsonProjJsonSchema");
  });

  it("should generate .openapi.ts schema file for openapi", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "api-proj", "--schema", "openapi", "--interface", "http", "--template", "none"],
      cwd
    );
    expect(generatedExists(cwd, "api-proj", "src/schema.openapi.ts")).toBe(true);
    const content = readGenerated(cwd, "api-proj", "src/schema.openapi.ts");
    expect(content).toContain("apiProjOpenApiSchema");
  });
});

// =============================================================================
// § Template variations — each template generates valid output
// =============================================================================

describe("Template variations", () => {
  const templates = [
    "vendor-onboarding",
    "it-access-request",
    "customer-intake",
    "expense-report",
    "bug-report",
  ];

  for (const template of templates) {
    it(`should generate a valid project for template: ${template}`, () => {
      // Create a safe project name from template id
      const projName = `tpl-${template}`;
      const cwd = freshDir();
      const { status } = runCli(
        ["--name", projName, "--schema", "zod", "--interface", "http,mcp", "--template", template],
        cwd
      );

      expect(status).toBe(0);

      // Verify core files exist
      expect(generatedExists(cwd, projName, "package.json")).toBe(true);
      expect(generatedExists(cwd, projName, "tsconfig.json")).toBe(true);
      expect(generatedExists(cwd, projName, "src/schema.ts")).toBe(true);
      expect(generatedExists(cwd, projName, "src/server.ts")).toBe(true);
      expect(generatedExists(cwd, projName, "src/mcp-server.ts")).toBe(true);
      expect(generatedExists(cwd, projName, "README.md")).toBe(true);

      // Schema should reference the template
      const schema = readGenerated(cwd, projName, "src/schema.ts");
      expect(schema).toContain(template);

      // package.json should be valid JSON
      const pkg = JSON.parse(readGenerated(cwd, projName, "package.json"));
      expect(pkg.name).toBe(projName);
    });
  }

  it("should generate a blank project with template=none", () => {
    const cwd = freshDir();
    const { status } = runCli(
      ["--name", "blank-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );

    expect(status).toBe(0);
    const schema = readGenerated(cwd, "blank-proj", "src/schema.ts");
    // Blank template should NOT reference any template name
    expect(schema).not.toContain("vendor-onboarding");
    expect(schema).toContain("blankProjSchema");
  });
});

// =============================================================================
// § Template variable substitution in generated files
// =============================================================================

describe("Template variable substitution", () => {
  it("should replace project name in README", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "my-cool-app", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const readme = readGenerated(cwd, "my-cool-app", "README.md");
    expect(readme).toContain("# my-cool-app");
    expect(readme).toContain("**zod**");
    expect(readme).toContain("http");
  });

  it("should use PascalCase and camelCase names in schema", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "vendor-intake", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const schema = readGenerated(cwd, "vendor-intake", "src/schema.ts");
    expect(schema).toContain("vendorIntakeSchema");
    expect(schema).toContain("VendorIntakeData");
  });

  it("should use PascalCase in MCP server file", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "my-mcp-app", "--schema", "zod", "--interface", "mcp", "--template", "none"],
      cwd
    );
    const mcp = readGenerated(cwd, "my-mcp-app", "src/mcp-server.ts");
    expect(mcp).toContain("MyMcpApp");
    expect(mcp).toContain("my-mcp-app");
  });

  it("should use PascalCase in React form file", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "my-form", "--schema", "zod", "--interface", "react", "--template", "none"],
      cwd
    );
    const form = readGenerated(cwd, "my-form", "src/Form.tsx");
    expect(form).toContain("MyFormForm");
    expect(form).toContain("MyFormFormProps");
  });

  it("should include project name in HTTP server file", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "api-server", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const server = readGenerated(cwd, "api-server", "src/server.ts");
    expect(server).toContain("api-server");
  });
});

// =============================================================================
// § Edge cases
// =============================================================================

describe("CLI edge cases", () => {
  it("should default template to none when not provided but other args are complete", () => {
    const cwd = freshDir();
    // All required args except --template → should use "none" default in non-interactive mode
    const { status } = runCli(
      ["--name", "no-tpl", "--schema", "zod", "--interface", "http"],
      cwd
    );

    // This should work non-interactively since name + schema + interfaces are provided
    // and template defaults to "none"
    expect(status).toBe(0);
    expect(generatedExists(cwd, "no-tpl", "package.json")).toBe(true);
  });

  it("should generate .env.example with PORT config", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "env-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const env = readGenerated(cwd, "env-proj", ".env.example");
    expect(env).toContain("PORT=3000");
    expect(env).toContain("NODE_ENV=development");
  });

  it("should generate .gitignore with node_modules and dist", () => {
    const cwd = freshDir();
    runCli(
      ["--name", "git-proj", "--schema", "zod", "--interface", "http", "--template", "none"],
      cwd
    );
    const gitignore = readGenerated(cwd, "git-proj", ".gitignore");
    expect(gitignore).toContain("node_modules");
    expect(gitignore).toContain("dist");
    expect(gitignore).toContain(".env");
  });

  it("should produce consistent output for the same inputs", () => {
    const cwd1 = freshDir();
    const cwd2 = freshDir();
    const args = ["--name", "deterministic", "--schema", "zod", "--interface", "http,mcp", "--template", "bug-report"];

    runCli(args, cwd1);
    runCli(args, cwd2);

    const files1 = listGenerated(cwd1, "deterministic");
    const files2 = listGenerated(cwd2, "deterministic");
    expect(files1).toEqual(files2);

    // Content should match too
    for (const file of files1) {
      const content1 = readGenerated(cwd1, "deterministic", file);
      const content2 = readGenerated(cwd2, "deterministic", file);
      expect(content1).toBe(content2);
    }
  });
});

// =============================================================================
// § Full matrix: all schema × interface combinations produce valid projects
// =============================================================================

describe("Schema × Interface matrix", () => {
  const schemas = ["zod", "json-schema", "openapi"] as const;
  const interfaceCombos = ["http", "mcp", "react", "http,mcp", "http,react", "mcp,react", "http,mcp,react"];

  // Test a representative subset to avoid too many filesystem operations
  const testCases = [
    { schema: "zod", iface: "http" },
    { schema: "zod", iface: "mcp" },
    { schema: "zod", iface: "react" },
    { schema: "json-schema", iface: "http,mcp" },
    { schema: "openapi", iface: "http,mcp,react" },
  ];

  for (const { schema, iface } of testCases) {
    it(`should generate valid project for schema=${schema}, interface=${iface}`, () => {
      const projName = `matrix-${schema}-${iface.replace(/,/g, "-")}`;
      const cwd = freshDir();
      const { status } = runCli(
        ["--name", projName, "--schema", schema, "--interface", iface, "--template", "none"],
        cwd
      );

      expect(status).toBe(0);

      // Core files always present
      expect(generatedExists(cwd, projName, "package.json")).toBe(true);
      expect(generatedExists(cwd, projName, "tsconfig.json")).toBe(true);
      expect(generatedExists(cwd, projName, "README.md")).toBe(true);

      // package.json must be valid JSON
      const pkg = JSON.parse(readGenerated(cwd, projName, "package.json"));
      expect(pkg.name).toBe(projName);

      // tsconfig must be valid JSON
      const tsconfig = JSON.parse(readGenerated(cwd, projName, "tsconfig.json"));
      expect(tsconfig.compilerOptions).toBeDefined();

      // Interface-specific files
      const interfaces = iface.split(",");
      if (interfaces.includes("http")) {
        expect(generatedExists(cwd, projName, "src/server.ts")).toBe(true);
      }
      if (interfaces.includes("mcp")) {
        expect(generatedExists(cwd, projName, "src/mcp-server.ts")).toBe(true);
      }
      if (interfaces.includes("react")) {
        expect(generatedExists(cwd, projName, "src/Form.tsx")).toBe(true);
      }
    });
  }
});

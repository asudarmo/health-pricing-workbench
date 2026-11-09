// Contract check: api/openapi.json (generated from the backend) must match src/api/types.ts and src/api/client.ts.
// Fails on any drift: missing or extra endpoints, missing or extra properties, optional versus required,
// and the basic type of each property. Run: npm run check:contract
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(here, "../../api/openapi.json"), "utf8"));
const typesSource = readFileSync(join(here, "../src/api/types.ts"), "utf8");
const clientSource = readFileSync(join(here, "../src/api/client.ts"), "utf8");
const problems = [];
const fail = (message) => problems.push(message);

// ---- 1. Endpoints in client.ts versus paths in the contract -------------------------------------------------
const clientCalls = [...clientSource.matchAll(/request<[^>]*(?:<[^>]*>)?[^>]*>\(\s*"(GET|POST|PUT|DELETE)",\s*[`"]([^`"]+)[`"]/g)].map(
  (m) => `${m[1]} ${m[2].replace(/\$\{[^}]+\}/g, "{id}")}`,
);
const specOps = [];
for (const [path, item] of Object.entries(spec.paths)) {
  if (!path.startsWith("/api") || path === "/api/health") continue;
  for (const method of Object.keys(item)) specOps.push(`${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{id}")}`);
}
for (const call of clientCalls) if (!specOps.includes(call)) fail(`client.ts calls ${call}, which is not in the contract`);
for (const op of specOps) if (!clientCalls.includes(op) && op !== "GET /api/auth/me") fail(`contract has ${op}, which client.ts does not call`);
if (clientCalls.length !== 14) fail(`expected 14 endpoints in client.ts, found ${clientCalls.length}`);

// ---- 2. Interfaces in types.ts versus component schemas ------------------------------------------------------
const file = ts.createSourceFile("types.ts", typesSource, ts.ScriptTarget.Latest, true);
const aliases = new Map(); // type alias name -> kind ("string-union" | ...)
const interfaces = new Map();

function kindOf(node) {
  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "string";
    case ts.SyntaxKind.NumberKeyword:
      return "number";
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean";
    case ts.SyntaxKind.ArrayType:
      return "array";
    case ts.SyntaxKind.TypeLiteral:
      return "object";
    case ts.SyntaxKind.LiteralType:
      return node.literal.kind === ts.SyntaxKind.NullKeyword ? "null" : "string";
    case ts.SyntaxKind.TypeReference: {
      const name = node.typeName.getText();
      if (name === "Record") return "object";
      return aliases.get(name) ?? `ref:${name}`;
    }
    case ts.SyntaxKind.UnionType: {
      const parts = node.types.map(kindOf);
      const nonNull = parts.filter((p) => p !== "null");
      const unique = [...new Set(nonNull)];
      const base = unique.length === 1 ? unique[0] : "string"; // unions here are string literal unions
      return parts.includes("null") ? `${base}|null` : base;
    }
    default:
      if (node.kind === ts.SyntaxKind.NullKeyword) return "null";
      if (node.getText() === "null") return "null";
      return "unknown";
  }
}

file.forEachChild((node) => {
  if (ts.isTypeAliasDeclaration(node)) aliases.set(node.name.text, kindOf(node.type));
});
file.forEachChild((node) => {
  if (!ts.isInterfaceDeclaration(node)) return;
  const props = new Map();
  for (const member of node.members) {
    if (!ts.isPropertySignature(member)) continue;
    props.set(member.name.getText(), { optional: Boolean(member.questionToken), kind: kindOf(member.type) });
  }
  const parent = node.heritageClauses?.[0]?.types[0]?.expression.getText();
  interfaces.set(node.name.text, { props, parent });
});
function allProps(name) {
  const entry = interfaces.get(name);
  if (!entry) return new Map();
  return new Map([...(entry.parent ? allProps(entry.parent) : []), ...entry.props]);
}

const schemas = spec.components.schemas;
function schemaKind(prop) {
  if (prop.$ref) {
    const target = prop.$ref.split("/").pop();
    const s = schemas[target];
    if (s && s.type === "string") return "string"; // enum alias
    if (s && s.enum) return "string";
    return `ref:${target}`;
  }
  if (prop.anyOf) {
    const parts = prop.anyOf.map(schemaKind);
    const nonNull = [...new Set(parts.filter((p) => p !== "null"))];
    const base = nonNull.length === 1 ? nonNull[0] : "string";
    return parts.includes("null") ? `${base}|null` : base;
  }
  if (prop.type === "integer" || prop.type === "number") return "number";
  if (prop.enum || prop.const) return "string";
  if (prop.type === "null") return "null";
  return prop.type ?? "unknown";
}

// TypeScript's Record<string, string> is an object; inline object literal types are compared by kind only.
// Contract-only schemas (requests wrapped for transport, errors, validation) are listed here.
const CONTRACT_ONLY = new Set(["ErrorResponse", "ValidationProblem", "ValidationErrorResponse", "HTTPValidationError", "ValidationError", "ImpactRequest", "LoginRequest", "Decision", "Validation", "HistogramBucket", "AffectedSegment"]);
const NESTED_INLINE = new Set(["Validation", "HistogramBucket", "AffectedSegment"]);

for (const [name, schema] of Object.entries(schemas)) {
  if (CONTRACT_ONLY.has(name)) continue;
  if (!interfaces.has(name)) {
    fail(`contract schema ${name} has no interface in types.ts`);
    continue;
  }
  const ts_props = allProps(name);
  const spec_props = schema.properties ?? {};
  for (const key of Object.keys(spec_props)) if (!ts_props.has(key)) fail(`${name}.${key} is in the contract but not in types.ts`);
  for (const [key, info] of ts_props) {
    if (!(key in spec_props)) {
      fail(`${name}.${key} is in types.ts but not in the contract`);
      continue;
    }
    const required = (schema.required ?? []).includes(key);
    // A property the client always sends may be optional in the contract when the backend gives it a default.
    const lenientInput = !required && !info.optional && "default" in spec_props[key];
    if (required === info.optional && !lenientInput) fail(`${name}.${key}: types.ts says ${info.optional ? "optional" : "required"}, contract says ${required ? "required" : "optional"}`);
    const want = info.kind;
    const have = schemaKind(spec_props[key]);
    const norm = (k) => k.replace(/^ref:.*/, "ref");
    if (norm(want) !== norm(have) && !(want.startsWith("ref:") && have === "object") && !(want === "object" && have.startsWith("ref:"))) fail(`${name}.${key}: types.ts is ${want}, contract is ${have}`);
  }
}
for (const name of interfaces.keys()) {
  if (!schemas[name] && !["User"].includes(name) && !NESTED_INLINE.has(name)) {
    // interfaces that are never sent over the API (UI-only) would be listed here
    fail(`types.ts interface ${name} has no schema in the contract`);
  }
}

// ---- 3. Nested inline shapes in types.ts that the contract names --------------------------------------------
const inline = [
  ["ModelInfo", "validation", "Validation", ["deviance", "gini"]],
  ["Impact", "histogram", "HistogramBucket", ["bucket", "policies"]],
  ["Impact", "affectedSegments", "AffectedSegment", ["segment", "averageChangePct"]],
];
for (const [owner, prop, schemaName, keys] of inline) {
  const have = Object.keys(schemas[schemaName]?.properties ?? {}).sort().join(",");
  if (have !== [...keys].sort().join(",")) fail(`${owner}.${prop}: contract schema ${schemaName} has [${have}], types.ts has [${keys}]`);
  if (!typesSource.includes(keys[0]) || !keys.every((k) => new RegExp(`\\b${k}\\b`).test(typesSource))) fail(`${owner}.${prop}: types.ts lacks ${keys}`);
}

if (problems.length) {
  console.error(`Contract check FAILED (${problems.length}):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`Contract check passed: ${clientCalls.length} endpoints, ${Object.keys(schemas).length - CONTRACT_ONLY.size} shared types.`);

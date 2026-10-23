import {
  getActiveProjectId,
  getScopedStorageKey,
  STORAGE_KEY,
  CATALOG_KEY,
  SAVED_KEY,
  TRASH_KEY,
  exportProjectBundle,
  importProjectBundle
} from "../data/storage.js";
import { STARTER_RECORDS } from "../data/default-records.js";

const FACTORS_KEY = "rpg-codex-calculator-factors-v1";
const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
const clone = value => JSON.parse(JSON.stringify(value));
const makeId = prefix => `${prefix || "id"}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
const slug = value => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "value";
const validKey = value => /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ""));
const asArray = value => Array.isArray(value) ? value : [];

const ALLOWED_FUNCTIONS = {
  abs: { min: 1, max: 1, run: ([x]) => Math.abs(x) },
  ceil: { min: 1, max: 1, run: ([x]) => Math.ceil(x) },
  floor: { min: 1, max: 1, run: ([x]) => Math.floor(x) },
  round: { min: 1, max: 2, run: ([x, digits = 0]) => {
    if (!Number.isInteger(digits) || digits < 0 || digits > 12) throw new Error("round() digits must be an integer from 0 to 12.");
    const factor = 10 ** digits;
    return Math.round((x + Number.EPSILON) * factor) / factor;
  } },
  min: { min: 1, max: 100, run: values => Math.min(...values) },
  max: { min: 1, max: 100, run: values => Math.max(...values) },
  sqrt: { min: 1, max: 1, run: ([x]) => {
    if (x < 0) throw new Error("sqrt() cannot use a negative number.");
    return Math.sqrt(x);
  } },
  pow: { min: 2, max: 2, run: ([x, y]) => x ** y },
  log: { min: 1, max: 1, run: ([x]) => {
    if (x <= 0) throw new Error("log() requires a value greater than zero.");
    return Math.log(x);
  } },
  exp: { min: 1, max: 1, run: ([x]) => Math.exp(x) }
};

/* A small parser/interpreter: formulas are expressions only, never JavaScript. */
function tokenizeFormula(source) {
  const text = String(source ?? "");
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    const rest = text.slice(i);
    const number = rest.match(/^(?:(?:\d+\.?\d*)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) throw new Error(`Invalid number at position ${i + 1}.`);
      tokens.push({ type: "number", value, pos: i });
      i += number[0].length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z_][A-Za-z0-9_.]*/);
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0], pos: i });
      i += identifier[0].length;
      continue;
    }
    if ("+-*/^(),".includes(text[i])) {
      tokens.push({ type: text[i], value: text[i], pos: i });
      i++;
      continue;
    }
    throw new Error(`Unsupported character “${text[i]}” at position ${i + 1}.`);
  }
  tokens.push({ type: "eof", value: "", pos: text.length });
  return tokens;
}

function parseFormula(source) {
  const tokens = tokenizeFormula(source);
  let i = 0;
  const peek = () => tokens[i];
  const take = type => {
    const token = peek();
    if (token.type !== type) throw new Error(`Expected “${type}” at position ${token.pos + 1}.`);
    i++;
    return token;
  };
  function primary() {
    const token = peek();
    if (token.type === "number") { i++; return { type: "number", value: token.value }; }
    if (token.type === "identifier") {
      i++;
      const name = token.value;
      if (peek().type === "(") {
        if (!Object.prototype.hasOwnProperty.call(ALLOWED_FUNCTIONS, name.toLowerCase())) {
          throw new Error(`Function “${name}” is not allowed.`);
        }
        take("(");
        const args = [];
        if (peek().type !== ")") {
          args.push(expression());
          while (peek().type === ",") { take(","); args.push(expression()); }
        }
        take(")");
        const fn = ALLOWED_FUNCTIONS[name.toLowerCase()];
        if (args.length < fn.min || args.length > fn.max) {
          throw new Error(`${name}() expects ${fn.min === fn.max ? fn.min : `${fn.min}–${fn.max}`} argument(s).`);
        }
        return { type: "call", name: name.toLowerCase(), args };
      }
      return { type: "variable", name };
    }
    if (token.type === "(") {
      take("(");
      const node = expression();
      take(")");
      return node;
    }
    throw new Error(`Expected a number, variable, function or “(” at position ${token.pos + 1}.`);
  }
  function power() {
    let node = primary();
    if (peek().type === "^") {
      take("^");
      node = { type: "binary", op: "^", left: node, right: unary() };
    }
    return node;
  }
  function unary() {
    if (peek().type === "+" || peek().type === "-") {
      const op = peek().type;
      i++;
      return { type: "unary", op, value: unary() };
    }
    return power();
  }
  function term() {
    let node = unary();
    while (["*", "/"].includes(peek().type)) {
      const op = peek().type; i++;
      node = { type: "binary", op, left: node, right: unary() };
    }
    return node;
  }
  function expression() {
    let node = term();
    while (["+", "-"].includes(peek().type)) {
      const op = peek().type; i++;
      node = { type: "binary", op, left: node, right: term() };
    }
    return node;
  }
  const ast = expression();
  if (peek().type !== "eof") throw new Error(`Unexpected token “${peek().value}” at position ${peek().pos + 1}.`);
  return ast;
}

function evaluateFormula(ast, variables) {
  const lookup = name => {
    const key = String(name).toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      throw new Error(`Variable “${name}” is missing, non-numeric or ambiguous. Use the suggested input_property alias.`);
    }
    const value = variables[key];
    if (value === AMBIGUOUS) throw new Error(`Variable “${name}” is ambiguous. Use a role-prefixed variable such as attacker_damage.`);
    return value;
  };
  function visit(node) {
    if (node.type === "number") return node.value;
    if (node.type === "variable") return lookup(node.name);
    if (node.type === "unary") return node.op === "-" ? -visit(node.value) : visit(node.value);
    if (node.type === "call") {
      const values = node.args.map(visit);
      const result = ALLOWED_FUNCTIONS[node.name].run(values);
      if (!Number.isFinite(result)) throw new Error(`${node.name}() did not return a finite number.`);
      return result;
    }
    const left = visit(node.left);
    const right = visit(node.right);
    let result;
    switch (node.op) {
      case "+": result = left + right; break;
      case "-": result = left - right; break;
      case "*": result = left * right; break;
      case "/":
        if (right === 0) throw new Error("Division by zero.");
        result = left / right; break;
      case "^": result = left ** right; break;
      default: throw new Error("Unsupported mathematical operator.");
    }
    if (!Number.isFinite(result)) throw new Error("The formula produced a non-finite result.");
    return result;
  }
  return visit(ast);
}

const AMBIGUOUS = Symbol("ambiguous-variable");
function addVariable(variables, name, value) {
  if (value === undefined || !validVariableName(name)) return;
  const key = String(name).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(variables, key) && variables[key] !== value) {
    variables[key] = AMBIGUOUS;
  } else variables[key] = value;
}
function validVariableName(name) { return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(String(name || "")); }
function numericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
function formatNumber(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: 6, useGrouping: false });
}
function propertySlug(name) { return slug(name).replace(/^([0-9])/, "p_$1"); }
function inputVariable(inputKey, propertyName) { return `${inputKey}_${propertySlug(propertyName)}`; }
function dependencyVariable(factor, output) { return `dep_${slug(factor.id)}_${slug(output.id)}`; }
function resultVariable(output) { return `result_${slug(output.id)}`; }

function readCurrentRecords() {
  const key = getScopedStorageKey(STORAGE_KEY);
  const raw = localStorage.getItem(key);
  if (raw === null) {
    return getActiveProjectId() === "default"
      ? clone(STARTER_RECORDS)
      : [];
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Saved records are not a list. Calculations were stopped to protect the database.");
  const ids = new Set();
  return parsed.map(record => {
    if (!record || typeof record !== "object" || Array.isArray(record) || !String(record.id ?? "").trim()) {
      throw new Error("A saved record is invalid. Calculations were stopped to protect the database.");
    }
    if (ids.has(String(record.id))) throw new Error("Saved records contain duplicate IDs. Calculations were stopped.");
    ids.add(String(record.id));
    if (record.properties !== undefined && !Array.isArray(record.properties)) throw new Error(`Properties for “${record.name || record.id}” are invalid.`);
    return {
      ...record,
      id: String(record.id),
      name: String(record.name || "Untitled"),
      type: String(record.type || "Item"),
      category: String(record.category || ""),
      tags: asArray(record.tags),
      properties: asArray(record.properties).map(property => {
        if (!property || typeof property !== "object" || Array.isArray(property)) throw new Error(`A property in “${record.name || record.id}” is invalid.`);
        return { name: String(property.name || "").trim(), value: property.value ?? "" };
      }).filter(property => property.name)
    };
  });
}

function readFactors() {
  const raw = localStorage.getItem(getScopedStorageKey(FACTORS_KEY));
  if (raw === null) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Saved factors are not a list. Existing data was preserved.");
  const ids = new Set();
  const normalized = parsed.map((factor, index) => {
    if (!factor || typeof factor !== "object" || Array.isArray(factor) || !String(factor.id || "").trim() || !String(factor.name || "").trim()) {
      throw new Error(`Saved factor ${index + 1} has an invalid structure. Existing data was preserved.`);
    }
    if (ids.has(String(factor.id))) throw new Error("Saved factors contain duplicate IDs. Existing data was preserved.");
    ids.add(String(factor.id));
    return normalizeFactor(factor);
  });
  const cycle = findDependencyCycle(normalized);
  if (cycle) throw new Error(`Saved factors contain a circular dependency (${cycle.join(" → ")}). Existing data was preserved.`);
  return normalized;
}

function normalizeFactor(source) {
  const factor = {
    id: String(source.id || makeId("factor")),
    name: String(source.name || "Untitled factor").trim(),
    description: String(source.description || ""),
    inputs: asArray(source.inputs).map((input, index) => ({
      id: String(input.id || makeId("input")),
      key: String(input.key || `input_${index + 1}`).trim(),
      label: String(input.label || input.key || `Input ${index + 1}`).trim(),
      role: ["attacker", "target", "context", "other"].includes(input.role) ? input.role : "other",
      optional: Boolean(input.optional),
      acceptedTypes: asArray(input.acceptedTypes).map(String),
      acceptedCategories: asArray(input.acceptedCategories).map(String),
      requiredProperties: asArray(input.requiredProperties).map(String)
    })),
    outputs: asArray(source.outputs).map(output => ({
      id: String(output.id || makeId("output")),
      name: String(output.name || "Result").trim(),
      formula: String(output.formula ?? "1")
    })),
    dependencies: asArray(source.dependencies).map(dependency => ({
      factorId: String(dependency.factorId || ""),
      bindings: dependency.bindings && typeof dependency.bindings === "object" && !Array.isArray(dependency.bindings)
        ? Object.fromEntries(Object.entries(dependency.bindings).map(([key, value]) => [String(key), String(value)]))
        : {}
    }))
  };
  return factor;
}

function findDependencyCycle(factors) {
  const map = new Map(factors.map(factor => [factor.id, factor]));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(Math.max(0, start)), id].map(item => map.get(item)?.name || item);
    }
    if (visited.has(id)) return null;
    visiting.add(id); stack.push(id);
    const factor = map.get(id);
    for (const dependency of factor?.dependencies || []) {
      if (!map.has(dependency.factorId)) continue;
      const cycle = visit(dependency.factorId);
      if (cycle) return cycle;
    }
    stack.pop(); visiting.delete(id); visited.add(id);
    return null;
  }
  for (const factor of factors) {
    const cycle = visit(factor.id);
    if (cycle) return cycle;
  }
  return null;
}

function validateFactor(factor, factors) {
  const normalized = normalizeFactor(factor);
  if (!normalized.name) throw new Error("Give the factor a name.");
  if (!normalized.inputs.length) throw new Error("Add at least one input to the factor.");
  if (!normalized.outputs.length) throw new Error("Add at least one output to the factor.");
  if (normalized.inputs.length > 10) throw new Error("A factor can have at most 10 inputs in this version.");
  if (normalized.outputs.length > 12) throw new Error("A factor can have at most 12 outputs in this version.");
  const inputKeys = new Set();
  const inputIds = new Set();
  for (const input of normalized.inputs) {
    if (!input.id || inputIds.has(input.id)) throw new Error("Each input must have a unique ID.");
    inputIds.add(input.id);
    if (!validKey(input.key)) throw new Error(`Input key “${input.key}” must start with a letter or underscore and contain only letters, numbers and underscores.`);
    if (inputKeys.has(input.key.toLowerCase())) throw new Error(`Input key “${input.key}” is duplicated.`);
    inputKeys.add(input.key.toLowerCase());
    if (!input.label) throw new Error("Every input needs a display name.");
  }
  const outputNames = new Set();
  const outputIds = new Set();
  for (const output of normalized.outputs) {
    if (!output.id || outputIds.has(output.id)) throw new Error("Each output must have a unique ID.");
    outputIds.add(output.id);
    if (!output.name) throw new Error("Every output needs a name.");
    const nameKey = output.name.toLowerCase();
    if (outputNames.has(nameKey)) throw new Error(`Output name “${output.name}” is duplicated.`);
    outputNames.add(nameKey);
    parseFormula(output.formula);
  }
  const factorMap = new Map(factors.map(item => [item.id, item]));
  const seenDependencies = new Set();
  for (const dependency of normalized.dependencies) {
    if (!dependency.factorId || !factorMap.has(dependency.factorId)) throw new Error("A dependency points to a factor that no longer exists.");
    if (dependency.factorId === normalized.id) throw new Error("A factor cannot depend on itself.");
    if (seenDependencies.has(dependency.factorId)) throw new Error("The same dependency was added more than once.");
    seenDependencies.add(dependency.factorId);
    const depended = factorMap.get(dependency.factorId);
    for (const depInput of depended.inputs) {
      if (!normalized.inputs.some(input => input.key === dependency.bindings[depInput.key])) {
        throw new Error(`Map the dependency input “${depInput.label}” to one of this factor’s inputs.`);
      }
    }
  }
  const candidate = factors.some(item => item.id === normalized.id)
    ? factors.map(item => item.id === normalized.id ? normalized : item)
    : [...factors, normalized];
  const cycle = findDependencyCycle(candidate);
  if (cycle) throw new Error(`Circular dependency detected: ${cycle.join(" → ")}.`);
  return normalized;
}

function propertyNames(records) {
  return [...new Set(records.flatMap(record => asArray(record.properties).map(property => String(property.name || "").trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
}
function typeNames(records) {
  return [...new Set(records.map(record => String(record.type || "Item").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function categoryNames(records) {
  return [...new Set(records.map(record => String(record.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function eligibleRecords(input, records) {
  return records.filter(record => {
    if (input.acceptedTypes.length && !input.acceptedTypes.includes(record.type)) return false;
    if (input.acceptedCategories.length && !input.acceptedCategories.includes(record.category)) return false;
    return true;
  });
}
function getProperty(record, propertyName) {
  return asArray(record.properties).find(property => String(property.name || "").toLowerCase() === String(propertyName || "").toLowerCase());
}
function variableCandidates(factor, records, factors = [], currentOutputId = "") {
  const result = [];
  const counts = new Map();
  for (const input of factor.inputs) {
    const names = new Set([
      ...input.requiredProperties,
      ...eligibleRecords(input, records).flatMap(record => asArray(record.properties).map(property => String(property.name || "").trim()).filter(Boolean))
    ]);
    for (const name of names) counts.set(slug(name), (counts.get(slug(name)) || 0) + 1);
    for (const name of names) {
      result.push({
        token: inputVariable(input.key, name),
        label: `${input.key}.${name}`,
        inputKey: input.key,
        property: name
      });
      if (!name.includes(" ") && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        result.push({ token: `${input.key}.${name}`, label: `${input.key}.${name}`, inputKey: input.key, property: name });
      }
    }
  }
  for (const input of factor.inputs) {
    const names = new Set([
      ...input.requiredProperties,
      ...eligibleRecords(input, records).flatMap(record => asArray(record.properties).map(property => String(property.name || "").trim()).filter(Boolean))
    ]);
    for (const name of names) if (counts.get(slug(name)) === 1 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      result.push({ token: name, label: `${name} (unique property)`, inputKey: input.key, property: name });
    }
  }
  for (const dependency of factor.dependencies) {
    const depended = factors.find(item => item.id === dependency.factorId);
    if (!depended) continue;
    for (const output of depended.outputs) result.push({
      token: dependencyVariable(depended, output),
      label: `${depended.name} → ${output.name}`
    });
  }
  const outputIndex = currentOutputId
    ? factor.outputs.findIndex(output => output.id === currentOutputId)
    : factor.outputs.length;
  const earlierOutputs = outputIndex < 0 ? [] : factor.outputs.slice(0, outputIndex);
  for (const output of earlierOutputs) result.push({ token: resultVariable(output), label: `Earlier result → ${output.name}` });
  const seen = new Set();
  return result.filter(item => {
    const key = item.token.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function buildVariablesForInputs(factor, assignments, rootRoleMap, overrides, factors, stack) {
  const variables = Object.create(null);
  const addShort = [];
  const aliasOccurrences = new Map();
  const propertyRows = [];
  for (const input of factor.inputs) {
    const record = assignments[input.key];
    if (!record) {
      if (input.optional) continue;
      throw new Error(`No record was assigned to input “${input.label}”.`);
    }
    if (input.acceptedTypes.length && !input.acceptedTypes.includes(record.type)) throw new Error(`“${record.name}” has an incompatible type for input “${input.label}”.`);
    if (input.acceptedCategories.length && !input.acceptedCategories.includes(record.category)) throw new Error(`“${record.name}” has an incompatible category for input “${input.label}”.`);
    const rootKey = rootRoleMap[input.key] || input.key;
    const properties = new Map(asArray(record.properties).map(property => [String(property.name).toLowerCase(), { name: String(property.name), value: property.value }]));
    for (const override of overrides) {
      if (override.inputKey !== rootKey) continue;
      const key = override.property.toLowerCase();
      let current = properties.get(key);
      if (!current && override.operation === "set") {
        current = { name: override.property, value: override.amount };
        properties.set(key, current);
        continue;
      }
      if (!current) throw new Error(`Cannot ${override.operation} “${override.property}” for “${record.name}”: the property is missing (use Set to create a temporary value).`);
      const n = numericValue(current.value);
      if (n === null) throw new Error(`Property “${current.name}” on “${record.name}” is not numeric.`);
      if (override.operation === "set") current.value = override.amount;
      else if (override.operation === "add") current.value = n + override.amount;
      else if (override.operation === "subtract") current.value = n - override.amount;
      else if (override.operation === "multiply") current.value = n * override.amount;
      else if (override.operation === "divide") {
        if (override.amount === 0) throw new Error(`Cannot divide “${current.name}” by zero in a temporary scenario.`);
        current.value = n / override.amount;
      }
      if (!Number.isFinite(Number(current.value))) throw new Error(`The temporary value for “${current.name}” is not finite.`);
    }
    const normalizedProps = [...properties.values()];
    for (const name of input.requiredProperties) {
      const property = properties.get(name.toLowerCase());
      if (!property) throw new Error(`Required property “${name}” is missing on “${record.name}”.`);
      if (numericValue(property.value) === null) throw new Error(`Required property “${name}” on “${record.name}” is not numeric.`);
    }
    for (const property of normalizedProps) {
      const value = numericValue(property.value);
      if (value === null) continue;
      const aliases = [inputVariable(input.key, property.name)];
      if (!property.name.includes(" ") && /^[A-Za-z_][A-Za-z0-9_]*$/.test(property.name)) aliases.push(`${input.key}.${property.name}`);
      for (const alias of aliases) addVariable(variables, alias, value);
      propertyRows.push({ inputKey: input.key, name: property.name, value });
      addShort.push({ slug: propertySlug(property.name), original: property.name, value, inputKey: input.key });
    }
  }
  const propertyCounts = new Map();
  addShort.forEach(item => propertyCounts.set(item.slug, (propertyCounts.get(item.slug) || 0) + 1));
  addShort.forEach(item => {
    const alias = /^[A-Za-z_][A-Za-z0-9_]*$/.test(item.original) ? item.original : "";
    if (alias) addVariable(variables, alias, item.value);
  });
  // An unqualified name appearing on more than one input is explicitly ambiguous.
  const byName = new Map();
  propertyRows.forEach(item => {
    const key = slug(item.name);
    const previous = byName.get(key) || new Set();
    previous.add(item.inputKey); byName.set(key, previous);
  });
  for (const [name, keys] of byName.entries()) {
    if (keys.size > 1) variables[name] = AMBIGUOUS;
  }
  return { variables, propertyRows };
}

function executeFactor(factorId, assignments, rootRoleMap, overrides, factors, stack = []) {
  if (stack.includes(factorId)) throw new Error("Circular dependency encountered during calculation.");
  const factor = factors.find(item => item.id === factorId);
  if (!factor) throw new Error("A required factor no longer exists.");
  const { variables } = buildVariablesForInputs(factor, assignments, rootRoleMap, overrides, factors, [...stack, factorId]);
  for (const dependency of factor.dependencies) {
    const depended = factors.find(item => item.id === dependency.factorId);
    if (!depended) throw new Error(`Dependency “${dependency.factorId}” no longer exists.`);
    const depAssignments = {};
    const depRootRoleMap = {};
    for (const depInput of depended.inputs) {
      const parentKey = dependency.bindings[depInput.key];
      if (!parentKey || !assignments[parentKey]) throw new Error(`Dependency “${depended.name}” has no binding for “${depInput.label}”.`);
      depAssignments[depInput.key] = assignments[parentKey];
      depRootRoleMap[depInput.key] = rootRoleMap[parentKey] || parentKey;
    }
    const depResult = executeFactor(depended.id, depAssignments, depRootRoleMap, overrides, factors, [...stack, factorId]);
    for (const output of depended.outputs) {
      const value = depResult[output.id];
      if (value === undefined) throw new Error(`Dependency “${depended.name}” did not produce “${output.name}”.`);
      addVariable(variables, dependencyVariable(depended, output), value);
      // Friendly aliases are useful, but the ID-based alias above remains stable after renames.
      addVariable(variables, `${slug(depended.name)}_${slug(output.name)}`, value);
    }
  }
  const result = Object.create(null);
  const outputNameCounts = new Map();
  factor.outputs.forEach(output => outputNameCounts.set(slug(output.name), (outputNameCounts.get(slug(output.name)) || 0) + 1));
  for (const output of factor.outputs) {
    const ast = parseFormula(output.formula);
    const value = evaluateFormula(ast, variables);
    if (!Number.isFinite(value)) throw new Error(`Output “${output.name}” is not finite.`);
    result[output.id] = value;
    addVariable(variables, resultVariable(output), value);
    if (outputNameCounts.get(slug(output.name)) === 1) addVariable(variables, slug(output.name), value);
  }
  return result;
}

function cartesian(assignments) {
  const keys = Object.keys(assignments);
  let rows = [{}];
  for (const key of keys) {
    const values = assignments[key];
    rows = rows.flatMap(row => values.map(value => ({ ...row, [key]: value })));
  }
  return rows;
}

function styleText() {
  if ($("calculator-style")) return;
  const style = document.createElement("style");
  style.id = "calculator-style";
  style.textContent = `
    #calculator-page{max-width:1500px;margin:0 auto;padding-bottom:34px;color:var(--text,#f5f3f7)}
    .calc-intro{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:22px}
    .calc-backup-actions{justify-content:flex-end;max-width:100%}.calc-backup-actions .calc-btn{white-space:normal}
    @media(max-width:600px){.calc-backup-actions{justify-content:flex-start}.calc-backup-actions .calc-btn{flex:1 1 calc(50% - 8px)}}
    .calc-intro h2{margin:4px 0 7px}.calc-intro p{max-width:760px;margin:0;color:var(--muted)}
    .calc-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 16px;padding:5px;background:var(--panel);border:1px solid var(--border);border-radius:12px;width:fit-content;max-width:100%}
    .calc-tabs button{border:1px solid transparent;background:transparent;color:var(--muted);padding:9px 14px;border-radius:8px}
    .calc-tabs button.active{color:var(--accent);border-color:var(--accent);background:#252130}
    .calc-layout{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(0,1.2fr);gap:14px;align-items:start}
    .calc-panel{min-width:0;padding:17px;background:var(--panel);border:1px solid var(--border);border-radius:13px}
    .calc-panel h3{margin:0 0 12px;font-size:16px}.calc-panel h4{margin:16px 0 8px;font-size:13px}
    .calc-muted{font-size:12px;color:var(--muted);line-height:1.55}
    .calc-field{display:grid;gap:6px;min-width:0;margin:0 0 13px}.calc-field>label,.calc-label{font-size:12px;font-weight:650;color:var(--muted)}
    .calc-field input,.calc-field select,.calc-field textarea,.calc-input-row input,.calc-input-row select,.calc-output-row input,.calc-output-row textarea,.calc-dep-map select,.calc-override-row select,.calc-override-row input{min-width:0;width:100%;max-width:100%;font:inherit;color:var(--text);background:#17181e;border:1px solid var(--border);border-radius:8px;padding:9px 10px;color-scheme:dark}
    .calc-field textarea,.calc-output-row textarea{min-height:88px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;line-height:1.55}
    .calc-field select[multiple],.calc-input-row select[multiple]{min-height:78px;padding:7px;color-scheme:dark}
    .calc-field select option,.calc-input-row select option{background:#17181e;color:var(--text)}
    .calc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.calc-row>*{min-width:0}
    .calc-btn{display:inline-flex;gap:7px;align-items:center;justify-content:center;border:1px solid var(--border);border-radius:8px;padding:9px 12px;font:inherit;font-size:12px;font-weight:650;background:transparent;color:var(--text);cursor:pointer}
    .calc-btn.primary{background:var(--accent);border-color:var(--accent);color:#191620}.calc-btn.danger{color:#ff9ca7;border-color:#703a43}.calc-btn:disabled{opacity:.45;cursor:not-allowed}
    .calc-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.calc-field-grid .calc-field{margin-bottom:9px}
    .calc-input-row,.calc-output-row,.calc-dep-row,.calc-override-row{padding:12px;margin:10px 0;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.09);min-width:0}
    .calc-item-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px}.calc-item-heading strong{font-size:13px}
    .calc-item-heading .calc-btn{padding:6px 8px}.calc-token-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
    .calc-token{font-family:ui-monospace,Consolas,monospace;font-size:11px;padding:6px 8px;background:#292532;border:1px solid #403650;border-radius:7px;color:#d7c8ff;cursor:pointer;max-width:100%;overflow-wrap:anywhere}
    .calc-factor-list{display:grid;gap:9px}.calc-factor-card{padding:13px;border:1px solid var(--border);border-radius:11px;background:rgba(0,0,0,.07)}
    .calc-factor-card h4{margin:0 0 5px;font-size:14px}.calc-factor-card p{margin:0 0 10px}.calc-tag{display:inline-block;font-size:10px;padding:3px 7px;background:#292532;color:#c9baff;border-radius:99px;margin:2px 4px 2px 0}
    .calc-message{padding:11px 12px;margin:10px 0;border:1px solid var(--border);border-radius:9px;font-size:12px;line-height:1.55;overflow-wrap:anywhere}.calc-message.error{border-color:#76404a;background:#2e2025;color:#ffd9dd}.calc-message.success{border-color:#365f50;background:#1c2b27;color:#bdf2d7}.calc-message.warn{border-color:#6a5530;background:#2d281e;color:#f5ddb0}
    .calc-results-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:11px 0}.calc-results-toolbar input,.calc-results-toolbar select{flex:1 1 140px;min-width:0;font:inherit;font-size:12px;color:var(--text);background:#17181e;border:1px solid var(--border);border-radius:8px;padding:9px}
    .calc-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:10px;max-width:100%}.calc-table{width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap}.calc-table th,.calc-table td{padding:10px 11px;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}.calc-table th{position:sticky;top:0;background:#24212d;color:var(--muted);font-weight:650;z-index:1}.calc-table tr:last-child td{border-bottom:0}.calc-table td.calc-error-cell{white-space:normal;min-width:220px;color:#ffafb7;max-width:380px;overflow-wrap:anywhere}.calc-table .calc-extreme-max{background:rgba(63,160,115,.13);color:#a9f0cb}.calc-table .calc-extreme-min{background:rgba(212,156,66,.12);color:#ffdda0}.calc-table .calc-record-name{font-weight:650;white-space:normal;min-width:110px;max-width:240px;overflow-wrap:anywhere}.calc-table .calc-delta{color:#cbbaff}.calc-table .calc-row-error{background:rgba(180,55,75,.07)}
    .calc-columns{display:flex;flex-wrap:wrap;gap:7px 12px;margin:8px 0}.calc-columns label,.calc-inline-check{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--muted)}.calc-columns input,.calc-inline-check input{width:auto;accent-color:var(--accent)}
    .calc-empty{padding:28px 14px;border:1px dashed var(--border);border-radius:11px;color:var(--muted);text-align:center;font-size:13px;line-height:1.6}
    .calc-stat-row{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.calc-stat{flex:1 1 100px;padding:10px;background:#1a1b21;border:1px solid var(--border);border-radius:9px}.calc-stat small{display:block;color:var(--muted);font-size:10px}.calc-stat strong{display:block;margin-top:4px;font-size:20px}
    .calc-wide{grid-column:1/-1}.calc-section-divider{border:0;border-top:1px solid var(--border);margin:16px 0}.calc-subtitle{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:750;margin:4px 0 10px}
    @media(max-width:900px){.calc-layout{grid-template-columns:minmax(0,1fr)}.calc-wide{grid-column:auto}}
    @media(max-width:540px){#calculator-page{padding-bottom:20px}.calc-panel{padding:12px}.calc-field-grid{grid-template-columns:minmax(0,1fr)}.calc-tabs{width:100%}.calc-tabs button{flex:1}.calc-results-toolbar>*{flex:1 1 100%!important}.calc-intro h2{font-size:24px}}
  `;
  document.head.append(style);
}

function ensurePage() {
  if ($("calculator-page")) return $("calculator-page");
  const page = document.createElement("section");
  page.id = "calculator-page";
  page.hidden = true;
  page.innerHTML = `
    <div class="calc-intro">
      <div><p class="eyebrow">PROJECT WORKSPACE</p><h2>Calculator</h2><p>Build reusable factors, combine records and test balance changes without modifying your database.</p></div>
      <div class="calc-row calc-backup-actions"><button type="button" class="calc-btn" data-calc-action="export">Export factors</button><button type="button" class="calc-btn" data-calc-action="import">Import factors</button><button type="button" class="calc-btn primary" data-calc-action="project-export">Export project + factors</button><button type="button" class="calc-btn" data-calc-action="project-import">Import project + factors</button><input type="file" id="calc-import-file" accept="application/json,.json" hidden><input type="file" id="calc-import-project-file" accept="application/json,.json" hidden></div>
    </div>
    <div id="calc-storage-message" hidden></div>
    <div class="calc-tabs" role="tablist" aria-label="Calculator sections">
      <button type="button" class="active" data-calc-tab="run" role="tab" aria-selected="true">Run & Compare</button>
      <button type="button" data-calc-tab="factors" role="tab" aria-selected="false">Factors</button>
    </div>
    <div id="calc-run-pane"></div>
    <div id="calc-factors-pane" hidden></div>
    <div id="calc-notice" aria-live="polite"></div>
  `;
  const main = document.querySelector("main");
  if (!main) throw new Error("RPG Codex main container was not found.");
  main.append(page);
  return page;
}

const state = {
  records: [], factors: [], factorReadError: "", recordsReadError: "",
  selectedFactorId: "", activeTab: "run", editor: null, editorError: "",
  results: [], lastRunAt: null, visibleColumns: {}, sortBy: "", sortDirection: "desc",
  selectedRecordIds: {}, overrideDraft: [], scenarioEnabled: false,
  resultSearch: "", numericFilter: { outputId: "", operator: ">", value: "" },
  highlightMax: true, highlightMin: false
};

function notice(message, kind = "info") {
  const node = $("calc-notice");
  if (!node) return;
  if (!message) { node.innerHTML = ""; return; }
  node.innerHTML = `<div class="calc-message ${kind === "error" ? "error" : kind === "success" ? "success" : kind === "warn" ? "warn" : ""}">${escapeHTML(message)}</div>`;
}
function refreshRecords() {
  try {
    state.records = readCurrentRecords();
    state.recordsReadError = "";
  } catch (error) {
    state.records = [];
    state.recordsReadError = error.message || "Records could not be read safely.";
  }
}
function refreshFactorStatus() {
  try {
    state.factors = readFactors();
    state.factorReadError = "";
  } catch (error) {
    state.factors = [];
    state.factorReadError = error.message || "Factors could not be read safely.";
  }
}
function persistFactors(next) {
  if (state.factorReadError) {
    notice("Saving is blocked because the existing factor data could not be read safely. Export or preserve the browser data before investigating.", "error");
    return false;
  }
  const rawKey = getScopedStorageKey(FACTORS_KEY);
  let before;
  try { before = localStorage.getItem(rawKey); }
  catch (error) { notice(`Could not access local storage: ${error.message}`, "error"); return false; }
  try {
    localStorage.setItem(rawKey, JSON.stringify(next));
    state.factors = next;
    return true;
  } catch (error) {
    try {
      if (before === null) localStorage.removeItem(rawKey);
      else localStorage.setItem(rawKey, before);
    } catch (rollbackError) { console.error("Calculator factor write rollback failed.", rollbackError); }
    notice(`Could not save factors. The previous data was preserved where possible. ${error.message}`, "error");
    return false;
  }
}
function getFactor(id = state.selectedFactorId) { return state.factors.find(factor => factor.id === id) || null; }
function getRecord(id) { return state.records.find(record => record.id === id) || null; }
function setTab(tab) {
  state.activeTab = tab === "factors" ? "factors" : "run";
  const page = $("calculator-page");
  if (!page) return;
  page.querySelectorAll("[data-calc-tab]").forEach(button => {
    const active = button.dataset.calcTab === state.activeTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("calc-run-pane").hidden = state.activeTab !== "run";
  $("calc-factors-pane").hidden = state.activeTab !== "factors";
}
function showPage() {
  ["home", "detail", "editor"].forEach(id => { const section = $(id); if (section) section.hidden = true; });
  $("calculator-page").hidden = false;
  const button = $("nav-calculator");
  button?.classList.add("active");
  button?.setAttribute("aria-current", "page");
  ["nav-dashboard", "nav-records"].forEach(id => {
    $(id)?.classList.remove("active");
    $(id)?.removeAttribute("aria-current");
  });
  setTab(state.activeTab);
  refreshRecords();
  refreshFactorStatus();
  renderAll();
}
function hidePage() {
  const page = $("calculator-page");
  if (page) page.hidden = true;
  $("nav-calculator")?.classList.remove("active");
  $("nav-calculator")?.removeAttribute("aria-current");
}
function installNavigation() {
  const nav = $("top-page-nav");
  if (!nav || $("nav-calculator")) return;
  const button = document.createElement("button");
  button.id = "nav-calculator";
  button.type = "button";
  button.className = "nav-button";
  button.title = "Calculator";
  button.setAttribute("aria-label", "Calculator");
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 7h8M8 11h2m4 0h2M8 15h2m4 0h2M8 18h2m4 0h2"></path></svg>`;
  nav.append(button);
  button.addEventListener("click", showPage);
  // Other app navigation is owned by app.js. Hide this page before its handler runs.
  document.addEventListener("click", event => {
    const target = event.target.closest("button");
    if (target && ["nav-dashboard", "nav-records"].includes(target.id)) hidePage();
  }, true);
}

function exampleFactor() {
  return normalizeFactor({
    id: makeId("factor"), name: "Effective Damage (example)",
    description: "Illustrative damage reduction formula. Adapt it to your game's real combat rules.",
    inputs: [
      { id: makeId("input"), key: "attacker", label: "Attacker / weapon", role: "attacker", acceptedTypes: ["Item"], acceptedCategories: [], requiredProperties: ["Damage"] },
      { id: makeId("input"), key: "target", label: "Target / mob", role: "target", acceptedTypes: ["Mob"], acceptedCategories: [], requiredProperties: ["Armor"] }
    ],
    outputs: [{ id: makeId("output"), name: "Damage", formula: "attacker_damage * (100 / (100 + 2.5 * target_armor))" }],
    dependencies: []
  });
}
function renderAll() {
  if (!$("calculator-page")) return;
  renderStorageMessage();
  renderFactorList();
  renderRunPane();
  renderFactorEditor();
  setTab(state.activeTab);
}
function renderStorageMessage() {
  const node = $("calc-storage-message");
  if (!node) return;
  const messages = [];
  if (state.recordsReadError) messages.push(`<div class="calc-message error">${escapeHTML(state.recordsReadError)}</div>`);
  if (state.factorReadError) messages.push(`<div class="calc-message error">${escapeHTML(state.factorReadError)} Factor edits are disabled so the existing data is not overwritten.</div>`);
  node.innerHTML = messages.join("");
  node.hidden = !messages.length;
}

function renderFactorList() {
  const pane = $("calc-factors-pane");
  if (!pane) return;
  const cards = state.factors.map(factor => `
    <article class="calc-factor-card">
      <div class="calc-item-heading"><div><h4>${escapeHTML(factor.name)}</h4><p class="calc-muted">${escapeHTML(factor.description || "No description.")}</p></div><span class="calc-tag">${factor.inputs.length} input${factor.inputs.length === 1 ? "" : "s"}</span></div>
      <div>${factor.outputs.map(output => `<span class="calc-tag">${escapeHTML(output.name)}</span>`).join("")}${factor.dependencies.length ? `<span class="calc-tag">${factor.dependencies.length} dependenc${factor.dependencies.length === 1 ? "y" : "ies"}</span>` : ""}</div>
      <div class="calc-row" style="margin-top:11px"><button class="calc-btn primary" type="button" data-factor-action="run" data-factor-id="${escapeHTML(factor.id)}">Use factor</button><button class="calc-btn" type="button" data-factor-action="edit" data-factor-id="${escapeHTML(factor.id)}">Edit</button><button class="calc-btn" type="button" data-factor-action="duplicate" data-factor-id="${escapeHTML(factor.id)}">Duplicate</button><button class="calc-btn danger" type="button" data-factor-action="delete" data-factor-id="${escapeHTML(factor.id)}">Delete</button></div>
    </article>`).join("");
  pane.innerHTML = `
    <div class="calc-layout">
      <div class="calc-panel"><h3>Factor library</h3><p class="calc-muted">Factors are saved within the active project. Use stable inputs and named outputs to reuse formulas in different tests.</p><div class="calc-row"><button class="calc-btn primary" type="button" data-calc-action="new-factor" ${state.factorReadError ? "disabled" : ""}>＋ New factor</button><button class="calc-btn" type="button" data-calc-action="example-factor" ${state.factorReadError ? "disabled" : ""}>Create damage example</button></div>${state.factors.length ? `<div class="calc-factor-list" style="margin-top:14px">${cards}</div>` : `<div class="calc-empty" style="margin-top:14px">No factors yet.<br>Create your first factor, or start with the illustrative damage formula.</div>`}</div>
      <div class="calc-panel"><h3>Design guidelines</h3><div class="calc-subtitle">Inputs</div><p class="calc-muted">Each input has a variable key, a descriptive label, an optional accepted record type/category filter, required numeric properties and an optional-input switch. A single selected record stays fixed during mass calculations.</p><div class="calc-subtitle">Outputs</div><p class="calc-muted">Create one or more named outputs. Outputs are calculated from top to bottom; later outputs can reference earlier ones with the suggested <code>result_…</code> token.</p><div class="calc-subtitle">Dependencies</div><p class="calc-muted">A factor can depend on other factors and map each dependency input to one of its own inputs. Circular dependencies are blocked.</p><div class="calc-subtitle">Safety</div><p class="calc-muted">Only arithmetic expressions and the listed math functions are interpreted. Factor formulas cannot run JavaScript, access the network or modify source records.</p></div>
      <div id="calc-factor-editor" class="calc-panel calc-wide" hidden></div>
    </div>`;
}

function multiOptions(options, selected = []) {
  const set = new Set(asArray(selected).map(String));
  return options.map(value => `<option value="${escapeHTML(value)}" ${set.has(String(value)) ? "selected" : ""}>${escapeHTML(value)}</option>`).join("");
}
function renderFactorEditor() {
  const container = $("calc-factor-editor");
  if (!container) return;
  const factor = state.editor;
  if (!factor) { container.hidden = true; container.innerHTML = ""; return; }
  const types = [...new Set([...typeNames(state.records), ...factor.inputs.flatMap(input => input.acceptedTypes)])].sort((a, b) => a.localeCompare(b));
  const categories = [...new Set([...categoryNames(state.records), ...factor.inputs.flatMap(input => input.acceptedCategories)])].sort((a, b) => a.localeCompare(b));
  const props = [...new Set([...propertyNames(state.records), ...factor.inputs.flatMap(input => input.requiredProperties)])].sort((a, b) => a.localeCompare(b));
  const inputHTML = factor.inputs.map((input, index) => `
    <div class="calc-input-row" data-calc-input-row data-input-id="${escapeHTML(input.id)}">
      <div class="calc-item-heading"><strong>Input ${index + 1}</strong><button type="button" class="calc-btn danger" data-calc-action="remove-input" data-input-id="${escapeHTML(input.id)}">Remove</button></div>
      <div class="calc-field-grid">
        <div class="calc-field"><label>Variable key</label><input data-input-key value="${escapeHTML(input.key)}" maxlength="36" placeholder="attacker"></div>
        <div class="calc-field"><label>Display name</label><input data-input-label value="${escapeHTML(input.label)}" maxlength="70" placeholder="Attacker / weapon"></div>
        <div class="calc-field"><label>Role</label><select data-input-role>${["attacker", "target", "context", "other"].map(role => `<option value="${role}" ${role === input.role ? "selected" : ""}>${role[0].toUpperCase() + role.slice(1)}</option>`).join("")}</select><label class="calc-inline-check"><input type="checkbox" data-input-optional ${input.optional ? "checked" : ""}> Optional input</label></div>
        <div class="calc-field"><label>Accepted record types <span class="calc-muted">(empty = any)</span></label><select multiple data-input-types>${multiOptions(types, input.acceptedTypes)}</select></div>
        <div class="calc-field"><label>Accepted categories <span class="calc-muted">(empty = any)</span></label><select multiple data-input-categories>${multiOptions(categories, input.acceptedCategories)}</select></div>
        <div class="calc-field"><label>Required numeric properties</label><select multiple data-input-required>${multiOptions(props, input.requiredProperties)}</select></div>
      </div>
    </div>`).join("");
  const outputHTML = factor.outputs.map((output, index) => {
    const tokens = variableCandidates(factor, state.records, state.factors, output.id);
    return `<div class="calc-output-row" data-calc-output-row data-output-id="${escapeHTML(output.id)}">
      <div class="calc-item-heading"><strong>Output ${index + 1}</strong>${factor.outputs.length > 1 ? `<button type="button" class="calc-btn danger" data-calc-action="remove-output" data-output-id="${escapeHTML(output.id)}">Remove</button>` : ""}</div>
      <div class="calc-field"><label>Result name</label><input data-output-name value="${escapeHTML(output.name)}" maxlength="60" placeholder="Damage"></div>
      <div class="calc-field"><label>Formula</label><textarea data-output-formula spellcheck="false" placeholder="attacker_damage * (100 / (100 + 2.5 * target_armor))">${escapeHTML(output.formula)}</textarea><div class="calc-muted">Click a variable to insert it into the formula. Results above this one can be reused.</div><div class="calc-token-list">${tokens.map(token => `<button class="calc-token" type="button" data-insert-token="${escapeHTML(token.token)}" title="Insert ${escapeHTML(token.label)}">${escapeHTML(token.token)}</button>`).join("") || `<span class="calc-muted">Add inputs and choose properties to populate the variable list.</span>`}</div><div class="calc-token-list">${Object.keys(ALLOWED_FUNCTIONS).map(fn => `<button class="calc-token" type="button" data-insert-token="${fn}()">${fn}()</button>`).join("")}</div></div>
    </div>`;
  }).join("");
  const otherFactors = state.factors.filter(item => item.id !== factor.id && !factor.dependencies.some(dep => dep.factorId === item.id));
  const depsHTML = factor.dependencies.map(dependency => {
    const depended = state.factors.find(item => item.id === dependency.factorId);
    if (!depended) return `<div class="calc-message error">A referenced factor no longer exists.</div>`;
    return `<div class="calc-dep-row" data-calc-dep-row data-dep-id="${escapeHTML(depended.id)}"><div class="calc-item-heading"><strong>${escapeHTML(depended.name)}</strong><button class="calc-btn danger" type="button" data-calc-action="remove-dependency" data-dep-id="${escapeHTML(depended.id)}">Remove</button></div>${depended.inputs.map(depInput => `<div class="calc-field"><label>Map “${escapeHTML(depInput.label)}” to</label><select data-dep-bind="${escapeHTML(depInput.key)}"><option value="">Choose this factor's input…</option>${factor.inputs.map(input => `<option value="${escapeHTML(input.key)}" ${dependency.bindings[depInput.key] === input.key ? "selected" : ""}>${escapeHTML(input.label)} (${escapeHTML(input.key)})</option>`).join("")}</select></div>`).join("")}</div>`;
  }).join("");
  container.hidden = false;
  container.innerHTML = `
    <div class="calc-item-heading"><div><p class="eyebrow">FACTOR EDITOR</p><h3>${factor.id && state.factors.some(item => item.id === factor.id) ? "Edit factor" : "Create factor"}</h3></div><button type="button" class="calc-btn" data-calc-action="close-editor">Close</button></div>
    ${state.editorError ? `<div class="calc-message error">${escapeHTML(state.editorError)}</div>` : ""}
    <form id="calc-factor-form">
      <div class="calc-field-grid"><div class="calc-field"><label for="calc-factor-name">Name</label><input id="calc-factor-name" data-factor-name required maxlength="100" value="${escapeHTML(factor.name)}"></div><div class="calc-field"><label for="calc-factor-description">Description</label><input id="calc-factor-description" data-factor-description maxlength="240" value="${escapeHTML(factor.description)}"></div></div>
      <hr class="calc-section-divider"><div class="calc-item-heading"><h4>Inputs</h4><button type="button" class="calc-btn" data-calc-action="add-input">＋ Add input</button></div>${inputHTML}
      <hr class="calc-section-divider"><div class="calc-item-heading"><h4>Outputs and formulas</h4><button type="button" class="calc-btn" data-calc-action="add-output">＋ Add output</button></div><p class="calc-muted">Operators: + − × ÷ ^ and parentheses. Functions: ${Object.keys(ALLOWED_FUNCTIONS).join(", ")}. Percentages are stored as fractions (20% = 0.2), so use 1 + Bonus to apply a 20% bonus when Bonus = 0.2.</p>${outputHTML}
      <hr class="calc-section-divider"><div class="calc-item-heading"><h4>Dependencies</h4><div class="calc-row"><select id="calc-new-dependency" ${otherFactors.length ? "" : "disabled"} style="max-width:240px">${otherFactors.length ? otherFactors.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("") : `<option value="">No available factors</option>`}</select><button class="calc-btn" type="button" data-calc-action="add-dependency" ${otherFactors.length ? "" : "disabled"}>＋ Add</button></div></div><p class="calc-muted">Dependency outputs use an ID-based variable token shown in the formula suggestions. Every dependency input must map to one of this factor’s inputs.</p>${depsHTML || `<p class="calc-muted">No dependencies added.</p>`}
      <div class="calc-row" style="margin-top:15px"><button type="submit" class="calc-btn primary">Save factor</button><button type="button" class="calc-btn" data-calc-action="close-editor">Cancel</button></div>
    </form>`;
}

function newFactorDraft() {
  return normalizeFactor({ id: makeId("factor"), name: "New factor", description: "", inputs: [
    { id: makeId("input"), key: "attacker", label: "Attacker", role: "attacker", acceptedTypes: [], acceptedCategories: [], requiredProperties: [] },
    { id: makeId("input"), key: "target", label: "Target", role: "target", acceptedTypes: [], acceptedCategories: [], requiredProperties: [] }
  ], outputs: [{ id: makeId("output"), name: "Result", formula: "1" }], dependencies: [] });
}
function readEditorForm() {
  const container = $("calc-factor-editor");
  if (!container || !state.editor) return state.editor;
  const factor = clone(state.editor);
  factor.name = container.querySelector("[data-factor-name]")?.value ?? factor.name;
  factor.description = container.querySelector("[data-factor-description]")?.value ?? factor.description;
  factor.inputs = [...container.querySelectorAll("[data-calc-input-row]")].map(row => ({
    id: row.dataset.inputId || makeId("input"),
    key: row.querySelector("[data-input-key]")?.value.trim() || "",
    label: row.querySelector("[data-input-label]")?.value.trim() || "",
    role: row.querySelector("[data-input-role]")?.value || "other",
    optional: row.querySelector("[data-input-optional]")?.checked ?? false,
    acceptedTypes: [...(row.querySelector("[data-input-types]")?.selectedOptions || [])].map(option => option.value),
    acceptedCategories: [...(row.querySelector("[data-input-categories]")?.selectedOptions || [])].map(option => option.value),
    requiredProperties: [...(row.querySelector("[data-input-required]")?.selectedOptions || [])].map(option => option.value)
  }));
  factor.inputs.forEach((input, index) => { if (!input.id) input.id = state.editor.inputs[index]?.id || makeId("input"); });
  factor.outputs = [...container.querySelectorAll("[data-calc-output-row]")].map(row => ({
    id: row.dataset.outputId || makeId("output"),
    name: row.querySelector("[data-output-name]")?.value.trim() || "",
    formula: row.querySelector("[data-output-formula]")?.value ?? ""
  }));
  factor.dependencies = [...container.querySelectorAll("[data-calc-dep-row]")].map(row => ({
    factorId: row.dataset.depId,
    bindings: Object.fromEntries([...row.querySelectorAll("[data-dep-bind]")].map(select => [select.dataset.depBind, select.value]))
  }));
  return factor;
}

function renderRunPane() {
  const pane = $("calc-run-pane");
  if (!pane) return;
  const factor = getFactor();
  if (state.recordsReadError) {
    pane.innerHTML = `<div class="calc-panel"><h3>Cannot calculate yet</h3><div class="calc-message error">${escapeHTML(state.recordsReadError)}</div><p class="calc-muted">Reload the app after resolving the records issue. The calculator will not substitute example data for unreadable saved records.</p></div>`;
    return;
  }
  if (!state.factors.length) {
    pane.innerHTML = `<div class="calc-panel"><div class="calc-empty"><strong>Start with a reusable factor.</strong><br>Create a factor for damage, DPS, healing, mitigation or another calculation, then compare it against your records.<br><div class="calc-row" style="justify-content:center;margin-top:13px"><button class="calc-btn primary" type="button" data-calc-action="new-factor">＋ Create factor</button><button class="calc-btn" type="button" data-calc-action="example-factor">Create damage example</button></div></div></div>`;
    return;
  }
  if (!factor) {
    state.selectedFactorId = state.factors[0].id;
    return renderRunPane();
  }
  const options = state.factors.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === factor.id ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("");
  const inputsHtml = factor.inputs.map(input => {
    const allowed = eligibleRecords(input, state.records);
    const selectedIds = state.selectedRecordIds?.[input.key] || [];
    return `<div class="calc-field"><label>${escapeHTML(input.label)} <span class="calc-muted">(${escapeHTML(input.key)}${input.optional ? ", optional" : ""})</span></label><select multiple size="5" data-run-input="${escapeHTML(input.key)}" aria-label="Select records for ${escapeHTML(input.label)}">${allowed.map(record => `<option value="${escapeHTML(record.id)}" ${selectedIds.includes(record.id) ? "selected" : ""}>${escapeHTML(record.name)} · ${escapeHTML(record.type)}${record.category ? ` · ${escapeHTML(record.category)}` : ""}</option>`).join("")}</select><span class="calc-muted">${allowed.length} compatible record(s). ${input.optional ? "Leave empty to omit this input, select one to keep it fixed, or multiple to compare." : "Select one to keep this input fixed, or multiple to compare."}</span></div>`;
  }).join("");
  const overrideRows = renderOverrideRows(factor);
  const outputs = factor.outputs;
  const resultColumns = [
    ...factor.inputs.map(input => ({ key: `record:${input.key}`, label: input.label })),
    ...outputs.map(output => ({ key: `output:${output.id}`, label: output.name }))
  ];
  const columnControls = resultColumns.map(column => `<label><input type="checkbox" data-column-key="${escapeHTML(column.key)}" ${state.visibleColumns[column.key] !== false ? "checked" : ""}> ${escapeHTML(column.label)}</label>`).join("");
  const sortOptions = `<option value="">Original combination order</option>${factor.inputs.map(input => `<option value="record:${escapeHTML(input.key)}" ${state.sortBy === `record:${input.key}` ? "selected" : ""}>${escapeHTML(input.label)}</option>`).join("")}${outputs.map(output => `<option value="output:${escapeHTML(output.id)}" ${state.sortBy === `output:${output.id}` ? "selected" : ""}>${escapeHTML(output.name)}</option>`).join("")}`;
  pane.innerHTML = `
    <div class="calc-layout">
      <div class="calc-panel">
        <h3>Set up a calculation</h3><div class="calc-field"><label for="calc-run-factor">Factor</label><select id="calc-run-factor">${options}</select></div>
        <p class="calc-muted">${escapeHTML(factor.description || "Choose records for each input. Their current properties are read without changing the source records.")}</p>
        <div class="calc-subtitle">Inputs and records</div>${inputsHtml}
        <div class="calc-subtitle">Combination mode</div><div class="calc-field"><label for="calc-combination-mode">How to combine selected records</label><select id="calc-combination-mode"><option value="cartesian">All possible combinations (cartesian)</option><option value="position">Pair lists by position</option></select></div>
        <div class="calc-muted">Cartesian example: 10 weapons × 5 mobs = 50 calculations. In pair-by-position mode, list lengths must match or be 1 (a single selection is broadcast).</div>
        <hr class="calc-section-divider"><div class="calc-item-heading"><h4 style="margin:0">Temporary scenario</h4><label class="calc-inline-check"><input type="checkbox" id="calc-scenario-enabled" ${state.scenarioEnabled ? "checked" : ""}> Compare modified values</label></div>
        <p class="calc-muted">Overrides affect only this run. The original record values are never edited.</p>
        <div id="calc-overrides" ${state.scenarioEnabled ? "" : "hidden"}><div id="calc-overrides-body">${overrideRows}</div><button type="button" class="calc-btn" data-calc-action="add-override">＋ Add modifier</button></div>
        <div class="calc-row" style="margin-top:17px"><button type="button" class="calc-btn primary" data-calc-action="run-calculation">▶ Run calculation</button><button type="button" class="calc-btn" data-calc-action="clear-results">Clear results</button></div>
      </div>
      <div class="calc-panel">
        <div class="calc-item-heading"><h3 style="margin:0">Results</h3><span class="calc-tag">${state.results.length ? `${state.results.length} row(s)` : "No run yet"}</span></div>
        ${state.results.length ? `<div class="calc-stat-row"><div class="calc-stat"><small>COMBINATIONS</small><strong>${state.results.length}</strong></div><div class="calc-stat"><small>SUCCESSFUL</small><strong>${state.results.filter(row => !row.baseError && !row.scenarioError).length}</strong></div><div class="calc-stat"><small>WITH ERRORS</small><strong>${state.results.filter(row => row.baseError || row.scenarioError).length}</strong></div></div>` : `<div class="calc-empty">Choose inputs and run a calculation. Each combination gets its own row, so an error in one row does not hide successful results.</div>`}
        <div class="calc-results-toolbar"><input id="calc-results-search" type="search" placeholder="Filter by record name or error…" value="${escapeHTML(state.resultSearch)}"><select id="calc-results-sort" aria-label="Sort results">${sortOptions}</select><button type="button" class="calc-btn" data-calc-action="sort-direction">${state.sortDirection === "asc" ? "↑ Ascending" : "↓ Descending"}</button></div>
        <details><summary class="calc-muted" style="cursor:pointer">Configure columns and highlights</summary><div class="calc-columns" style="margin-top:10px">${columnControls}</div><div class="calc-row"><label class="calc-inline-check"><input type="checkbox" id="calc-highlight-max" ${state.highlightMax ? "checked" : ""}> Highlight maximum</label><label class="calc-inline-check"><input type="checkbox" id="calc-highlight-min" ${state.highlightMin ? "checked" : ""}> Highlight minimum</label></div></details>
        <div class="calc-results-toolbar"><select id="calc-filter-output"><option value="">No numeric filter</option>${outputs.map(output => `<option value="${escapeHTML(output.id)}" ${state.numericFilter.outputId === output.id ? "selected" : ""}>${escapeHTML(output.name)}</option>`).join("")}</select><select id="calc-filter-operator"><option value=">" ${state.numericFilter.operator === ">" ? "selected" : ""}>greater than</option><option value=">=" ${state.numericFilter.operator === ">=" ? "selected" : ""}>at least</option><option value="<" ${state.numericFilter.operator === "<" ? "selected" : ""}>less than</option><option value="<=" ${state.numericFilter.operator === "<=" ? "selected" : ""}>at most</option><option value="=" ${state.numericFilter.operator === "=" ? "selected" : ""}>equal to</option></select><input type="number" step="any" id="calc-filter-value" value="${escapeHTML(state.numericFilter.value)}" placeholder="Threshold"></div>
        <div id="calc-results-table"></div><p class="calc-muted" style="margin-top:9px">Percentages are handled as fractions in formulas. Display values are rounded to 6 decimal places; stored records remain unchanged.</p>
      </div>
    </div>`;
  renderResultsTable();
}

function renderOverrideRows(factor) {
  const overrides = state.overrideDraft || [];
  const propOptions = [...new Set([
    ...propertyNames(state.records),
    ...factor.inputs.flatMap(input => input.requiredProperties)
  ])].sort((a, b) => a.localeCompare(b));
  return overrides.map((override, index) => `<div class="calc-override-row" data-override-row>
    <div class="calc-item-heading"><strong>Modifier ${index + 1}</strong><button type="button" class="calc-btn danger" data-calc-action="remove-override" data-override-index="${index}">Remove</button></div>
    <div class="calc-field-grid"><div class="calc-field"><label>Input role</label><select data-override-input>${factor.inputs.map(input => `<option value="${escapeHTML(input.key)}" ${override.inputKey === input.key ? "selected" : ""}>${escapeHTML(input.label)} (${escapeHTML(input.key)})</option>`).join("")}</select></div>
    <div class="calc-field"><label>Property</label><select data-override-property>${multiOptions(propOptions, [override.property])}</select></div>
    <div class="calc-field"><label>Operation</label><select data-override-operation><option value="set" ${override.operation === "set" ? "selected" : ""}>Set value</option><option value="add" ${override.operation === "add" ? "selected" : ""}>Add amount</option><option value="subtract" ${override.operation === "subtract" ? "selected" : ""}>Subtract amount</option><option value="multiply" ${override.operation === "multiply" ? "selected" : ""}>Multiply by</option><option value="divide" ${override.operation === "divide" ? "selected" : ""}>Divide by</option></select></div>
    <div class="calc-field"><label>Value</label><input data-override-amount type="number" step="any" value="${escapeHTML(override.amount)}"></div></div>
  </div>`).join("");
}
function readOverrides() {
  const body = $("calc-overrides-body");
  if (!body) return [];
  return [...body.querySelectorAll("[data-override-row]")].map(row => {
    const amountRaw = row.querySelector("[data-override-amount]")?.value;
    if (String(amountRaw ?? "").trim() === "") throw new Error("Every temporary modifier needs a numeric value.");
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount)) throw new Error("Every temporary modifier needs a finite numeric value.");
    const property = row.querySelector("[data-override-property]")?.value || "";
    if (!property) throw new Error("Choose a property for each temporary modifier.");
    return {
      inputKey: row.querySelector("[data-override-input]")?.value || "",
      property,
      operation: row.querySelector("[data-override-operation]")?.value || "set",
      amount
    };
  });
}
function selectedInputRecords(factor) {
  const selections = {};
  const countEl = $("calc-run-pane");
  for (const input of factor.inputs) {
    const select = countEl.querySelector(`[data-run-input="${CSS.escape(input.key)}"]`);
    const ids = select ? [...select.selectedOptions].map(option => option.value) : [];
    if (!ids.length) {
      if (input.optional) { selections[input.key] = [null]; continue; }
      throw new Error(`Select at least one record for “${input.label}”.`);
    }
    const byId = new Map(state.records.map(record => [record.id, record]));
    selections[input.key] = ids.map(id => byId.get(id)).filter(Boolean);
    if (selections[input.key].length !== ids.length) throw new Error(`One of the selected records for “${input.label}” no longer exists. Refresh the calculator and try again.`);
  }
  return selections;
}
function executeBatch() {
  refreshRecords();
  if (state.recordsReadError) throw new Error(state.recordsReadError);
  const factor = getFactor();
  if (!factor) throw new Error("Choose or create a factor first.");
  const selections = selectedInputRecords(factor);
  const mode = $("calc-combination-mode")?.value || "cartesian";
  let combos;
  if (mode === "position") {
    const lengths = Object.values(selections).map(rows => rows.length).filter(length => length > 1);
    const distinct = [...new Set(lengths)];
    if (distinct.length > 1) throw new Error("Pair-by-position requires the selected lists to have the same length, or one list to contain only one fixed record.");
    const count = distinct[0] || 1;
    if (count > 5000) throw new Error(`This run would create ${count.toLocaleString()} combinations. The initial limit is 5,000 per run.`);
    combos = Array.from({ length: count }, (_, index) => Object.fromEntries(Object.entries(selections).map(([key, rows]) => [key, rows.length === 1 ? rows[0] : rows[index]])));
  } else {
    const total = Object.values(selections).reduce((product, rows) => product * rows.length, 1);
    if (total > 5000) throw new Error(`This run would create ${total.toLocaleString()} combinations. The initial limit is 5,000 per run.`);
    combos = cartesian(selections);
  }
  if (combos.length > 5000) throw new Error(`This run would create ${combos.length.toLocaleString()} combinations. The initial limit is 5,000 per run.`);
  if (combos.length > 500 && !confirm(`This run will calculate ${combos.length.toLocaleString()} combinations and may take a moment. Continue?`)) return null;
  const overrides = $("calc-scenario-enabled")?.checked ? readOverrides() : [];
  const rows = [];
  const factorMap = state.factors;
  combos.forEach((assignments, index) => {
    const rootMap = Object.fromEntries(factor.inputs.map(input => [input.key, input.key]));
    const row = { index: index + 1, hasScenario: overrides.length > 0, assignments: Object.fromEntries(Object.entries(assignments).map(([key, record]) => [key, record ? record.id : null])), base: null, scenario: null, baseError: "", scenarioError: "" };
    try { row.base = executeFactor(factor.id, assignments, rootMap, [], factorMap); }
    catch (error) { row.baseError = error.message || String(error); }
    if (overrides.length) {
      try { row.scenario = executeFactor(factor.id, assignments, rootMap, overrides, factorMap); }
      catch (error) { row.scenarioError = error.message || String(error); }
    }
    rows.push(row);
  });
  state.results = rows;
  state.lastRunAt = new Date().toISOString();
  state.visibleColumns = Object.fromEntries([
    ...factor.inputs.map(input => [`record:${input.key}`, state.visibleColumns[`record:${input.key}`] !== false]),
    ...factor.outputs.map(output => [`output:${output.id}`, state.visibleColumns[`output:${output.id}`] !== false])
  ]);
  if (overrides.length) state.scenarioEnabled = true;
  state.resultSearch = $("calc-results-search")?.value || state.resultSearch;
  notice(`Calculated ${rows.length} combination(s). ${rows.filter(row => row.baseError || row.scenarioError).length} row(s) contain errors; other combinations were processed independently.`, rows.some(row => row.baseError || row.scenarioError) ? "warn" : "success");
  return rows;
}

function resultRowsVisible() {
  const factor = getFactor();
  let rows = [...state.results];
  const query = String(state.resultSearch || "").trim().toLowerCase();
  if (query) rows = rows.filter(row => {
    const text = [row.baseError, row.scenarioError, ...factor.inputs.map(input => getRecord(row.assignments[input.key])?.name || "")].join(" ").toLowerCase();
    return text.includes(query);
  });
  const filter = state.numericFilter;
  if (filter.outputId && String(filter.value).trim() !== "") {
    const threshold = Number(filter.value);
    if (Number.isFinite(threshold)) rows = rows.filter(row => {
      const source = row.scenario || row.base;
      const value = source?.[filter.outputId];
      if (typeof value !== "number") return false;
      switch (filter.operator) {
        case ">": return value > threshold;
        case ">=": return value >= threshold;
        case "<": return value < threshold;
        case "<=": return value <= threshold;
        case "=": return value === threshold;
        default: return true;
      }
    });
  }
  if (state.sortBy) {
    const [kind, key] = state.sortBy.split(":");
    rows.sort((a, b) => {
      let av, bv;
      if (kind === "record") {
        av = getRecord(a.assignments[key])?.name || (a.assignments[key] ? "[record missing]" : "");
        bv = getRecord(b.assignments[key])?.name || (b.assignments[key] ? "[record missing]" : "");
        return state.sortDirection === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      av = (a.scenario || a.base)?.[key]; bv = (b.scenario || b.base)?.[key];
      if (typeof av !== "number" && typeof bv !== "number") return a.index - b.index;
      if (typeof av !== "number") return 1;
      if (typeof bv !== "number") return -1;
      return state.sortDirection === "asc" ? av - bv : bv - av;
    });
  }
  return rows;
}
function renderResultsTable() {
  const host = $("calc-results-table");
  if (!host) return;
  const factor = getFactor();
  if (!factor || !state.results.length) { host.innerHTML = ""; return; }
  const rows = resultRowsVisible();
  const inputs = factor.inputs.filter(input => state.visibleColumns[`record:${input.key}`] !== false);
  const outputs = factor.outputs.filter(output => state.visibleColumns[`output:${output.id}`] !== false);
  const comparableOutputs = factor.outputs;
  const summaryValues = new Map();
  for (const output of comparableOutputs) {
    const values = rows.map(row => (row.hasScenario ? row.scenario : row.base)?.[output.id]).filter(value => typeof value === "number" && Number.isFinite(value));
    if (values.length) summaryValues.set(output.id, { min: Math.min(...values), max: Math.max(...values) });
  }
  const head = [
    ...inputs.map(input => `<th>${escapeHTML(input.label)}</th>`),
    ...outputs.flatMap(output => state.results.some(row => row.hasScenario) ? [`<th>${escapeHTML(output.name)} · base</th>`,`<th>${escapeHTML(output.name)} · test</th>`,`<th>Δ ${escapeHTML(output.name)}</th>`,`<th>Δ %</th>`] : [`<th>${escapeHTML(output.name)}</th>`]),
    `<th>Status / error</th>`
  ].join("");
  const body = rows.map(row => {
    const errors = [row.baseError ? `Base: ${row.baseError}` : "", row.scenarioError ? `Scenario: ${row.scenarioError}` : ""].filter(Boolean);
    const isError = errors.length > 0;
    const cells = inputs.map(input => {
      const recordId = row.assignments[input.key];
      const recordName = getRecord(recordId)?.name || (recordId ? "[record missing]" : "— (optional)");
      return `<td class="calc-record-name">${escapeHTML(recordName)}</td>`;
    });
    for (const output of outputs) {
      const base = row.base?.[output.id];
      const scenario = row.scenario?.[output.id];
      const shown = typeof scenario === "number" ? scenario : base;
      const range = summaryValues.get(output.id);
      const maxClass = state.highlightMax && range && shown === range.max ? "calc-extreme-max" : "";
      const minClass = state.highlightMin && range && shown === range.min ? "calc-extreme-min" : "";
      if (state.results.some(item => item.hasScenario)) {
        const delta = typeof base === "number" && typeof scenario === "number" ? scenario - base : null;
        const percent = typeof delta === "number" && base !== 0 ? delta / base * 100 : null;
        cells.push(`<td>${formatNumber(base)}</td><td class="${maxClass} ${minClass}">${formatNumber(scenario)}</td><td class="calc-delta">${delta === null ? "—" : `${delta > 0 ? "+" : ""}${formatNumber(delta)}`}</td><td>${percent === null ? "—" : `${percent > 0 ? "+" : ""}${formatNumber(percent)}%`}</td>`);
      } else cells.push(`<td class="${maxClass} ${minClass}">${formatNumber(base)}</td>`);
    }
    cells.push(`<td class="${isError ? "calc-error-cell" : ""}">${isError ? escapeHTML(errors.join(" · ")) : `<span class="calc-tag">OK</span>`}</td>`);
    return `<tr class="${isError ? "calc-row-error" : ""}">${cells.join("")}</tr>`;
  }).join("");
  host.innerHTML = rows.length ? `<div class="calc-table-wrap"><table class="calc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="calc-muted" style="margin-top:8px">Showing ${rows.length} of ${state.results.length} rows.</p>` : `<div class="calc-empty">No combinations match these filters.</div>`;
}

function startFactorEditor(factor) {
  state.editor = clone(factor);
  state.editorError = "";
  state.activeTab = "factors";
  setTab("factors");
  renderFactorList();
  renderFactorEditor();
  const editor = $("calc-factor-editor");
  editor?.scrollIntoView({ behavior: "smooth", block: "start" });
}
function closeFactorEditor() { state.editor = null; state.editorError = ""; renderFactorList(); renderFactorEditor(); }
function saveFactorFromForm() {
  let candidate;
  try {
    const draft = readEditorForm();
    state.editor = draft;
    candidate = validateFactor(draft, state.factors);
    const duplicateName = state.factors.find(item => item.id !== candidate.id && item.name.toLowerCase() === candidate.name.toLowerCase());
    if (duplicateName) throw new Error(`Another factor is already named “${duplicateName.name}”. Use a distinct name.`);
    const next = state.factors.some(item => item.id === candidate.id)
      ? state.factors.map(item => item.id === candidate.id ? candidate : item)
      : [...state.factors, candidate];
    const cycle = findDependencyCycle(next);
    if (cycle) throw new Error(`Circular dependency detected: ${cycle.join(" → ")}.`);
    if (!persistFactors(next)) return;
    state.selectedFactorId = candidate.id;
    state.editor = null; state.editorError = "";
    notice(`Saved factor “${candidate.name}”.`, "success");
    renderAll();
  } catch (error) {
    state.editorError = error.message || String(error);
    renderFactorEditor();
  }
}
function deleteFactor(id) {
  const factor = state.factors.find(item => item.id === id);
  if (!factor) return;
  const users = state.factors.filter(item => item.dependencies.some(dep => dep.factorId === id));
  if (users.length) { notice(`Cannot delete “${factor.name}” because it is used by: ${users.map(item => item.name).join(", ")}. Remove those dependencies first.`, "error"); return; }
  if (!confirm(`Delete factor “${factor.name}”? This does not delete any records.`)) return;
  const next = state.factors.filter(item => item.id !== id);
  if (!persistFactors(next)) return;
  if (state.selectedFactorId === id) state.selectedFactorId = next[0]?.id || "";
  if (state.editor?.id === id) state.editor = null;
  state.results = [];
  notice("Factor deleted.", "success"); renderAll();
}
function duplicateFactor(id) {
  const original = state.factors.find(item => item.id === id);
  if (!original) return;
  let name = `${original.name} (copy)`;
  let number = 2;
  while (state.factors.some(item => item.name.toLowerCase() === name.toLowerCase())) { name = `${original.name} (copy ${number++})`; }
  const duplicate = normalizeFactor({ ...clone(original), id: makeId("factor"), name });
  const next = [...state.factors, duplicate];
  if (!persistFactors(next)) return;
  state.selectedFactorId = duplicate.id; state.results = [];
  notice(`Duplicated “${original.name}”.`, "success"); renderAll();
}
function addDependencyToEditor() {
  if (!state.editor) return;
  const preserved = readEditorForm();
  const select = $("calc-new-dependency");
  const id = select?.value;
  if (!id) return;
  if (preserved.dependencies.some(dep => dep.factorId === id)) return;
  const depended = state.factors.find(item => item.id === id);
  if (!depended) return;
  const bindings = Object.fromEntries(depended.inputs.map(input => [input.key, preserved.inputs.some(parent => parent.key === input.key) ? input.key : preserved.inputs[0]?.key || ""]));
  preserved.dependencies.push({ factorId: id, bindings });
  state.editor = preserved;
  renderFactorEditor();
}
function addInputToEditor() {
  const factor = readEditorForm();
  let index = factor.inputs.length + 1;
  let key = `input_${index}`;
  while (factor.inputs.some(input => input.key === key)) key = `input_${++index}`;
  factor.inputs.push({ id: makeId("input"), key, label: `Input ${index}`, role: "other", acceptedTypes: [], acceptedCategories: [], requiredProperties: [] });
  state.editor = factor; renderFactorEditor();
}
function addOutputToEditor() {
  const factor = readEditorForm();
  factor.outputs.push({ id: makeId("output"), name: `Result ${factor.outputs.length + 1}`, formula: "1" });
  state.editor = factor; renderFactorEditor();
}
function removeFromEditor(kind, id) {
  const factor = readEditorForm();
  if (kind === "input") {
    if (factor.inputs.length <= 1) { state.editorError = "A factor needs at least one input."; renderFactorEditor(); return; }
    const removed = factor.inputs.find(input => input.id === id);
    factor.inputs = factor.inputs.filter(input => input.id !== id);
    if (removed) factor.dependencies.forEach(dependency => {
      Object.keys(dependency.bindings).forEach(key => { if (dependency.bindings[key] === removed.key) dependency.bindings[key] = factor.inputs[0]?.key || ""; });
    });
  } else if (kind === "output") {
    if (factor.outputs.length <= 1) { state.editorError = "A factor needs at least one output."; renderFactorEditor(); return; }
    factor.outputs = factor.outputs.filter(output => output.id !== id);
  } else if (kind === "dependency") {
    factor.dependencies = factor.dependencies.filter(dependency => dependency.factorId !== id);
  }
  state.editor = factor; state.editorError = ""; renderFactorEditor();
}

function exportFactors() {
  if (state.factorReadError) { notice("Cannot export a normalized factor list because the saved factor data could not be read. Preserve the browser data before investigating.", "error"); return; }
  const bundle = { format: "rpg-codex-calculator-factors", version: 1, projectId: getActiveProjectId(), exportedAt: new Date().toISOString(), factors: state.factors };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = `rpg-codex-calculator-factors-${getActiveProjectId()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notice("Calculator factors exported to JSON.", "success");
}
function importFactorsFile(file) {
  if (!file) return;
  if (state.factorReadError) { notice("Import is blocked because the current factor data could not be read safely.", "error"); return; }
  const reader = new FileReader();
  reader.onerror = () => notice("Could not read the selected factor file.", "error");
  reader.onload = () => {
    try {
      const bundle = JSON.parse(String(reader.result || ""));
      if (!bundle || bundle.format !== "rpg-codex-calculator-factors" || bundle.version !== 1 || !Array.isArray(bundle.factors)) throw new Error("This is not a supported calculator factor file.");
      const imported = bundle.factors.map(normalizeFactor);
      const incomingIds = new Set();
      const incomingNames = new Set();
      imported.forEach(factor => {
        if (!factor.id || !factor.name || incomingIds.has(factor.id)) throw new Error("The file contains invalid or duplicate factor IDs.");
        if (incomingNames.has(factor.name.toLowerCase())) throw new Error(`The file contains multiple factors named “${factor.name}”.`);
        incomingIds.add(factor.id);
        incomingNames.add(factor.name.toLowerCase());
        if (!factor.inputs.length || !factor.outputs.length) throw new Error(`Factor “${factor.name}” needs at least one input and output.`);
        factor.outputs.forEach(output => parseFormula(output.formula));
      });
      const replace = confirm("Replace all current factors with those in this file?\n\nChoose Cancel to merge factors, remapping conflicting IDs and names.");
      const next = prepareImportedFactors(imported, replace);
      if (!persistFactors(next)) return;
      state.selectedFactorId = next[0]?.id || ""; state.results = []; state.editor = null;
      notice(`Imported ${next.length} factor(s).`, "success"); renderAll();
    } catch (error) { notice(`Import failed: ${error.message || error}`, "error"); }
  };
  reader.readAsText(file);
}

function downloadJSONFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportProjectWithFactors() {
  if (state.recordsReadError) return notice("Project export is blocked because the saved records could not be read safely.", "error");
  if (state.factorReadError) return notice("Project export is blocked because the saved factors could not be read safely.", "error");
  try {
    const bundle = exportProjectBundle();
    const projectId = getActiveProjectId();
    const storedRecords = localStorage.getItem(getScopedStorageKey(STORAGE_KEY));
    if (storedRecords === null && projectId === "default") bundle.records = clone(STARTER_RECORDS);
    bundle.calculatorFactorsVersion = 1;
    bundle.calculatorFactors = clone(state.factors);
    downloadJSONFile(`rpg-codex-${projectId}-backup-with-calculator.json`, bundle);
    notice("Combined project backup exported with records, catalogs, saved filters, trash and calculator factors.", "success");
  } catch (error) {
    notice(`Could not create a combined project backup: ${error.message || error}`, "error");
  }
}

function prepareImportedFactors(source, replace) {
  const imported = source.map(normalizeFactor);
  const incomingIds = new Set();
  const incomingNames = new Set();
  imported.forEach(factor => {
    if (!factor.id || !factor.name || incomingIds.has(factor.id)) throw new Error("The backup contains invalid or duplicate factor IDs.");
    const nameKey = factor.name.toLowerCase();
    if (incomingNames.has(nameKey)) throw new Error(`The backup contains multiple factors named “${factor.name}”.`);
    incomingIds.add(factor.id);
    incomingNames.add(nameKey);
    if (!factor.inputs.length || !factor.outputs.length) throw new Error(`Factor “${factor.name}” needs at least one input and output.`);
    factor.outputs.forEach(output => parseFormula(output.formula));
  });
  if (replace) {
    const ids = new Set(imported.map(factor => factor.id));
    if (imported.some(factor => factor.dependencies.some(dependency => !ids.has(dependency.factorId)))) {
      throw new Error("The backup contains a factor with a missing dependency.");
    }
    const cycle = findDependencyCycle(imported);
    if (cycle) throw new Error(`The backup contains a circular dependency: ${cycle.join(" → ")}.`);
    imported.forEach(factor => validateFactor(factor, imported));
    return imported;
  }

  const next = [...state.factors];
  const occupiedIds = new Set(next.map(factor => factor.id));
  const occupiedNames = new Set(next.map(factor => factor.name.toLowerCase()));
  const idRemap = new Map();
  const planned = imported.map(factor => {
    let id = factor.id;
    let name = factor.name;
    const conflict = occupiedIds.has(id) || occupiedNames.has(name.toLowerCase());
    if (conflict) {
      do { id = makeId("factor-import"); } while (occupiedIds.has(id));
    }
    if (occupiedNames.has(name.toLowerCase())) {
      const root = `${name} (imported)`;
      name = root;
      let index = 2;
      while (occupiedNames.has(name.toLowerCase())) name = `${root} ${index++}`;
    }
    occupiedIds.add(id);
    occupiedNames.add(name.toLowerCase());
    idRemap.set(factor.id, id);
    return { ...clone(factor), id, name };
  });
  const remapped = planned.map(factor => ({
    ...factor,
    dependencies: factor.dependencies.map(dependency => ({
      ...dependency,
      factorId: idRemap.get(dependency.factorId) || dependency.factorId
    }))
  }));
  const all = [...next, ...remapped];
  const ids = new Set(all.map(factor => factor.id));
  for (const factor of remapped) {
    for (const dependency of factor.dependencies) {
      if (!ids.has(dependency.factorId)) throw new Error(`Factor “${factor.name}” depends on an unavailable factor. Export related factors together or add the missing factor first.`);
    }
  }
  const cycle = findDependencyCycle(all);
  if (cycle) throw new Error(`The merged backup contains a circular dependency: ${cycle.join(" → ")}.`);
  remapped.forEach(factor => validateFactor(factor, all));
  return all;
}

function importProjectWithFactorsFile(file) {
  if (!file) return;
  if (state.recordsReadError) return notice("Project import is blocked because the existing records could not be read safely.", "error");
  if (state.factorReadError) return notice("Project import is blocked because existing calculator factors could not be read safely.", "error");
  const reader = new FileReader();
  reader.onerror = () => notice("Could not read the selected project backup.", "error");
  reader.onload = () => {
    let bundle;
    try {
      bundle = JSON.parse(String(reader.result || ""));
      if (!bundle || bundle.format !== "rpg-codex-backup" || bundle.version !== 1 || !Array.isArray(bundle.records)) {
        throw new Error("This file is not a supported RPG Codex project backup.");
      }
      if (bundle.calculatorFactorsVersion !== undefined && bundle.calculatorFactorsVersion !== 1) {
        throw new Error("This backup uses an unsupported calculator-factor format version.");
      }
      if (bundle.calculatorFactors !== undefined && !Array.isArray(bundle.calculatorFactors)) {
        throw new Error("The backup's calculator factors are not a valid list.");
      }
    } catch (error) {
      notice(`Import failed: ${error.message || error}`, "error");
      return;
    }

    let replace = confirm(
      `This backup contains ${bundle.records.length} record(s)${Array.isArray(bundle.calculatorFactors) ? ` and ${bundle.calculatorFactors.length} calculator factor(s)` : " and no calculator-factor section"}.\n\n` +
      "OK = replace the current project data. Cancel = choose whether to merge or abort."
    );
    if (!replace && !confirm("Merge this backup into the current project without replacing its existing records? Cancel to abort.")) return;

    let nextFactors = null;
    try {
      if (Array.isArray(bundle.calculatorFactors)) nextFactors = prepareImportedFactors(bundle.calculatorFactors, replace);
    } catch (error) {
      notice(`Import validation failed: ${error.message || error}`, "error");
      return;
    }

    const keys = [STORAGE_KEY, CATALOG_KEY, SAVED_KEY, TRASH_KEY, FACTORS_KEY].map(base => getScopedStorageKey(base));
    const snapshots = new Map();
    try {
      keys.forEach(key => snapshots.set(key, localStorage.getItem(key)));
      importProjectBundle(bundle, { replace });
      if (nextFactors !== null) localStorage.setItem(getScopedStorageKey(FACTORS_KEY), JSON.stringify(nextFactors));
      state.records = readCurrentRecords();
      state.recordsReadError = "";
      refreshFactorStatus();
      state.selectedFactorId = state.factors[0]?.id || "";
      state.results = [];
      state.visibleColumns = {};
      state.selectedRecordIds = {};
      state.overrideDraft = [];
      state.scenarioEnabled = false;
      state.sortBy = "";
      state.numericFilter = { outputId: "", operator: ">", value: "" };
      state.editor = null;
      state.editorError = "";
      const factorInfo = Array.isArray(bundle.calculatorFactors)
        ? ` ${state.factors.length} calculator factor(s) are now available.`
        : " This is an older project backup without calculator factors; current factors were left untouched. Use the combined export for future backups.";
      notice(`Project backup imported successfully.${factorInfo}`, "success");
      renderAll();
      // The main application keeps its record state in memory; reload so every view sees the imported project data.
      setTimeout(() => location.reload(), 900);
    } catch (error) {
      let rollbackFailed = false;
      snapshots.forEach((value, key) => {
        try {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        } catch (rollbackError) {
          rollbackFailed = true;
          console.error("Could not roll back combined calculator import.", rollbackError);
        }
      });
      refreshRecords();
      refreshFactorStatus();
      renderAll();
      notice(`Project import failed: ${error.message || error}.${rollbackFailed ? " Some storage rollback operations also failed; preserve a backup immediately." : " The previous saved values were restored where possible."}`, "error");
    }
  };
  reader.readAsText(file);
}

function handleAction(action, target) {
  const id = target.dataset.factorId;
  if (action === "new-factor") { if (state.factorReadError) return notice("Factor editing is blocked because saved data could not be read.", "error"); startFactorEditor(newFactorDraft()); }
  else if (action === "example-factor") {
    if (state.factorReadError) return notice("Factor editing is blocked because saved data could not be read.", "error");
    const example = exampleFactor();
    if (state.factors.some(item => item.name.toLowerCase() === example.name.toLowerCase())) example.name += ` ${state.factors.length + 1}`;
    try { const valid = validateFactor(example, state.factors); const next = [...state.factors, valid]; if (!persistFactors(next)) return; state.selectedFactorId = valid.id; state.results = []; notice("Created an illustrative damage factor. Adjust its accepted types and required properties to match your records.", "success"); renderAll(); }
    catch (error) { notice(error.message || String(error), "error"); }
  }
  else if (action === "close-editor") closeFactorEditor();
  else if (action === "add-input") addInputToEditor();
  else if (action === "add-output") addOutputToEditor();
  else if (action === "remove-input") removeFromEditor("input", target.dataset.inputId);
  else if (action === "remove-output") removeFromEditor("output", target.dataset.outputId);
  else if (action === "add-dependency") addDependencyToEditor();
  else if (action === "remove-dependency") removeFromEditor("dependency", target.dataset.depId);
  else if (action === "run") { state.selectedFactorId = id; state.results = []; state.visibleColumns = {}; state.sortBy = ""; state.numericFilter = { outputId: "", operator: ">", value: "" }; state.selectedRecordIds = {}; state.overrideDraft = []; state.scenarioEnabled = false; state.activeTab = "run"; renderAll(); setTab("run"); }
  else if (action === "delete") deleteFactor(id);
  else if (action === "duplicate") duplicateFactor(id);
  else if (action === "run-calculation") {
    try { const rows = executeBatch(); if (rows === null) return; renderResultsTable(); renderStatsOnly(); }
    catch (error) { notice(error.message || String(error), "error"); }
  }
  else if (action === "clear-results") { state.results = []; state.lastRunAt = null; renderRunPane(); notice("Results cleared. Records and factors were not changed.", "success"); }
  else if (action === "sort-direction") { state.overrideDraft = readOverridesSafe(); state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc"; renderRunPane(); }
  else if (action === "add-override") {
    const factor = getFactor(); if (!factor) return;
    const rows = readOverridesSafe();
    rows.push({ inputKey: factor.inputs[0]?.key || "", property: propertyNames(state.records)[0] || factor.inputs[0]?.requiredProperties[0] || "", operation: "multiply", amount: 1.2 });
    state.overrideDraft = rows; $("calc-overrides-body").innerHTML = renderOverrideRows(factor);
  }
  else if (action === "remove-override") {
    const rows = readOverridesSafe(); rows.splice(Number(target.dataset.overrideIndex), 1); state.overrideDraft = rows;
    const factor = getFactor(); if (factor) $("calc-overrides-body").innerHTML = renderOverrideRows(factor);
  }
  else if (action === "export") exportFactors();
  else if (action === "import") $("calc-import-file")?.click();
  else if (action === "project-export") exportProjectWithFactors();
  else if (action === "project-import") $("calc-import-project-file")?.click();
}
function readOverridesSafe() { try { return readOverrides(); } catch { return clone(state.overrideDraft || []); } }
function renderStatsOnly() {
  // Repaint the pane so row counts and controls match the new results, preserving the current selections.
  const saved = state.selectedRecordIds || {};
  const factor = getFactor();
  if (factor) {
    factor.inputs.forEach(input => {
      const select = $("calc-run-pane")?.querySelector(`[data-run-input="${CSS.escape(input.key)}"]`);
      if (select) saved[input.key] = [...select.selectedOptions].map(option => option.value);
    });
  }
  state.selectedRecordIds = saved;
  const overrides = readOverridesSafe();
  if (overrides.length) state.overrideDraft = overrides;
  const search = $("calc-results-search")?.value || "";
  state.resultSearch = search;
  const numOutput = $("calc-filter-output")?.value || "";
  const numOp = $("calc-filter-operator")?.value || ">";
  const numValue = $("calc-filter-value")?.value || "";
  state.numericFilter = { outputId: numOutput, operator: numOp, value: numValue };
  state.sortBy = $("calc-results-sort")?.value || state.sortBy;
  state.highlightMax = $("calc-highlight-max")?.checked ?? state.highlightMax;
  state.highlightMin = $("calc-highlight-min")?.checked ?? state.highlightMin;
  renderRunPane();
}

function attachHandlers(page) {
  page.addEventListener("click", event => {
    const token = event.target.closest("[data-insert-token]");
    if (token) {
      const outputRow = token.closest("[data-calc-output-row]");
      const textarea = outputRow?.querySelector("[data-output-formula]");
      if (textarea) {
        const start = textarea.selectionStart ?? textarea.value.length;
        const end = textarea.selectionEnd ?? textarea.value.length;
        textarea.setRangeText(token.dataset.insertToken, start, end, "end");
        textarea.focus();
      }
      return;
    }
    const action = event.target.closest("[data-calc-action]");
    if (action) { handleAction(action.dataset.calcAction, action); return; }
    const factorAction = event.target.closest("[data-factor-action]");
    if (factorAction) {
      const factor = state.factors.find(item => item.id === factorAction.dataset.factorId);
      if (!factor) return;
      if (factorAction.dataset.factorAction === "edit") startFactorEditor(factor);
      else if (factorAction.dataset.factorAction === "delete") deleteFactor(factor.id);
      else if (factorAction.dataset.factorAction === "duplicate") duplicateFactor(factor.id);
      else if (factorAction.dataset.factorAction === "run") { state.selectedFactorId = factor.id; state.results = []; state.selectedRecordIds = {}; state.visibleColumns = {}; state.sortBy = ""; state.numericFilter = { outputId: "", operator: ">", value: "" }; state.overrideDraft = []; state.scenarioEnabled = false; state.activeTab = "run"; renderAll(); setTab("run"); }
      return;
    }
    const tab = event.target.closest("[data-calc-tab]");
    if (tab) setTab(tab.dataset.calcTab);
  });
  page.addEventListener("submit", event => {
    if (event.target.id === "calc-factor-form") { event.preventDefault(); saveFactorFromForm(); }
  });
  page.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "calc-run-factor") {
      state.selectedRecordIds = {};
      state.selectedFactorId = target.value;
      state.results = []; state.visibleColumns = {}; state.overrideDraft = [];
      state.sortBy = "";
      state.numericFilter = { outputId: "", operator: ">", value: "" };
      renderRunPane(); return;
    }
    if (target.id === "calc-scenario-enabled") {
      state.scenarioEnabled = target.checked;
      const box = $("calc-overrides"); if (box) box.hidden = !target.checked;
      return;
    }
    if (target.id === "calc-import-file") {
      const file = target.files?.[0]; importFactorsFile(file); target.value = ""; return;
    }
    if (target.id === "calc-import-project-file") {
      const file = target.files?.[0]; importProjectWithFactorsFile(file); target.value = ""; return;
    }
    if (target.matches("[data-input-types], [data-input-categories], [data-input-required]")) {
      if (state.editor) {
        state.editor = readEditorForm();
        state.editorError = "";
        renderFactorEditor();
      }
      return;
    }
    if (target.dataset.columnKey) {
      state.visibleColumns[target.dataset.columnKey] = target.checked;
      renderResultsTable(); return;
    }
    if (target.id === "calc-highlight-max") { state.highlightMax = target.checked; renderResultsTable(); return; }
    if (target.id === "calc-highlight-min") { state.highlightMin = target.checked; renderResultsTable(); return; }
    if (target.id === "calc-results-sort") { state.sortBy = target.value; renderResultsTable(); return; }
    if (["calc-filter-output", "calc-filter-operator", "calc-filter-value"].includes(target.id)) {
      state.numericFilter = { outputId: $("calc-filter-output")?.value || "", operator: $("calc-filter-operator")?.value || ">", value: $("calc-filter-value")?.value || "" };
      renderResultsTable(); return;
    }
    if (target.matches("[data-run-input]")) {
      state.selectedRecordIds ||= {};
      state.selectedRecordIds[target.dataset.runInput] = [...target.selectedOptions].map(option => option.value);
    }
  });
  page.addEventListener("input", event => {
    const target = event.target;
    if (target.id === "calc-results-search") { state.resultSearch = target.value; renderResultsTable(); }
    if (target.id === "calc-filter-value") { state.numericFilter.value = target.value; renderResultsTable(); }
  });
}

function init() {
  if (!document.querySelector("main") || $("calculator-page")) return;
  styleText();
  ensurePage();
  installNavigation();
  refreshRecords();
  refreshFactorStatus();
  state.selectedFactorId = state.factors[0]?.id || "";
  attachHandlers($("calculator-page"));
  renderAll();
}

try { init(); }
catch (error) { console.error("RPG Codex calculator could not start:", error); }

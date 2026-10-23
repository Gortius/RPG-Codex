import {
  getActiveProjectId,
  getScopedStorageKey,
  STORAGE_KEY,
  CATALOG_KEY,
  SAVED_KEY,
  TRASH_KEY,
  exportProjectBundle,
  importProjectBundle
} from "../data/storage.js?v=20261023-r5";
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
    if (value === AMBIGUOUS) throw new Error(`Variable “${name}” is ambiguous. Give each formula variable a distinct name, such as weaponDamage or targetDamage.`);
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
function normalizeCalculatorProperty(property) {
  const name = String(property.name || "").trim();
  let valueType = String(property.valueType || "").toLowerCase();
  let value = property.value ?? "";
  if (!["number", "percentage", "text", "list"].includes(valueType)) {
    if (Array.isArray(value)) valueType = "list";
    else if (typeof value === "number") valueType = "number";
    else {
      const text = String(value ?? "").trim();
      const percent = text.match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*%$/);
      if (percent) { valueType = "percentage"; value = Number(percent[1]) / 100; }
      else if (numericValue(text) !== null) { valueType = "number"; value = Number(text); }
      else valueType = "text";
    }
  }
  if (valueType === "number" || valueType === "percentage") {
    value = value === "" || value === null ? null : numericValue(value);
  } else if (valueType === "text") {
    value = String(value ?? "");
  } else if (valueType === "list") {
    if (!Array.isArray(value)) {
      if (typeof value === "string") {
        try { const parsed = JSON.parse(value); value = Array.isArray(parsed) ? parsed : value.split(/\r?\n/).filter(Boolean); }
        catch { value = value.split(/\r?\n/).filter(Boolean); }
      } else value = [];
    }
  }
  return { ...property, name, valueType, value };
}
function isNumericProperty(property) {
  return Boolean(property && ["number", "percentage"].includes(property.valueType) && numericValue(property.value) !== null);
}
function displayPropertyValue(property) {
  if (property?.valueType === "percentage") {
    const value = numericValue(property.value);
    return value === null ? "—" : `${formatNumber(value * 100)}%`;
  }
  if (property?.valueType === "list") return `List · ${Array.isArray(property.value) ? property.value.length : 0} items`;
  return property?.value === null || property?.value === undefined || property?.value === "" ? "—" : String(property.value);
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
  // Normalize starter records through the same path as saved records. This keeps
  // the calculator usable before the first write to localStorage as well.
  const parsed = raw === null
    ? (getActiveProjectId() === "default" ? clone(STARTER_RECORDS) : [])
    : JSON.parse(raw);
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
        return normalizeCalculatorProperty(property);
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
  const inputs = asArray(source.inputs).map((input, index) => ({
    id: String(input.id || makeId("input")),
    key: String(input.key || `input_${index + 1}`).trim(),
    label: String(input.label ?? "").trim(),
    optional: Boolean(input.optional),
    // Retained only to migrate older factor definitions. New editing UI does not expose these filters.
    acceptedTypes: asArray(input.acceptedTypes).map(String),
    acceptedCategories: asArray(input.acceptedCategories).map(String),
    requiredProperties: asArray(input.requiredProperties).map(String)
  }));
  const sourceVariables = Array.isArray(source.variables)
    ? source.variables
    : inputs.flatMap(input => input.requiredProperties.map(propertyName => ({
        id: makeId("variable"),
        name: inputVariable(input.key, propertyName),
        inputKey: input.key,
        propertyName
      })));
  return {
    id: String(source.id || makeId("factor")),
    name: String(source.name || "Untitled factor").trim(),
    description: String(source.description || ""),
    inputs,
    variables: sourceVariables.map((variable, index) => ({
      id: String(variable.id || makeId("variable")),
      name: String(variable.name || `X${index + 1}`).trim(),
      inputKey: String(variable.inputKey || inputs[0]?.key || ""),
      propertyName: String(variable.propertyName || "").trim()
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
  }
  const variableNames = new Set();
  const variableIds = new Set();
  for (const variable of normalized.variables) {
    if (!variable.id || variableIds.has(variable.id)) throw new Error("Each formula variable must have a unique ID.");
    variableIds.add(variable.id);
    if (!validKey(variable.name)) throw new Error(`Variable name “${variable.name}” must start with a letter or underscore and contain only letters, numbers and underscores.`);
    const key = variable.name.toLowerCase();
    if (variableNames.has(key)) throw new Error(`Variable name “${variable.name}” is duplicated. Each variable must have a unique name.`);
    variableNames.add(key);
    if (!inputKeys.has(variable.inputKey)) throw new Error(`Variable “${variable.name}” must be linked to an existing record source.`);
    if (!variable.propertyName) throw new Error(`Choose a numeric property for variable “${variable.name}”.`);
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
        throw new Error(`Connect the input “${inputDisplayName(depInput, depended)}” from “${depended.name}” to one of this factor’s sources.`);
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
function numericPropertyNames(records) {
  return [...new Set(records.flatMap(record => asArray(record.properties).filter(isNumericProperty).map(property => String(property.name || "").trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b));
}
function numericPropertyOptions(records, selected = "") {
  const typesByName = new Map();
  records.forEach(record => asArray(record.properties).filter(isNumericProperty).forEach(property => {
    const name = String(property.name || "").trim();
    if (!name) return;
    if (!typesByName.has(name)) typesByName.set(name, new Set());
    typesByName.get(name).add(property.valueType === "percentage" ? "Percentage" : "Number");
  }));
  if (selected && !typesByName.has(selected)) typesByName.set(selected, new Set(["Unavailable"]));
  return [...typesByName.keys()].sort((a, b) => a.localeCompare(b)).map(name => {
    const types = [...typesByName.get(name)].join(" / ");
    return `<option value="${escapeHTML(name)}" ${name === selected ? "selected" : ""}>${escapeHTML(name)} · ${escapeHTML(types)}</option>`;
  }).join("");
}
function getProperty(record, propertyName) {
  return asArray(record?.properties).find(property => String(property.name || "").toLowerCase() === String(propertyName || "").toLowerCase());
}
function variablesForInput(factor, inputKey) {
  return asArray(factor?.variables).filter(variable => variable.inputKey === inputKey && variable.propertyName);
}
function requiredPropertiesForInput(factor, inputKey, factors = state.factors, visited = new Set()) {
  const own = variablesForInput(factor, inputKey).map(variable => variable.propertyName).filter(Boolean);
  if (!factor || visited.has(factor.id)) return [...new Set(own)];
  const nextVisited = new Set(visited); nextVisited.add(factor.id);
  for (const dependency of asArray(factor.dependencies)) {
    const depended = factors.find(item => item.id === dependency.factorId);
    if (!depended) continue;
    for (const depInput of depended.inputs) {
      if (dependency.bindings?.[depInput.key] !== inputKey) continue;
      own.push(...requiredPropertiesForInput(depended, depInput.key, factors, nextVisited));
    }
  }
  return [...new Set(own.map(name => String(name).trim()).filter(Boolean))];
}
function eligibleRecords(input, factor, records) {
  const required = requiredPropertiesForInput(factor, input.key);
  return records.filter(record => {
    if (!asArray(record.properties).some(isNumericProperty)) return false;
    if (!required.length) return true;
    return required.every(name => isNumericProperty(getProperty(record, name)));
  });
}
function variableCandidates(factor, records, factors = [], currentOutputId = "") {
  const result = factor.variables.map(variable => {
    const input = factor.inputs.find(item => item.key === variable.inputKey);
    return {
      token: variable.name,
      label: `${variable.name} ← ${input?.label || variable.inputKey}.${variable.propertyName}`
    };
  });
  for (const dependency of factor.dependencies) {
    const depended = factors.find(item => item.id === dependency.factorId);
    if (!depended) continue;
    for (const output of depended.outputs) result.push({
      token: dependencyVariable(depended, output),
      label: `${depended.name} → ${output.name}`
    });
  }
  const outputIndex = currentOutputId ? factor.outputs.findIndex(output => output.id === currentOutputId) : factor.outputs.length;
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
  const shortAliases = [];
  const propertyRows = [];
  const sourceProperties = new Map();
  for (const input of factor.inputs) {
    const record = assignments[input.key];
    if (!record) {
      if (input.optional) continue;
      throw new Error(`No record was assigned to “${inputDisplayName(input, factor)}”.`);
    }
    const rootKey = rootRoleMap[input.key] || input.key;
    const properties = new Map(asArray(record.properties).map(property => [String(property.name).toLowerCase(), { ...property, name: String(property.name) }]));

    for (const override of overrides) {
      if (override.inputKey !== rootKey) continue;
      const key = override.property.toLowerCase();
      let current = properties.get(key);
      if (!current && override.operation === "set") {
        current = { name: override.property, valueType: "number", value: override.amount };
        properties.set(key, current);
        continue;
      }
      if (!current) throw new Error(`Cannot ${override.operation} “${override.property}” for “${record.name}”: the property is missing (use Set to create a temporary numeric value).`);
      if (!isNumericProperty(current)) throw new Error(`Property “${current.name}” on “${record.name}” is not typed as Number or Percentage.`);
      const n = numericValue(current.value);
      if (n === null) throw new Error(`Property “${current.name}” on “${record.name}” has no numeric value.`);
      if (override.operation === "set") current.value = override.amount;
      else if (override.operation === "add") current.value = n + override.amount;
      else if (override.operation === "subtract") current.value = n - override.amount;
      else if (override.operation === "multiply") current.value = n * override.amount;
      else if (override.operation === "divide") {
        if (override.amount === 0) throw new Error(`Cannot divide “${current.name}” by zero in a temporary scenario.`);
        current.value = n / override.amount;
      }
      if (!Number.isFinite(Number(current.value))) throw new Error(`The temporary value for “${current.name}” is not finite.`);
      properties.set(key, current);
    }

    sourceProperties.set(input.key, properties);
    for (const property of properties.values()) {
      if (!isNumericProperty(property)) continue;
      propertyRows.push({ inputKey: input.key, name: property.name, value: numericValue(property.value) });
      shortAliases.push({ original: property.name, value: numericValue(property.value), inputKey: input.key });
      addVariable(variables, inputVariable(input.key, property.name), numericValue(property.value));
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(property.name)) addVariable(variables, `${input.key}.${property.name}`, numericValue(property.value));
    }
  }

  // The factor explicitly defines which property feeds each freely named formula variable.
  for (const mapping of factor.variables) {
    const record = assignments[mapping.inputKey];
    if (!record) {
      const input = factor.inputs.find(item => item.key === mapping.inputKey);
      if (input?.optional) continue;
      throw new Error(`Variable “${mapping.name}” has no selected record source (“${inputDisplayName(factor.inputs.find(item => item.key === mapping.inputKey), factor)}”).`);
    }
    const properties = sourceProperties.get(mapping.inputKey);
    const property = properties?.get(mapping.propertyName.toLowerCase()) || getProperty(record, mapping.propertyName);
    if (!property) throw new Error(`Variable “${mapping.name}” needs property “${mapping.propertyName}”, which is missing on “${record.name}”.`);
    if (!isNumericProperty(property)) throw new Error(`Variable “${mapping.name}” cannot use “${mapping.propertyName}” on “${record.name}”: only Number and Percentage properties can be used in formulas.`);
    const value = numericValue(property.value);
    if (value === null) throw new Error(`Variable “${mapping.name}” has no numeric value on “${record.name}”.`);
    addVariable(variables, mapping.name, value);
  }

  // Retain common unqualified aliases for old factors. They are not shown in the new editor.
  for (const item of shortAliases) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.original)) addVariable(variables, item.original, item.value);
  }
  const byName = new Map();
  propertyRows.forEach(item => {
    const key = slug(item.name);
    const previous = byName.get(key) || new Set();
    previous.add(item.inputKey); byName.set(key, previous);
  });
  for (const [name, keys] of byName.entries()) if (keys.size > 1) variables[name] = AMBIGUOUS;
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
      if (!parentKey || !assignments[parentKey]) throw new Error(`Dependency “${depended.name}” has no source mapped for “${inputDisplayName(depInput, depended)}”.`);
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
    .calc-variable-row .calc-field-grid{grid-template-columns:minmax(120px,.65fr) minmax(130px,.8fr) minmax(180px,1.25fr);align-items:start}
    .calc-input-row .calc-field-grid{grid-template-columns:minmax(0,1fr) minmax(230px,.65fr);align-items:center}
    .calc-input-row .calc-field:last-child{align-content:center}
    .calc-input-row,.calc-variable-row,.calc-output-row,.calc-dep-row,.calc-override-row{padding:12px;margin:10px 0;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.09);min-width:0}

    .calc-help-message{background:rgba(185,160,255,.07);border-color:#504269;line-height:1.75}
    .calc-guide-list{margin:0;padding-left:20px;color:var(--muted);font-size:12px;line-height:1.85}
    .calc-guide-list code,.calc-help-message code{padding:2px 4px;border-radius:4px;background:#17181e;color:#d7c8ff;overflow-wrap:anywhere}
    .calc-variable-row{padding:12px;margin:10px 0;border:1px solid #4c4260;border-radius:10px;background:rgba(185,160,255,.045);min-width:0}
    .calc-variable-summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:9px;padding:8px 10px;border-radius:8px;background:#1b1a22;color:var(--muted);font-size:12px;overflow-wrap:anywhere}
    .calc-variable-name{font-weight:800;color:#d7c8ff;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
    .calc-token-label{font-family:inherit;font-size:10px;color:#b9accd;white-space:normal}
    .calc-source-picker{margin:12px 0;padding:12px;border:1px solid var(--border);border-radius:11px;background:rgba(0,0,0,.06);min-width:0}
    .calc-source-picker .calc-item-heading{align-items:flex-start}
    .calc-source-search-label{display:grid;gap:6px;margin:9px 0;font-size:11px;font-weight:700;color:var(--muted)}
    .calc-source-search-label input{font:inherit;font-weight:400;color:var(--text);background:#17181e;border:1px solid var(--border);border-radius:8px;padding:9px 10px;min-width:0;width:100%}
    .calc-source-variables{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}
    .calc-record-picker{display:grid;gap:5px;max-height:300px;overflow:auto;padding:2px 3px 2px 0}
    .calc-record-option{display:flex;align-items:flex-start;gap:9px;padding:9px;border:1px solid var(--border);border-radius:9px;background:#1c1d23;cursor:pointer;min-width:0}
    .calc-record-option:hover{border-color:#655482;background:#24212d}
    .calc-record-option input{flex:0 0 auto;margin-top:3px;accent-color:var(--accent);width:16px;height:16px}
    .calc-record-info{display:grid;gap:3px;min-width:0;flex:1}
    .calc-record-info strong{font-size:12px;overflow-wrap:anywhere}
    .calc-record-info small{color:var(--muted);font-size:10px;overflow-wrap:anywhere}
    .calc-record-info .calc-record-props{color:#d0c3e8}
    .calc-record-empty{padding:12px;border:1px dashed var(--border);border-radius:8px;font-size:12px;color:var(--muted);line-height:1.55}
    .calc-picker-actions{margin-top:9px}
    .calc-picker-actions .calc-muted{font-size:10px}
    .calc-picker-actions button{font-size:11px}

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
    /* Compact calculator editor and record picker dialog */
    .calc-intro{margin-bottom:14px;gap:12px}
    .calc-tabs{margin-bottom:12px}
    .calc-panel{padding:14px}
    .calc-panel h3{margin-bottom:8px}
    .calc-section-divider{margin:11px 0}
    .calc-input-row,.calc-variable-row,.calc-output-row,.calc-dep-row,.calc-override-row{padding:10px;margin:7px 0}
    .calc-field{gap:5px;margin-bottom:8px}
    .calc-field textarea,.calc-output-row textarea{min-height:62px}
    .calc-variable-summary{margin-top:6px;padding:6px 8px}
    .calc-compact-source{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;padding:10px 11px;margin:7px 0;background:rgba(0,0,0,.08);border:1px solid var(--border);border-radius:10px;min-width:0}
    .calc-compact-source-main{display:grid;gap:5px;min-width:0}
    .calc-compact-source-title{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
    .calc-compact-source-title strong{font-size:13px}
    .calc-selection-preview{font-size:11px;line-height:1.45;color:var(--muted);overflow-wrap:anywhere}
    .calc-source-variables{display:flex;gap:5px;flex-wrap:wrap;margin:0}
    .calc-source-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .calc-source-actions .calc-btn{padding:7px 9px;white-space:nowrap}
    .calc-record-modal-backdrop{position:fixed;inset:0;z-index:10020;display:grid;place-items:center;padding:20px;background:rgba(5,5,8,.74);backdrop-filter:blur(4px)}
    .calc-record-modal{display:flex;flex-direction:column;width:min(900px,100%);max-height:min(86vh,900px);background:var(--panel,#222329);border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.55);overflow:hidden}
    .calc-record-modal-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border)}
    .calc-record-modal-header h3{margin:0 0 4px;font-size:17px}
    .calc-record-modal-tools{display:grid;grid-template-columns:minmax(0,2fr) minmax(120px,1fr) minmax(120px,1fr);gap:8px;padding:12px 18px;border-bottom:1px solid var(--border)}
    .calc-record-modal-tools input,.calc-record-modal-tools select{min-width:0;width:100%;font:inherit;font-size:12px;color:var(--text);background:#17181e;border:1px solid var(--border);border-radius:8px;padding:9px;color-scheme:dark}
    .calc-record-modal-meta{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:9px 18px;color:var(--muted);font-size:11px}
    .calc-record-modal-list{display:grid;gap:6px;padding:0 18px 14px;overflow:auto;min-height:120px}
    .calc-record-modal-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid var(--border);background:rgba(0,0,0,.08)}
    .calc-record-modal-footer .calc-row{margin-left:auto}
    .calc-dependencies{margin-top:13px;border:1px solid var(--border);border-radius:10px;background:rgba(0,0,0,.07)}
    .calc-dependencies>summary{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;list-style:none;padding:11px 12px;font-size:12px;font-weight:700}
    .calc-dependencies>summary::-webkit-details-marker{display:none}
    .calc-dependencies>summary:after{content:'＋';color:var(--muted);font-size:16px}
    .calc-dependencies[open]>summary:after{content:'−'}
    .calc-dependencies>summary small{display:block;margin-top:3px;color:var(--muted);font-size:11px;font-weight:400}
    .calc-dependencies-content{padding:0 12px 12px;border-top:1px solid var(--border)}
    .calc-dependency-outputs{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0 10px}
    .calc-editor-actions{position:sticky;bottom:8px;z-index:5;padding:10px;background:rgba(29,27,35,.96);border:1px solid var(--border);border-radius:10px;box-shadow:0 -5px 20px rgba(0,0,0,.15);backdrop-filter:blur(10px)}
    .calc-editor-actions .calc-btn{min-width:92px}
    @media(max-width:650px){.calc-record-modal-backdrop{padding:8px}.calc-record-modal{max-height:92vh;border-radius:12px}.calc-record-modal-header,.calc-record-modal-tools{padding:11px}.calc-record-modal-tools{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.calc-record-modal-tools input{grid-column:1/-1}.calc-record-modal-meta{padding:8px 11px}.calc-record-modal-list{padding:0 11px 11px}.calc-record-modal-footer{padding:10px 11px}.calc-compact-source{grid-template-columns:minmax(0,1fr)}.calc-source-actions{justify-content:flex-start}.calc-editor-actions{bottom:4px}.calc-variable-row .calc-field-grid,.calc-input-row .calc-field-grid{grid-template-columns:minmax(0,1fr)}}
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
    <div id="calc-record-picker-modal" hidden></div>
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
  selectedRecordIds: {}, inputSearch: {}, recordPickerDraft: null, overrideDraft: [], scenarioEnabled: false,
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
function inputDisplayName(input, factor) {
  const label = String(input?.label ?? "").trim();
  if (label) return label;
  const sources = asArray(factor?.inputs);
  const index = sources.findIndex(item => item.key === input?.key);
  return `Source ${index >= 0 ? index + 1 : 1}`;
}
function setTab(tab) {
  state.activeTab = tab === "factors" ? "factors" : "run";
  if (state.activeTab !== "run" && state.recordPickerDraft) closeRecordPicker(false);
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
      { id: makeId("input"), key: "weapon", label: "Weapon", optional: false, acceptedTypes: [], acceptedCategories: [], requiredProperties: [] },
      { id: makeId("input"), key: "target", label: "Target", optional: false, acceptedTypes: [], acceptedCategories: [], requiredProperties: [] }
    ],
    variables: [
      { id: makeId("variable"), name: "X", inputKey: "weapon", propertyName: "Damage" },
      { id: makeId("variable"), name: "Y", inputKey: "target", propertyName: "Armor" }
    ],
    outputs: [{ id: makeId("output"), name: "Damage", formula: "X * (100 / (100 + 2.5 * Y))" }],
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
  // Keep the editor focused: hide the library and guide while editing a single factor.
  if (state.editor) {
    pane.innerHTML = `<div id="calc-factor-editor" class="calc-panel calc-wide"></div>`;
    return;
  }
  const cards = state.factors.map(factor => `
    <article class="calc-factor-card">
      <div class="calc-item-heading"><div><h4>${escapeHTML(factor.name)}</h4><p class="calc-muted">${escapeHTML(factor.description || "No description.")}</p></div><span class="calc-tag">${factor.inputs.length} source${factor.inputs.length === 1 ? "" : "s"} · ${factor.variables.length} variable${factor.variables.length === 1 ? "" : "s"}</span></div>
      <div>${factor.variables.map(variable => {
        const input = factor.inputs.find(item => item.key === variable.inputKey);
        return `<span class="calc-tag"><strong>${escapeHTML(variable.name)}</strong> ← ${escapeHTML(inputDisplayName(input, factor))}.${escapeHTML(variable.propertyName || "Choose property")}</span>`;
      }).join("")}</div>
      <div style="margin-top:5px">${factor.outputs.map(output => `<span class="calc-tag">Result: ${escapeHTML(output.name)}</span>`).join("")}${factor.dependencies.length ? `<span class="calc-tag">${factor.dependencies.length} reused factor${factor.dependencies.length === 1 ? "" : "s"}</span>` : ""}</div>
      <div class="calc-row" style="margin-top:10px"><button class="calc-btn primary" type="button" data-factor-action="run" data-factor-id="${escapeHTML(factor.id)}">Use factor</button><button class="calc-btn" type="button" data-factor-action="edit" data-factor-id="${escapeHTML(factor.id)}">Edit</button><button class="calc-btn" type="button" data-factor-action="duplicate" data-factor-id="${escapeHTML(factor.id)}">Duplicate</button><button class="calc-btn danger" type="button" data-factor-action="delete" data-factor-id="${escapeHTML(factor.id)}">Delete</button></div>
    </article>`).join("");
  pane.innerHTML = `
    <div class="calc-layout">
      <div class="calc-panel"><h3>Factor library</h3><p class="calc-muted">Create reusable formulas for damage, DPS, healing, mitigation, and more. Factors are saved in this project.</p><div class="calc-row"><button class="calc-btn primary" type="button" data-calc-action="new-factor" ${state.factorReadError ? "disabled" : ""}>＋ New factor</button><button class="calc-btn" type="button" data-calc-action="example-factor" ${state.factorReadError ? "disabled" : ""}>Create damage example</button></div>${state.factors.length ? `<div class="calc-factor-list" style="margin-top:12px">${cards}</div>` : `<div class="calc-empty" style="margin-top:12px">No factors yet.<br>Create your first factor, or start with the illustrative damage formula.</div>`}</div>
      <div class="calc-panel"><h3>Quick guide</h3><ol class="calc-guide-list"><li>Add record sources (for example, Weapon and Target). Names are optional.</li><li>Create variables such as <code>X</code> and <code>Y</code>, then connect each to a source and a Number/Percentage property.</li><li>Write a formula such as <code>X * (100 / (100 + 2.5 * Y))</code>.</li><li>Save, choose records in <em>Run &amp; Compare</em>, and run the calculation.</li></ol><details style="margin-top:12px"><summary class="calc-muted" style="cursor:pointer">Property types and advanced features</summary><p class="calc-muted">Only Number and Percentage properties can be used in formulas. Percentage values use fractions (20% = 0.2). Text and List stay available on records. Reusing another factor is optional and useful for multi-step formulas.</p><p class="calc-muted">Formulas use a restricted mathematical interpreter, not arbitrary JavaScript.</p></details></div>
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
  const availableNumericProperties = numericPropertyNames(state.records);
  const inputHTML = factor.inputs.map((input, index) => `
    <div class="calc-input-row" data-calc-input-row data-input-id="${escapeHTML(input.id)}">
      <input type="hidden" data-input-key value="${escapeHTML(input.key)}">
      <div class="calc-item-heading"><div><strong>Source ${index + 1}</strong><p class="calc-muted">${escapeHTML(inputDisplayName(input, factor))}${input.optional ? " · Optional" : " · Required"}</p></div><button type="button" class="calc-btn danger" data-calc-action="remove-input" data-input-id="${escapeHTML(input.id)}">Remove</button></div>
      <div class="calc-field-grid">
        <div class="calc-field"><label>Source name (optional)</label><input data-input-label value="${escapeHTML(input.label)}" maxlength="70" placeholder="Weapon, Target, Buff…"><small class="calc-muted">Leave blank to use an automatic label. This name is only for readability.</small></div>
        <div class="calc-field"><label class="calc-inline-check"><input type="checkbox" data-input-optional ${input.optional ? "checked" : ""}> This source can be left empty</label><small class="calc-muted">Use this for an optional modifier or context record.</small></div>
      </div>
      <p class="calc-muted">No category or record type is required. During a calculation, records are filtered only by the numeric properties assigned to this source's variables.</p>
    </div>`).join("");
  const sourceOptions = factor.inputs.map(input => `<option value="${escapeHTML(input.key)}">${escapeHTML(inputDisplayName(input, factor))}</option>`).join("");
  const variablesHTML = factor.variables.map((variable, index) => {
    const propertyOptions = availableNumericProperties.length || variable.propertyName
      ? `<option value="">Choose a numeric property…</option>${numericPropertyOptions(state.records, variable.propertyName)}`
      : `<option value="">No Number or Percentage properties yet</option>`;
    const propertyHelp = availableNumericProperties.length
      ? "Number and Percentage only. Percentage formulas use fractions (20% = 0.2)."
      : "Set at least one record property to Number or Percentage first.";
    return `
    <div class="calc-variable-row" data-calc-variable-row data-variable-id="${escapeHTML(variable.id)}">
      <div class="calc-item-heading"><strong>Variable ${index + 1}</strong><button type="button" class="calc-btn danger" data-calc-action="remove-variable" data-variable-id="${escapeHTML(variable.id)}">Remove</button></div>
      <div class="calc-field-grid">
        <div class="calc-field"><label>Variable name</label><input data-variable-name value="${escapeHTML(variable.name)}" maxlength="36" placeholder="X, Y, Xdmg…"><small class="calc-muted">Use this name in your formula.</small></div>
        <div class="calc-field"><label>Read from source</label><select data-variable-input>${factor.inputs.map(input => `<option value="${escapeHTML(input.key)}" ${variable.inputKey === input.key ? "selected" : ""}>${escapeHTML(inputDisplayName(input, factor))}</option>`).join("")}</select></div>
        <div class="calc-field"><label>Property to read</label><select data-variable-property>${propertyOptions}</select><small class="calc-muted">${escapeHTML(propertyHelp)}</small></div>
      </div>
      <div class="calc-variable-summary"><span class="calc-variable-name" data-variable-summary-name>${escapeHTML(variable.name || "X")}</span><span>←</span><span data-variable-summary-source>${escapeHTML(inputDisplayName(factor.inputs.find(input => input.key === variable.inputKey), factor))}</span><span>.</span><span data-variable-summary-property>${escapeHTML(variable.propertyName || "Choose property")}</span></div>
    </div>`;
  }).join("");
  const outputHTML = factor.outputs.map((output, index) => {
    const tokens = variableCandidates(factor, state.records, state.factors, output.id);
    return `<div class="calc-output-row" data-calc-output-row data-output-id="${escapeHTML(output.id)}">
      <div class="calc-item-heading"><strong>Result ${index + 1}</strong>${factor.outputs.length > 1 ? `<button type="button" class="calc-btn danger" data-calc-action="remove-output" data-output-id="${escapeHTML(output.id)}">Remove</button>` : ""}</div>
      <div class="calc-field"><label>Result name</label><input data-output-name value="${escapeHTML(output.name)}" maxlength="60" placeholder="Damage, DPS, Healing…"></div>
      <div class="calc-field"><label>Formula</label><textarea data-output-formula spellcheck="false" placeholder="X * (100 / (100 + 2.5 * Y))">${escapeHTML(output.formula)}</textarea><div class="calc-muted">Write the variable names, or click a variable/result chip below to insert it. Earlier outputs are reusable.</div><div class="calc-token-list">${tokens.map(token => `<button class="calc-token" type="button" data-insert-token="${escapeHTML(token.token)}" title="Insert ${escapeHTML(token.label)}">${escapeHTML(token.token)} <span class="calc-token-label">${escapeHTML(token.label)}</span></button>`).join("") || `<span class="calc-muted">Add variables to make them available here.</span>`}</div><details style="margin-top:7px"><summary class="calc-muted" style="cursor:pointer">Insert a math function</summary><div class="calc-token-list">${Object.keys(ALLOWED_FUNCTIONS).map(fn => `<button class="calc-token" type="button" data-insert-token="${fn}()">${fn}()</button>`).join("")}</div></details></div>
    </div>`;
  }).join("");
  const otherFactors = state.factors.filter(item => item.id !== factor.id && !factor.dependencies.some(dep => dep.factorId === item.id));
  const depsHTML = factor.dependencies.map(dependency => {
    const depended = state.factors.find(item => item.id === dependency.factorId);
    if (!depended) return `<div class="calc-message error">A referenced factor no longer exists.</div>`;
    const outputTokens = depended.outputs.map(output => `<span class="calc-tag">${escapeHTML(output.name)} → <code>${escapeHTML(dependencyVariable(depended, output))}</code></span>`).join("");
    return `<div class="calc-dep-row" data-calc-dep-row data-dep-id="${escapeHTML(depended.id)}">
      <div class="calc-item-heading"><div><strong>${escapeHTML(depended.name)}</strong><p class="calc-muted">This factor runs first. Its results become available as formula chips.</p></div><button class="calc-btn danger" type="button" data-calc-action="remove-dependency" data-dep-id="${escapeHTML(depended.id)}">Remove</button></div>
      <div class="calc-dependency-outputs">${outputTokens}</div>
      ${depended.inputs.map(depInput => `<div class="calc-field"><label>For the input “${escapeHTML(inputDisplayName(depInput, depended))}” in ${escapeHTML(depended.name)}, use this source:</label><select data-dep-bind="${escapeHTML(depInput.key)}"><option value="">Choose a source…</option>${factor.inputs.map(input => `<option value="${escapeHTML(input.key)}" ${dependency.bindings[depInput.key] === input.key ? "selected" : ""}>${escapeHTML(inputDisplayName(input, factor))}</option>`).join("")}</select><small class="calc-muted">Both factors will use the same selected record for this connection.</small></div>`).join("")}
    </div>`;
  }).join("");
  container.hidden = false;
  container.innerHTML = `
    <div class="calc-item-heading"><div><p class="eyebrow">FACTOR EDITOR</p><h3>${factor.id && state.factors.some(item => item.id === factor.id) ? "Edit factor" : "Create factor"}</h3></div><button type="button" class="calc-btn" data-calc-action="close-editor">Close</button></div>
    ${state.editorError ? `<div class="calc-message error">${escapeHTML(state.editorError)}</div>` : ""}
    <form id="calc-factor-form">
      <div class="calc-field-grid"><div class="calc-field"><label for="calc-factor-name">Factor name</label><input id="calc-factor-name" data-factor-name required maxlength="100" value="${escapeHTML(factor.name)}" placeholder="Effective damage"></div><div class="calc-field"><label for="calc-factor-description">Description (optional)</label><input id="calc-factor-description" data-factor-description maxlength="240" value="${escapeHTML(factor.description)}" placeholder="What does this calculation measure?"></div></div>
      <details class="calc-help-details"><summary class="calc-muted" style="cursor:pointer">How factors, variables and formulas fit together</summary><div class="calc-message calc-help-message"><strong>Example: damage</strong><br><code>X</code> reads the weapon's <em>Damage</em> property. <code>Y</code> reads the target's <em>Armor</em>. The formula <code>X * (100 / (100 + 2.5 * Y))</code> uses those two values. When you run it, choose one or more records for each source. Names are optional; variables must be linked to a source and numeric property.</div></details>
      <hr class="calc-section-divider"><div class="calc-item-heading"><div><h4 style="margin:0">1. Record sources</h4><p class="calc-muted">Selections used when running this factor. A display name is optional.</p></div><button type="button" class="calc-btn" data-calc-action="add-input">＋ Add source</button></div>${inputHTML}
      <hr class="calc-section-divider"><div class="calc-item-heading"><div><h4 style="margin:0">2. Variables</h4><p class="calc-muted">Each variable reads one Number/Percentage property from one source.</p></div><button type="button" class="calc-btn" data-calc-action="add-variable">＋ Add variable</button></div>${variablesHTML || `<div class="calc-empty">Add a variable for each value your formula needs, for example X = Weapon.Damage and Y = Target.Armor.</div>`}
      <hr class="calc-section-divider"><div class="calc-item-heading"><div><h4 style="margin:0">3. Results</h4><p class="calc-muted">Results are evaluated from top to bottom; later outputs can use earlier results.</p></div><button type="button" class="calc-btn" data-calc-action="add-output">＋ Add result</button></div><p class="calc-muted">Operators: + − × ÷ ^ and parentheses. Functions: ${Object.keys(ALLOWED_FUNCTIONS).join(", ")}.</p>${outputHTML}
      <details class="calc-dependencies" ${factor.dependencies.length ? "open" : ""}><summary><span>Reuse results from another factor<small>Optional. Useful when a calculation builds on another calculation, such as DPS using Effective Damage.</small></span><span class="calc-tag">${factor.dependencies.length} connected</span></summary><div class="calc-dependencies-content"><p class="calc-muted">Choose a factor to run first. Its named results become available as chips in your formulas. Then connect each input it needs to one of this factor's sources, so both calculations use the same record.</p><div class="calc-row"><select id="calc-new-dependency" ${otherFactors.length ? "" : "disabled"} aria-label="Choose a factor to reuse" style="flex:1;max-width:360px">${otherFactors.length ? otherFactors.map(item => `<option value="${escapeHTML(item.id)}">${escapeHTML(item.name)}</option>`).join("") : `<option value="">No other factors available</option>`}</select><button class="calc-btn" type="button" data-calc-action="add-dependency" ${otherFactors.length ? "" : "disabled"}>＋ Use factor</button></div>${depsHTML || `<p class="calc-muted" style="margin-top:9px">No other factor is connected. You can ignore this section for simple formulas.</p>`}</div></details>
      <div class="calc-row calc-editor-actions" style="margin-top:14px"><button type="submit" class="calc-btn primary">Save factor</button><button type="button" class="calc-btn" data-calc-action="close-editor">Cancel</button></div>
    </form>`;
}



function newFactorDraft() {
  const firstProperty = numericPropertyNames(state.records)[0] || "";
  return normalizeFactor({
    id: makeId("factor"), name: "New factor", description: "",
    inputs: [
      { id: makeId("input"), key: "source_a", label: "", optional: false, acceptedTypes: [], acceptedCategories: [], requiredProperties: [] }
    ],
    variables: [
      { id: makeId("variable"), name: "X", inputKey: "source_a", propertyName: firstProperty }
    ],
    outputs: [{ id: makeId("output"), name: "Result", formula: "X" }],
    dependencies: []
  });
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
    optional: row.querySelector("[data-input-optional]")?.checked ?? false,
    acceptedTypes: [], acceptedCategories: [], requiredProperties: []
  }));
  factor.inputs.forEach((input, index) => { if (!input.id) input.id = state.editor.inputs[index]?.id || makeId("input"); });
  factor.variables = [...container.querySelectorAll("[data-calc-variable-row]")].map(row => ({
    id: row.dataset.variableId || makeId("variable"),
    name: row.querySelector("[data-variable-name]")?.value.trim() || "",
    inputKey: row.querySelector("[data-variable-input]")?.value || "",
    propertyName: row.querySelector("[data-variable-property]")?.value || ""
  }));
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

function renderRecordSourceSummary(record, input, factor) {
  const mappings = variablesForInput(factor, input.key);
  const mappedNames = new Set(mappings.map(variable => variable.propertyName.toLowerCase()));
  const parts = mappings.map(variable => {
    const property = getProperty(record, variable.propertyName);
    return `${variable.name}: ${displayPropertyValue(property)}`;
  });
  const inherited = requiredPropertiesForInput(factor, input.key)
    .filter(name => !mappedNames.has(name.toLowerCase()));
  inherited.forEach(name => parts.push(`${name}: ${displayPropertyValue(getProperty(record, name))}`));
  if (parts.length) return parts.join(" · ");
  return asArray(record.properties).filter(isNumericProperty).slice(0, 3)
    .map(property => `${property.name}: ${displayPropertyValue(property)}`).join(" · ");
}

function renderInputSelectionCards(factor) {
  return factor.inputs.map(input => {
    const allowed = eligibleRecords(input, factor, state.records);
    const selectedIds = state.selectedRecordIds?.[input.key] || [];
    const selectedRecords = selectedIds.map(id => state.records.find(record => record.id === id)).filter(Boolean);
    const summaries = selectedRecords.slice(0, 3).map(record => {
      const values = renderRecordSourceSummary(record, input, factor);
      return `${record.name}${values ? ` (${values})` : ""}`;
    });
    const preview = selectedRecords.length
      ? `${summaries.join(" · ")}${selectedRecords.length > summaries.length ? ` · +${selectedRecords.length - summaries.length} more` : ""}`
      : (input.optional ? "No record selected; this source will be skipped." : "No records selected yet.");
    const mappings = variablesForInput(factor, input.key);
    const inheritedProperties = requiredPropertiesForInput(factor, input.key).filter(name => !mappings.some(variable => variable.propertyName.toLowerCase() === name.toLowerCase()));
    const mappingSummary = mappings.length || inheritedProperties.length
      ? `<div class="calc-source-variables">${mappings.map(variable => `<span class="calc-tag"><strong>${escapeHTML(variable.name)}</strong> ← ${escapeHTML(variable.propertyName)}</span>`).join("")}${inheritedProperties.map(name => `<span class="calc-tag">Required by reused factor: ${escapeHTML(name)}</span>`).join("")}</div>`
      : `<span class="calc-muted">No variable mapped · any record with a numeric property can be selected.</span>`;
    return `<section class="calc-compact-source" data-input-picker="${escapeHTML(input.key)}">
      <div class="calc-compact-source-main"><div class="calc-compact-source-title"><strong>${escapeHTML(inputDisplayName(input, factor))}</strong><span class="calc-tag">${selectedIds.length} selected</span><span class="calc-tag">${input.optional ? "Optional" : "Required"}</span></div>${mappingSummary}<div class="calc-selection-preview">${escapeHTML(preview)} <span>· ${allowed.length} compatible record${allowed.length === 1 ? "" : "s"}</span></div></div>
      <div class="calc-source-actions"><button class="calc-btn" type="button" data-calc-action="open-record-picker" data-input-key="${escapeHTML(input.key)}">Choose records</button><button class="calc-btn" type="button" data-calc-action="clear-input" data-input-key="${escapeHTML(input.key)}" ${selectedIds.length ? "" : "disabled"}>Clear</button></div>
    </section>`;
  }).join("");
}

function openRecordPicker(inputKey) {
  const factor = getFactor();
  const input = factor?.inputs.find(item => item.key === inputKey);
  if (!input) return;
  state.recordPickerDraft = {
    inputKey,
    selectedIds: [...(state.selectedRecordIds[inputKey] || [])],
    search: state.inputSearch[inputKey] || "",
    type: "",
    category: ""
  };
  renderRecordPickerModal();
  const search = $("calc-record-picker-search");
  search?.focus();
}

function closeRecordPicker(commit = false) {
  const draft = state.recordPickerDraft;
  if (commit && draft) {
    // Preserve in-progress scenario edits before repainting the run pane.
    state.overrideDraft = readOverridesSafe();
    state.scenarioEnabled = $("calc-scenario-enabled")?.checked ?? state.scenarioEnabled;
    state.selectedRecordIds[draft.inputKey] = [...draft.selectedIds];
    state.inputSearch[draft.inputKey] = draft.search;
    state.results = [];
    state.lastRunAt = null;
  }
  state.recordPickerDraft = null;
  renderRecordPickerModal();
  if (commit) renderRunPane();
}

function applyRecordPickerFilters() {
  const modal = $("calc-record-picker-modal");
  const draft = state.recordPickerDraft;
  if (!modal || !draft) return;
  const q = String(draft.search || "").trim().toLowerCase();
  const type = draft.type || "";
  const category = draft.category || "";
  modal.querySelectorAll("[data-record-option]").forEach(option => {
    const matchText = !q || String(option.dataset.searchText || "").includes(q);
    const matchType = !type || option.dataset.recordType === type;
    const matchCategory = !category || option.dataset.recordCategory === category;
    option.hidden = !(matchText && matchType && matchCategory);
  });
  updateModalPickerCount();
}

function updateModalPickerCount() {
  const modal = $("calc-record-picker-modal");
  const draft = state.recordPickerDraft;
  if (!modal || !draft) return;
  const count = draft.selectedIds.length;
  const label = modal.querySelector("[data-modal-selected-count]");
  if (label) label.textContent = `${count} selected`;
  const visible = [...modal.querySelectorAll("[data-record-option]")].filter(row => !row.hidden).length;
  const selectButton = modal.querySelector("[data-calc-action='modal-select-visible']");
  if (selectButton) { selectButton.textContent = `Select ${visible} visible`; selectButton.disabled = visible === 0; }
  const clearButton = modal.querySelector("[data-calc-action='modal-clear-selection']");
  if (clearButton) clearButton.disabled = count === 0;
  const confirmButton = modal.querySelector("[data-calc-action='confirm-record-picker']");
  if (confirmButton) confirmButton.textContent = `Use ${count} selected`;
}

function renderRecordPickerModal() {
  const modal = $("calc-record-picker-modal");
  const draft = state.recordPickerDraft;
  if (!modal) return;
  if (!draft) { modal.hidden = true; modal.innerHTML = ""; return; }
  const factor = getFactor();
  const input = factor?.inputs.find(item => item.key === draft.inputKey);
  if (!input) { modal.hidden = true; modal.innerHTML = ""; state.recordPickerDraft = null; return; }
  const allowed = eligibleRecords(input, factor, state.records);
  const types = [...new Set(allowed.map(record => String(record.type || "Record")).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = [...new Set(allowed.map(record => String(record.category || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const cards = allowed.map(record => {
    const selected = draft.selectedIds.includes(record.id);
    const summary = renderRecordSourceSummary(record, input, factor);
    const searchText = `${record.name} ${record.type || ""} ${record.category || ""} ${asArray(record.tags).join(" ")} ${summary}`.toLowerCase();
    return `<label class="calc-record-option" data-record-option data-search-text="${escapeHTML(searchText)}" data-record-type="${escapeHTML(record.type || "Record")}" data-record-category="${escapeHTML(record.category || "")}">
      <input type="checkbox" data-run-record data-input-key="${escapeHTML(input.key)}" value="${escapeHTML(record.id)}" ${selected ? "checked" : ""}>
      <span class="calc-record-info"><strong>${escapeHTML(record.name)}</strong><small>${escapeHTML(record.type || "Record")}${record.category ? ` · ${escapeHTML(record.category)}` : ""}</small><small class="calc-record-props">${escapeHTML(summary || "No mapped values")}</small></span>
    </label>`;
  }).join("");
  modal.hidden = false;
  modal.innerHTML = `<div class="calc-record-modal-backdrop" role="presentation" id="calc-record-picker-backdrop">
    <section class="calc-record-modal" role="dialog" aria-modal="true" aria-labelledby="calc-record-modal-title">
      <div class="calc-record-modal-header"><div><h3 id="calc-record-modal-title">Choose records · ${escapeHTML(inputDisplayName(input, factor))}</h3><p class="calc-muted">Select one record to keep it fixed, or several to compare combinations. Only records with the needed numeric properties are shown.</p></div><button type="button" class="calc-btn" data-calc-action="cancel-record-picker" aria-label="Close record selector">Close</button></div>
      <div class="calc-record-modal-tools"><input id="calc-record-picker-search" type="search" data-input-search="${escapeHTML(input.key)}" placeholder="Search name, type, category, tags…" value="${escapeHTML(draft.search)}"><select data-picker-type aria-label="Filter by type"><option value="">All types</option>${types.map(type => `<option value="${escapeHTML(type)}" ${draft.type === type ? "selected" : ""}>${escapeHTML(type)}</option>`).join("")}</select><select data-picker-category aria-label="Filter by category"><option value="">All categories</option>${categories.map(category => `<option value="${escapeHTML(category)}" ${draft.category === category ? "selected" : ""}>${escapeHTML(category)}</option>`).join("")}</select></div>
      <div class="calc-record-modal-meta"><span>${allowed.length} compatible record${allowed.length === 1 ? "" : "s"}</span><strong data-modal-selected-count>${draft.selectedIds.length} selected</strong></div>
      <div class="calc-record-modal-list">${cards || `<div class="calc-record-empty">No compatible records. Add the required Number/Percentage properties to one or more records, or change this factor's variable mappings.</div>`}</div>
      <div class="calc-record-modal-footer"><div class="calc-row"><button type="button" class="calc-btn" data-calc-action="modal-select-visible" ${allowed.length ? "" : "disabled"}>Select visible</button><button type="button" class="calc-btn" data-calc-action="modal-clear-selection" ${draft.selectedIds.length ? "" : "disabled"}>Clear selection</button></div><div class="calc-row"><button type="button" class="calc-btn" data-calc-action="cancel-record-picker">Cancel</button><button type="button" class="calc-btn primary" data-calc-action="confirm-record-picker">Use ${draft.selectedIds.length} selected</button></div></div>
    </section>
  </div>`;
  applyRecordPickerFilters();
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
  if (!factor) { state.selectedFactorId = state.factors[0].id; return renderRunPane(); }
  const options = state.factors.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === factor.id ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("");
  const inputsHtml = renderInputSelectionCards(factor);
  const overrideRows = renderOverrideRows(factor);
  const outputs = factor.outputs;
  const resultColumns = [
    ...factor.inputs.map(input => ({ key: `record:${input.key}`, label: inputDisplayName(input, factor) })),
    ...outputs.map(output => ({ key: `output:${output.id}`, label: output.name }))
  ];
  const columnControls = resultColumns.map(column => `<label><input type="checkbox" data-column-key="${escapeHTML(column.key)}" ${state.visibleColumns[column.key] !== false ? "checked" : ""}> ${escapeHTML(column.label)}</label>`).join("");
  const sortOptions = `<option value="">Original combination order</option>${factor.inputs.map(input => `<option value="record:${escapeHTML(input.key)}" ${state.sortBy === `record:${input.key}` ? "selected" : ""}>${escapeHTML(inputDisplayName(input, factor))}</option>`).join("")}${outputs.map(output => `<option value="output:${escapeHTML(output.id)}" ${state.sortBy === `output:${output.id}` ? "selected" : ""}>${escapeHTML(output.name)}</option>`).join("")}`;
  pane.innerHTML = `
    <div class="calc-layout">
      <div class="calc-panel calc-run-setup">
        <div class="calc-item-heading"><h3 style="margin:0">Set up a calculation</h3><button type="button" class="calc-btn" data-calc-tab="factors">Edit factors</button></div>
        <div class="calc-field"><label for="calc-run-factor">Factor</label><select id="calc-run-factor">${options}</select></div>
        ${factor.description ? `<p class="calc-muted">${escapeHTML(factor.description)}</p>` : ""}
        <div class="calc-subtitle">Record selections</div><p class="calc-muted">Choose records in the pop-up selector. The compatible list is filtered by the properties your variables need.</p>${inputsHtml}
        <details class="calc-run-options"><summary class="calc-muted" style="cursor:pointer">Combination options</summary><div class="calc-field" style="margin-top:9px"><label for="calc-combination-mode">How to combine selections</label><select id="calc-combination-mode"><option value="cartesian">Every possible combination</option><option value="position">Pair lists by position</option></select><p class="calc-muted">Example: 10 weapons × 5 targets = 50 calculations. Pair-by-position needs equal list lengths or one fixed record in a source.</p></div></details>
        <details class="calc-run-options" ${state.scenarioEnabled ? "open" : ""}><summary class="calc-muted" style="cursor:pointer">Temporary scenario ${state.scenarioEnabled ? "· enabled" : "· optional"}</summary><div class="calc-item-heading" style="margin-top:10px"><p class="calc-muted" style="margin:0">Apply temporary property changes to this run. The original records stay untouched.</p><label class="calc-inline-check"><input type="checkbox" id="calc-scenario-enabled" ${state.scenarioEnabled ? "checked" : ""}> Enable</label></div><div id="calc-overrides" ${state.scenarioEnabled ? "" : "hidden"}><div id="calc-overrides-body">${overrideRows}</div><button type="button" class="calc-btn" data-calc-action="add-override">＋ Add modifier</button><p class="calc-muted">Percentage property values are fractions (0.2 = 20%).</p></div></details>
        <div class="calc-row calc-run-actions"><button type="button" class="calc-btn primary" data-calc-action="run-calculation">▶ Run calculation</button><button type="button" class="calc-btn" data-calc-action="clear-results">Clear results</button></div>
      </div>
      <div class="calc-panel calc-results-panel">
        <div class="calc-item-heading"><h3 style="margin:0">Results</h3><span class="calc-tag">${state.results.length ? `${state.results.length} row(s)` : "No run yet"}</span></div>
        ${state.results.length ? `<div class="calc-stat-row"><div class="calc-stat"><small>COMBINATIONS</small><strong>${state.results.length}</strong></div><div class="calc-stat"><small>SUCCESSFUL</small><strong>${state.results.filter(row => !row.baseError && !row.scenarioError).length}</strong></div><div class="calc-stat"><small>WITH ERRORS</small><strong>${state.results.filter(row => row.baseError || row.scenarioError).length}</strong></div></div>` : `<div class="calc-empty">Choose records and run the factor. Each combination gets a separate row, so one error does not hide successful results.</div>`}
        <div class="calc-results-toolbar"><input id="calc-results-search" type="search" placeholder="Filter by record name or error…" value="${escapeHTML(state.resultSearch)}"><select id="calc-results-sort" aria-label="Sort results">${sortOptions}</select><button type="button" class="calc-btn" data-calc-action="sort-direction">${state.sortDirection === "asc" ? "↑ Ascending" : "↓ Descending"}</button></div>
        <details><summary class="calc-muted" style="cursor:pointer">Columns, highlights and numeric filter</summary><div class="calc-columns" style="margin-top:10px">${columnControls}</div><div class="calc-row"><label class="calc-inline-check"><input type="checkbox" id="calc-highlight-max" ${state.highlightMax ? "checked" : ""}> Highlight maximum</label><label class="calc-inline-check"><input type="checkbox" id="calc-highlight-min" ${state.highlightMin ? "checked" : ""}> Highlight minimum</label></div><div class="calc-results-toolbar"><select id="calc-filter-output"><option value="">No numeric filter</option>${outputs.map(output => `<option value="${escapeHTML(output.id)}" ${state.numericFilter.outputId === output.id ? "selected" : ""}>${escapeHTML(output.name)}</option>`).join("")}</select><select id="calc-filter-operator"><option value=">" ${state.numericFilter.operator === ">" ? "selected" : ""}>greater than</option><option value=">=" ${state.numericFilter.operator === ">=" ? "selected" : ""}>at least</option><option value="<" ${state.numericFilter.operator === "<" ? "selected" : ""}>less than</option><option value="<=" ${state.numericFilter.operator === "<=" ? "selected" : ""}>at most</option><option value="=" ${state.numericFilter.operator === "=" ? "selected" : ""}>equal to</option></select><input type="number" step="any" id="calc-filter-value" value="${escapeHTML(state.numericFilter.value)}" placeholder="Threshold"></div></details>
        <div id="calc-results-table"></div><p class="calc-muted" style="margin-top:8px">Number and Percentage properties feed formulas; display values are rounded to 6 decimal places.</p>
      </div>
    </div>`;
  renderRecordPickerModal();
  renderResultsTable();
}



function renderOverrideRows(factor) {
  const overrides = state.overrideDraft || [];
  const propOptions = numericPropertyNames(state.records);
  return overrides.map((override, index) => `<div class="calc-override-row" data-override-row>
    <div class="calc-item-heading"><strong>Modifier ${index + 1}</strong><button type="button" class="calc-btn danger" data-calc-action="remove-override" data-override-index="${index}">Remove</button></div>
    <div class="calc-field-grid"><div class="calc-field"><label>Record source</label><select data-override-input>${factor.inputs.map(input => `<option value="${escapeHTML(input.key)}" ${override.inputKey === input.key ? "selected" : ""}>${escapeHTML(inputDisplayName(input, factor))}</option>`).join("")}</select></div>
    <div class="calc-field"><label>Property</label><select data-override-property>${multiOptions(propOptions, [override.property])}</select></div>
    <div class="calc-field"><label>Operation</label><select data-override-operation><option value="set" ${override.operation === "set" ? "selected" : ""}>Set value</option><option value="add" ${override.operation === "add" ? "selected" : ""}>Add amount</option><option value="subtract" ${override.operation === "subtract" ? "selected" : ""}>Subtract amount</option><option value="multiply" ${override.operation === "multiply" ? "selected" : ""}>Multiply by</option><option value="divide" ${override.operation === "divide" ? "selected" : ""}>Divide by</option></select></div>
    <div class="calc-field"><label>Value</label><input data-override-amount type="number" step="any" value="${escapeHTML(override.amount)}"><small class="calc-muted">For Percentage properties, values are fractions (0.2 = 20%).</small></div></div>
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
  const byId = new Map(state.records.map(record => [record.id, record]));
  for (const input of factor.inputs) {
    const ids = [...(state.selectedRecordIds[input.key] || [])];
    if (!ids.length) {
      if (input.optional) { selections[input.key] = [null]; continue; }
      throw new Error(`Choose at least one record for “${inputDisplayName(input, factor)}”.`);
    }
    selections[input.key] = ids.map(id => byId.get(id)).filter(Boolean);
    if (selections[input.key].length !== ids.length) throw new Error(`One selected record for “${inputDisplayName(input, factor)}” no longer exists. Refresh the calculator and try again.`);
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
    ...inputs.map(input => `<th>${escapeHTML(inputDisplayName(input, factor))}</th>`),
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
  notice("");
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
    state.results = []; state.selectedRecordIds = {}; state.inputSearch = {}; state.overrideDraft = [];
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
  const bindings = Object.fromEntries(depended.inputs.map(input => [input.key, preserved.inputs.some(parent => parent.key === input.key) ? input.key : ""]));
  preserved.dependencies.push({ factorId: id, bindings });
  state.editor = preserved;
  renderFactorEditor();
}
function addInputToEditor() {
  const factor = readEditorForm();
  let index = factor.inputs.length + 1;
  let key = `source_${index}`;
  while (factor.inputs.some(input => input.key === key)) key = `source_${++index}`;
  factor.inputs.push({ id: makeId("input"), key, label: "", optional: false, acceptedTypes: [], acceptedCategories: [], requiredProperties: [] });
  state.editor = factor; renderFactorEditor();
}
function addVariableToEditor() {
  const factor = readEditorForm();
  const commonNames = ["X", "Y", "Z", "W", "V", "U"];
  let name = commonNames.find(candidate => !factor.variables.some(variable => variable.name.toLowerCase() === candidate.toLowerCase()));
  if (!name) {
    let index = factor.variables.length + 1;
    name = `X${index}`;
    while (factor.variables.some(variable => variable.name.toLowerCase() === name.toLowerCase())) name = `X${++index}`;
  }
  factor.variables.push({ id: makeId("variable"), name, inputKey: factor.inputs[0]?.key || "", propertyName: numericPropertyNames(state.records)[0] || "" });
  state.editor = factor; state.editorError = ""; renderFactorEditor();
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
    if (removed) {
      factor.variables = factor.variables.filter(variable => variable.inputKey !== removed.key);
      factor.dependencies.forEach(dependency => {
        Object.keys(dependency.bindings).forEach(key => { if (dependency.bindings[key] === removed.key) dependency.bindings[key] = factor.inputs[0]?.key || ""; });
      });
    }
  } else if (kind === "variable") {
    factor.variables = factor.variables.filter(variable => variable.id !== id);
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
    try { const valid = validateFactor(example, state.factors); const next = [...state.factors, valid]; if (!persistFactors(next)) return; state.selectedFactorId = valid.id; state.results = []; notice("Created an example factor: X reads Weapon → Damage and Y reads Target → Armor. Choose matching records in Run & Compare.", "success"); renderAll(); }
    catch (error) { notice(error.message || String(error), "error"); }
  }
  else if (action === "close-editor") closeFactorEditor();
  else if (action === "add-input") addInputToEditor();
  else if (action === "add-variable") addVariableToEditor();
  else if (action === "add-output") addOutputToEditor();
  else if (action === "remove-input") removeFromEditor("input", target.dataset.inputId);
  else if (action === "remove-variable") removeFromEditor("variable", target.dataset.variableId);
  else if (action === "remove-output") removeFromEditor("output", target.dataset.outputId);
  else if (action === "open-record-picker") openRecordPicker(target.dataset.inputKey || "");
  else if (action === "cancel-record-picker") closeRecordPicker(false);
  else if (action === "confirm-record-picker") closeRecordPicker(true);
  else if (action === "modal-select-visible") {
    const modal = $("calc-record-picker-modal");
    const draft = state.recordPickerDraft;
    if (!modal || !draft) return;
    const selected = new Set(draft.selectedIds);
    modal.querySelectorAll("[data-record-option]:not([hidden]) [data-run-record]").forEach(checkbox => selected.add(checkbox.value));
    draft.selectedIds = [...selected];
    modal.querySelectorAll("[data-run-record]").forEach(checkbox => { checkbox.checked = selected.has(checkbox.value); });
    updateModalPickerCount();
  }
  else if (action === "modal-clear-selection") {
    const modal = $("calc-record-picker-modal");
    if (!state.recordPickerDraft || !modal) return;
    state.recordPickerDraft.selectedIds = [];
    modal.querySelectorAll("[data-run-record]").forEach(checkbox => { checkbox.checked = false; });
    updateModalPickerCount();
  }
  else if (action === "clear-input") {
    const inputKey = target.dataset.inputKey || "";
    state.overrideDraft = readOverridesSafe();
    state.scenarioEnabled = $("calc-scenario-enabled")?.checked ?? state.scenarioEnabled;
    state.selectedRecordIds[inputKey] = [];
    state.results = []; state.lastRunAt = null;
    renderRunPane();
  }
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
    rows.push({ inputKey: factor.inputs[0]?.key || "", property: numericPropertyNames(state.records)[0] || "", operation: "multiply", amount: 1.2 });
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
  // Committed source selections live in state.selectedRecordIds; the picker modal is transient.
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
    if (event.target?.id === "calc-record-picker-backdrop") { closeRecordPicker(false); return; }
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
      else if (factorAction.dataset.factorAction === "run") { state.selectedFactorId = factor.id; state.results = []; state.selectedRecordIds = {}; state.inputSearch = {}; state.visibleColumns = {}; state.sortBy = ""; state.numericFilter = { outputId: "", operator: ">", value: "" }; state.overrideDraft = []; state.scenarioEnabled = false; state.activeTab = "run"; renderAll(); setTab("run"); }
      return;
    }
    const tab = event.target.closest("[data-calc-tab]");
    if (tab) setTab(tab.dataset.calcTab);
  });
  page.addEventListener("keydown", event => {
    if (event.key === "Escape" && state.recordPickerDraft) { closeRecordPicker(false); }
  });
  page.addEventListener("submit", event => {
    if (event.target.id === "calc-factor-form") { event.preventDefault(); saveFactorFromForm(); }
  });
  page.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "calc-run-factor") {
      state.selectedRecordIds = {};
      state.inputSearch = {};
      state.recordPickerDraft = null;
      renderRecordPickerModal();
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
    if (target.matches("[data-run-record]")) {
      const draft = state.recordPickerDraft;
      if (draft && target.dataset.inputKey === draft.inputKey && target.closest("#calc-record-picker-modal")) {
        const selected = new Set(draft.selectedIds);
        if (target.checked) selected.add(target.value); else selected.delete(target.value);
        draft.selectedIds = [...selected];
        updateModalPickerCount();
      }
      return;
    }
    if (target.matches("[data-picker-type]")) { if (state.recordPickerDraft) state.recordPickerDraft.type = target.value; applyRecordPickerFilters(); return; }
    if (target.matches("[data-picker-category]")) { if (state.recordPickerDraft) state.recordPickerDraft.category = target.value; applyRecordPickerFilters(); return; }
    if (target.matches("[data-variable-name], [data-variable-input], [data-variable-property]")) {
      const row = target.closest("[data-calc-variable-row]");
      if (row) {
        const name = row.querySelector("[data-variable-name]")?.value.trim() || "X";
        const sourceKey = row.querySelector("[data-variable-input]")?.value || "";
        const property = row.querySelector("[data-variable-property]")?.value || "Choose property";
        const sourceRow = [...page.querySelectorAll("[data-calc-input-row]")].find(inputRow => inputRow.querySelector("[data-input-key]")?.value === sourceKey);
        const sourceLabel = String(sourceRow?.querySelector("[data-input-label]")?.value || "").trim() || `Source ${Math.max(1, [...page.querySelectorAll("[data-calc-input-row]")].indexOf(sourceRow) + 1)}`;
        row.querySelector("[data-variable-summary-name]")?.replaceChildren(document.createTextNode(name));
        row.querySelector("[data-variable-summary-source]")?.replaceChildren(document.createTextNode(sourceLabel));
        row.querySelector("[data-variable-summary-property]")?.replaceChildren(document.createTextNode(property));
      }
      // Keep the insertion chips in sync with variable names and mappings while editing.
      const draft = readEditorForm();
      page.querySelectorAll("[data-calc-output-row]").forEach(outputRow => {
        const outputId = outputRow.dataset.outputId;
        const tokenList = outputRow.querySelector(".calc-token-list");
        if (!tokenList) return;
        const tokens = variableCandidates(draft, state.records, state.factors, outputId);
        tokenList.innerHTML = tokens.map(token => `<button class="calc-token" type="button" data-insert-token="${escapeHTML(token.token)}" title="Insert ${escapeHTML(token.label)}">${escapeHTML(token.token)} <span class="calc-token-label">${escapeHTML(token.label)}</span></button>`).join("") || `<span class="calc-muted">Add variables above to make them available in this formula.</span>`;
      });
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
  });
  page.addEventListener("input", event => {
    const target = event.target;
    if (target.matches("[data-input-search]")) {
      if (state.recordPickerDraft && target.dataset.inputSearch === state.recordPickerDraft.inputKey) {
        state.recordPickerDraft.search = target.value;
        applyRecordPickerFilters();
      }
      return;
    }
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

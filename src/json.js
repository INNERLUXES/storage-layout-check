// A JSON reader of the tool's own. It reads the text of a layout file into nodes that keep the line and column where each
// value starts, so a finding can point at the line to look at. It reads strict JSON (RFC 8259): no comments, no trailing
// commas, no single quotes. A key written twice in one object is an error, because two readers of the same file could
// take different values from it. The reader works with a stack of its own and no recursion, and it stops at limits of
// nesting, values and string length with the line and column.
//
// Nodes:
//   { kind: 'object', entries: [{ key, line, column, value }], line, column }
//   { kind: 'array', items: [node], line, column }
//   { kind: 'string' | 'number' | 'boolean' | 'null', value, raw, line, column }
//
// Objects are lists of entries, never JavaScript objects with keys from the file, so a key such as __proto__ is only a
// name.

export const JSON_LIMITS = { maxDepth: 1000, maxNodes: 2000000, maxStringLength: 1000000 };

export class JsonError extends Error {
  constructor(message, line, column) {
    super(message);
    this.name = 'JsonError';
    this.line = line;
    this.column = column;
  }
}

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;
const ESCAPES = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };

export const isObject = (node) => node?.kind === 'object';
export const isArray = (node) => node?.kind === 'array';
export const isString = (node) => node?.kind === 'string';
export const isNumber = (node) => node?.kind === 'number';

// The entry of a key in an object node, or undefined.
export const entryOf = (node, key) => (isObject(node) ? node.entries.find((e) => e.key === key) : undefined);

// The value of a key in an object node, or undefined.
export const valueOf = (node, key) => entryOf(node, key)?.value;

// Reads a JSON text into nodes. Throws JsonError with the line and column of the first problem.
export function readJson(text, limits = JSON_LIMITS) {
  const n = text.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let nodes = 0;

  const column = (at = i) => at - lineStart + 1;
  const fail = (message, at = i) => {
    throw new JsonError(`${message} at line ${line}, column ${column(at)}`, line, column(at));
  };
  const what = () => (i >= n ? 'the end of the file' : `"${text[i] === '"' ? '\\"' : text[i]}"`);

  function skipSpace() {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09) i += 1;
      else if (c === 0x0a) {
        i += 1;
        line += 1;
        lineStart = i;
      } else if (c === 0x0d) {
        i += 1;
        if (text.charCodeAt(i) === 0x0a) i += 1;
        line += 1;
        lineStart = i;
      } else break;
    }
  }

  function readString() {
    const start = i;
    i += 1;
    let out = '';
    let from = i;
    while (true) {
      if (i >= n) fail('a string is not closed', start);
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        out += text.slice(from, i);
        i += 1;
        break;
      }
      if (c < 0x20) fail('a string holds a control character or a line end; write it as an escape');
      if (c === 0x5c) {
        out += text.slice(from, i);
        const e = text[i + 1];
        if (e === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!HEX4.test(hex)) fail('a \\u escape needs four hex digits');
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else if (e !== undefined && Object.hasOwn(ESCAPES, e)) {
          out += ESCAPES[e];
          i += 2;
        } else fail('a string holds an escape JSON does not have');
        from = i;
      } else i += 1;
      if (i - start > limits.maxStringLength) fail(`a string is longer than ${limits.maxStringLength} characters`, start);
    }
    return out;
  }

  function scalar(kind, value, raw, l, c) {
    return { kind, value, raw, line: l, column: c };
  }

  // Reads the start of a value: a scalar whole, or the opening of an object or an array, which is pushed on the stack.
  function begin(stack) {
    nodes += 1;
    if (nodes > limits.maxNodes) fail(`the file holds more than ${limits.maxNodes} values`);
    const l = line;
    const c = column();
    const ch = text[i];
    if (ch === '{' || ch === '[') {
      if (stack.length + 1 > limits.maxDepth) fail(`objects and arrays are nested more than ${limits.maxDepth} deep`);
      i += 1;
      const node = ch === '{' ? { kind: 'object', entries: [], line: l, column: c } : { kind: 'array', items: [], line: l, column: c };
      stack.push({ node, first: true, keys: ch === '{' ? new Set() : null });
      return node;
    }
    if (ch === '"') {
      const value = readString();
      return scalar('string', value, value, l, c);
    }
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (!m) fail('a number is not written the way JSON writes numbers');
      i += m[0].length;
      return scalar('number', Number(m[0]), m[0], l, c);
    }
    for (const [word, value] of [['true', true], ['false', false], ['null', null]]) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return scalar(value === null ? 'null' : 'boolean', value, word, l, c);
      }
    }
    return fail(`expected a value and found ${what()}`);
  }

  function member(frame) {
    if (text[i] !== '"') fail(`expected a key in double quotes and found ${what()}`);
    const l = line;
    const c = column();
    const key = readString();
    if (frame.keys.has(key)) fail(`the key "${key.slice(0, 80)}" is written twice in one object`, i - 1);
    frame.keys.add(key);
    skipSpace();
    if (text[i] !== ':') fail(`expected ":" after a key and found ${what()}`);
    i += 1;
    skipSpace();
    frame.node.entries.push({ key, line: l, column: c, value: begin(stack) });
  }

  const stack = [];
  skipSpace();
  if (i >= n) fail('the file holds no JSON value');
  const root = begin(stack);
  while (stack.length > 0) {
    const frame = stack[stack.length - 1];
    skipSpace();
    const close = frame.node.kind === 'object' ? '}' : ']';
    if (frame.first) {
      frame.first = false;
      if (text[i] === close) {
        i += 1;
        stack.pop();
        continue;
      }
    } else if (text[i] === ',') {
      i += 1;
      skipSpace();
    } else if (text[i] === close) {
      i += 1;
      stack.pop();
      continue;
    } else fail(`expected "," or "${close}" and found ${what()}`);
    if (frame.node.kind === 'object') member(frame);
    else frame.node.items.push(begin(stack));
  }
  skipSpace();
  if (i < n) fail(`text after the end of the JSON value: ${what()}`);
  return root;
}

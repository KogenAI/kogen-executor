'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const assert = require('node:assert/strict');

const P = 'core-text-differs-from-elixir-format: ';
const ROOT = path.resolve(__dirname, '../..');
const TEST = 'TestCoreTextAcceptanceRender';
const VALID_CODE_POINTS = 0x110000 - 0x800;
const DRIVER = `package core_test

import (
	"encoding/json"
	"os"
	"strconv"
	"testing"

	"github.com/KogenAI/kogen-executor/core"
)

func ${TEST}(t *testing.T) {
	data, err := os.ReadFile(os.Getenv("CORE_TEXT_REQUEST"))
	if err != nil {
		t.Fatal(err)
	}
	var requests []struct{ Kind, Text, Before, After string }
	if err := json.Unmarshal(data, &requests); err != nil {
		t.Fatal(err)
	}
	results := make([]any, len(requests))
	for i, r := range requests {
		switch r.Kind {
		case "inspect":
			results[i] = core.InspectString(r.Text)
		case "sweep":
			var all []string
			for cp := rune(0); cp <= 0x10FFFF; cp++ {
				if cp >= 0xD800 && cp <= 0xDFFF {
					continue
				}
				all = append(all, core.InspectString(r.Before+string(cp)+r.After))
			}
			results[i] = all
		case "float64":
			f, err := strconv.ParseFloat(r.Text, 64)
			if err != nil {
				t.Fatal(err)
			}
			results[i] = core.Display(f)
		case "json.Number":
			results[i] = core.Display(json.Number(r.Text))
		case "int":
			n, err := strconv.Atoi(r.Text)
			if err != nil {
				t.Fatal(err)
			}
			results[i] = core.Display(n)
		case "string":
			results[i] = core.Display(r.Text)
		case "nil":
			results[i] = core.Display(nil)
		case "bool":
			b, err := strconv.ParseBool(r.Text)
			if err != nil {
				t.Fatal(err)
			}
			results[i] = core.Display(b)
		case "finding":
			var message map[string]any
			if err := json.Unmarshal([]byte(r.Text), &message); err != nil {
				t.Fatal(err)
			}
			results[i] = core.Display(message["path"]) + ":" + core.Display(message["line"]) + ": " + core.Display(message["message"])
		default:
			t.Fatalf("unknown kind %q", r.Kind)
		}
	}
	out, err := json.Marshal(results)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(os.Getenv("CORE_TEXT_RESULT"), out, 0o600); err != nil {
		t.Fatal(err)
	}
	t.Log("CORE_TEXT_RENDERED")
}
`;

let work;
function testBinary() {
  if (work) return work.binary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-text-'));
  process.on('exit', () => fs.rmSync(dir, {recursive: true, force: true}));
  const source = path.join(dir, 'driver_test.go');
  fs.writeFileSync(source, DRIVER);
  const overlay = path.join(dir, 'overlay.json');
  // The overlay key is relative so that it names the package directory however go resolves the working directory.
  fs.writeFileSync(overlay, JSON.stringify({Replace: {'core/zz_core_text_acceptance_test.go': source}}));
  const binary = path.join(dir, 'core.test');
  const args = ['test', '-overlay', overlay, '-c', '-o', binary, './core'];
  const r = spawnSync('go', args, {cwd: ROOT, encoding: 'utf8', timeout: 300000});
  assert.equal(r.status, 0, `${TEST}: "go ${args.join(' ')}" exited ${r.status}: ${r.error || ''}\n${r.stdout}${r.stderr}`);
  work = {dir, binary};
  return binary;
}

// render runs the requests through core.InspectString and core.Display in the compiled package test.
function render(requests) {
  const binary = testBinary();
  const dir = fs.mkdtempSync(path.join(work.dir, 'run-'));
  const request = path.join(dir, 'request.json');
  const result = path.join(dir, 'result.json');
  fs.writeFileSync(request, JSON.stringify(requests));
  const args = [`-test.run=^${TEST}$`, '-test.v', '-test.count=1'];
  const r = spawnSync(binary, args, {
    cwd: path.join(ROOT, 'core'), encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20,
    env: {...process.env, CORE_TEXT_REQUEST: request, CORE_TEXT_RESULT: result},
  });
  const output = `${r.stdout || ''}${r.stderr || ''}`;
  const ran = output.includes(`=== RUN   ${TEST}`);
  assert.ok(ran && r.status === 0 && output.includes('CORE_TEXT_RENDERED'),
    `${TEST} ${ran ? 'ran' : 'did not run'} via "${binary} ${args.join(' ')}" and exited ${r.status}: ${r.error || ''}\n${output.slice(0, 4000)}`);
  return JSON.parse(fs.readFileSync(result, 'utf8'));
}

const label = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

function codePoint(text) {
  const m = /^U\+([0-9A-F]{4,6})$/.exec(text);
  assert.ok(m, `${P}not a code point: ${JSON.stringify(text)}`);
  const cp = parseInt(m[1], 16);
  assert.ok(cp <= 0x10FFFF && (cp < 0xD800 || cp > 0xDFFF), `${P}not a valid code point: ${text}`);
  return cp;
}

// Each line is "U+XXXX <expected text>"; in the expected text <raw> stands for the code point itself
// and <u-escape> for a backslash, "u" and the code point's four uppercase hex digits.
function inspectCodePoints(before, after, listing) {
  const cases = listing.split('\n').filter(line => line.trim()).map(line => {
    const m = /^(\S+) (.+)$/.exec(line.trim());
    assert.ok(m, `${P}bad code point line ${JSON.stringify(line)}`);
    const cp = codePoint(m[1]);
    const raw = String.fromCodePoint(cp);
    const escape = `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    return {label: `"${before}" + ${m[1]} + "${after}"`, text: before + raw + after, expected: m[2].split('<raw>').join(raw).split('<u-escape>').join(escape)};
  });
  const got = render(cases.map(c => ({Kind: 'inspect', Text: c.text})));
  return cases.map((c, i) => ({label: `InspectString(${c.label})`, expected: c.expected, actual: got[i]}));
}

function displayValues(rows) {
  const got = render(rows.map(row => ({Kind: row.kind, Text: row.input})));
  return rows.map((row, i) => ({label: `Display(${row.kind} ${JSON.stringify(row.input)})`, expected: row.output, actual: got[i]}));
}

function checkResults(results) {
  assert.ok(results.length > 0, `${P}no results`);
  const wrong = results.filter(r => r.actual !== r.expected);
  assert.equal(wrong.length, 0, `${wrong.length} of ${results.length} results differ:\n` +
    wrong.map(r => `${r.label}: expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`).join('\n'));
}

function sweep(before, after) {
  const [renderings] = render([{Kind: 'sweep', Before: before, After: after}]);
  assert.equal(renderings.length, VALID_CODE_POINTS,
    `${TEST}: the sweep returned ${renderings.length} renderings, expected ${VALID_CODE_POINTS} (U+0000..U+10FFFF without surrogates)`);
  return {before, after, renderings};
}

function expectedForm(form, cp) {
  const hex = width => cp.toString(16).toUpperCase().padStart(width, '0');
  switch (form) {
    case 'raw': return String.fromCodePoint(cp);
    case '\\xHH': return `\\x${hex(2)}`;
    case '\\uHHHH': return `\\u${hex(4)}`;
    case '\\x{HHHH}': return `\\x{${hex(4)}}`;
    default: return form;
  }
}

// Each line is "U+XXXX <form>" or "U+XXXX..U+YYYY <form>"; the rules cover U+0000..end in order.
function checkRules({before, after, renderings}, text, end = 0x10FFFF) {
  const rules = text.split('\n').filter(line => line.trim()).map(line => {
    const m = /^(U\+[0-9A-F]+)(?:\.\.(U\+[0-9A-F]+))? (\S+)$/.exec(line.trim());
    assert.ok(m, `${P}bad rule line ${JSON.stringify(line)}`);
    const from = codePoint(m[1]);
    const to = m[2] ? codePoint(m[2]) : from;
    assert.ok(from <= to && !(from < 0xD800 && to > 0xDFFF), `${P}bad rule range ${line.trim()}`);
    return {from, to, form: m[3], line: line.trim()};
  });
  let next = 0;
  for (const rule of rules) {
    assert.equal(rule.from, next, `${P}rule "${rule.line}" must start at ${label(next)}`);
    next = rule.to + 1 === 0xD800 ? 0xE000 : rule.to + 1;
  }
  assert.equal(next, end + 1, `${P}the rules must end at ${label(end)}`);
  const wrong = [];
  let count = 0;
  for (const rule of rules) {
    for (let cp = rule.from; cp <= rule.to; cp++) {
      const expected = `"${before}${expectedForm(rule.form, cp)}${after}"`;
      const actual = renderings[cp < 0xD800 ? cp : cp - 0x800];
      if (actual !== expected) {
        count++;
        if (wrong.length < 40) wrong.push(`${label(cp)} (rule "${rule.line}"): expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    }
  }
  assert.equal(count, 0, `${count} code points render differently from the rules (first ${wrong.length}):\n${wrong.join('\n')}`);
}

// Only the code point's own text is examined, so a hex letter in the surrounding text is not counted.
function checkShortUnicodeEscapes({before, after, renderings}) {
  const wrong = [];
  renderings.forEach((text, i) => {
    const own = text.slice(1 + before.length, text.length - 1 - after.length);
    if (/\\u[0-9A-Fa-f]{5}/.test(own)) wrong.push(`${label(i < 0xD800 ? i : i + 0x800)}: ${JSON.stringify(text)}`);
  });
  assert.equal(wrong.length, 0, `${wrong.length} renderings have a \\u escape with more than four hex digits (first 20):\n${wrong.slice(0, 20).join('\n')}`);
}

const CONTROL_RULES = `
U+0000 \\0
U+0001..U+0006 \\xHH
U+0007 \\a
U+0008 \\b
U+0009 \\t
U+000A \\n
U+000B \\v
U+000C \\f
U+000D \\r
U+000E..U+001A \\xHH
U+001B \\e
U+001C..U+001F \\xHH
U+0020..U+0021 raw
U+0022 \\"
U+0023..U+005B raw
U+005C \\\\
U+005D..U+007E raw
`;
const CONTROL_POINTS = `
U+0001 "a\\x01b"
U+0022 "a\\"b"
U+0000 "a\\0b"
U+200B "a<u-escape>b"
U+1F600 "a<raw>b"
`;
const CONTROL_VALUES = [
  {kind: 'float64', input: '0.5', output: '0.5'},
  {kind: 'json.Number', input: '3', output: '3'},
  {kind: 'nil', input: '', output: ''},
  {kind: 'finding', input: '{"path":"path","line":12.0,"message":"message"}', output: 'path:12.0: message'},
];

// The controls use only renderings the unchanged and the fixed code share; bad mutates one expectation per check.
function controls(mode) {
  const all = sweep('a', 'b');
  const checks = [
    ['rules', () => checkRules(all, mode === 'good' ? CONTROL_RULES : CONTROL_RULES.replace('U+0001..U+0006 \\xHH', 'U+0001..U+0006 \\uHHHH'), 0x7E), 'U+0001'],
    ['points', () => checkResults(inspectCodePoints('a', 'b', mode === 'good' ? CONTROL_POINTS : CONTROL_POINTS.replace('"a\\x01b"', '"a<u-escape>b"'))), 'U+0001'],
    ['text', () => assert.equal(render([{Kind: 'inspect', Text: '#{'}])[0], mode === 'good' ? '"\\#{"' : '"#{"'), '#{'],
    ['values', () => checkResults(displayValues(mode === 'good' ? CONTROL_VALUES : CONTROL_VALUES.map(v => v.input === '0.5' ? {...v, output: '0.50'} : v))), '0.5'],
    ['short escapes', () => checkShortUnicodeEscapes(mode === 'good' ? {...all, renderings: all.renderings.slice(0, 0xF800)} : {...all, renderings: ['"a\\' + 'u1F600b"']}), 'U+0000'],
  ];
  const failures = [];
  for (const [name, check, mark] of checks) {
    try {
      check();
      if (mode === 'bad') failures.push(`${name}: bad control accepted`);
    } catch (err) {
      if (mode === 'good' || !String(err.message).includes(mark)) failures.push(`${name}: ${err.message}`);
    }
  }
  return failures;
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode !== 'good' && mode !== 'bad') {
    console.log('usage: good|bad');
    process.exitCode = 2;
  } else {
    let failures;
    try {
      failures = controls(mode);
    } catch (err) {
      failures = [err.message];
    }
    if (failures.length) {
      console.log(`observer failed ${mode} controls:\n${failures.join('\n')}`);
      process.exitCode = 2;
    } else if (mode === 'good') {
      console.log('observer good');
    } else {
      console.log('observer rejected bad controls');
      process.exitCode = 1;
    }
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const timeout = 600000;
  When(P + 'I inspect each code point between {string} and {string}:', {timeout}, function (before, after, listing) {
    this.coreTextResults = inspectCodePoints(before, after, listing);
  });
  When(P + 'I inspect the text {string}', {timeout}, function (text) {
    this.coreTextInspected = render([{Kind: 'inspect', Text: text}])[0];
  });
  When(P + 'I inspect every valid code point between {string} and {string}', {timeout}, function (before, after) {
    this.coreTextSweep = sweep(before, after);
  });
  When(P + 'I display each value:', {timeout}, function (table) {
    this.coreTextResults = displayValues(table.hashes());
  });
  Then(P + 'every result is as listed', function () {
    checkResults(this.coreTextResults);
  });
  Then(P + 'the inspected text is:', function (expected) {
    assert.equal(this.coreTextInspected, expected);
  });
  Then(P + 'each code point renders by these rules:', function (rules) {
    checkRules(this.coreTextSweep, rules);
  });
  Then(P + 'no inspected text has a u-escape with more than four hex digits', function () {
    checkShortUnicodeEscapes(this.coreTextSweep);
  });
}

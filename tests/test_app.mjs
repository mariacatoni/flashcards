import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";


function element() {
  return {
    addEventListener() {},
    append() {},
    classList: { toggle() {} },
    options: [],
    replaceChildren() {},
    setAttribute() {},
  };
}

async function loadTestFunctions() {
  const source = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
  const context = {
    console,
    document: {
      addEventListener() {},
      createElement: element,
      querySelector: element,
      querySelectorAll() {
        return [];
      },
    },
    fetch() {
      return new Promise(() => {});
    },
    HTMLButtonElement: class {},
    HTMLInputElement: class {},
    HTMLSelectElement: class {},
  };
  vm.runInNewContext(
    `${source}\n;globalThis.testFunctions = { migrateLegacyAssignments };`,
    context,
  );
  return context.testFunctions;
}

test("legacy deck assignments retain their old meaning", async () => {
  const { migrateLegacyAssignments } = await loadTestFunctions();
  const entries = [{ id: "unassigned" }, { id: "studying" }, { id: "learned" }];
  const legacy = {
    studying: "studying",
    learned: "learned",
    removed: "learned",
  };

  assert.deepEqual(
    { ...migrateLegacyAssignments(entries, legacy) },
    { unassigned: "later", learned: "learned" },
  );
});

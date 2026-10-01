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
    `${source}\n;globalThis.testFunctions = {
      clampStrokeIndex,
      datasetLevels,
      datasetUrlFromManifest,
      filterSummary,
      initialDeckFor,
      cardMatchesQuery,
      matchingSearchSuggestions,
      migrateLegacyAssignments,
      strokeCharactersFor,
      updateFilterValues,
    };`,
    context,
  );
  return context.testFunctions;
}

test("legacy deck assignments retain their old meaning", async () => {
  const { migrateLegacyAssignments } = await loadTestFunctions();
  const entries = [
    { id: "unassigned", level: 1 },
    { id: "studying", level: 1 },
    { id: "learned", level: 1 },
    { id: "new-level", level: 3 },
  ];
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

test("new levels begin unclassified without changing the opening deck", async () => {
  const { initialDeckFor } = await loadTestFunctions();

  assert.equal(initialDeckFor({ level: 1 }), "studying");
  assert.equal(initialDeckFor({ level: 2 }), "studying");
  assert.equal(initialDeckFor({ level: 3 }), "unclassified");
  assert.equal(initialDeckFor({ level: 4 }), "unclassified");
  assert.equal(initialDeckFor({ level: 5 }), "unclassified");
});

test("stroke-order characters preserve repeated positions in a word", async () => {
  const { strokeCharactersFor } = await loadTestFunctions();

  assert.deepEqual(
    [...strokeCharactersFor({ simplified: "爸爸", characters: ["爸", "爸"] })],
    ["爸", "爸"],
  );
  assert.deepEqual(
    [...strokeCharactersFor({ simplified: "学习", characters: ["学", "习"] })],
    ["学", "习"],
  );
});

test("stroke-order navigation stays within the current word", async () => {
  const { clampStrokeIndex } = await loadTestFunctions();

  assert.equal(clampStrokeIndex(-1, 2), 0);
  assert.equal(clampStrokeIndex(1, 2), 1);
  assert.equal(clampStrokeIndex(2, 2), 1);
  assert.equal(clampStrokeIndex(4, 0), 0);
});

test("checkbox filters can combine or remove selections", async () => {
  const { updateFilterValues } = await loadTestFunctions();

  assert.deepEqual([...updateFilterValues(["1"], "2", true)], ["1", "2"]);
  assert.deepEqual([...updateFilterValues(["1", "2"], "1", false)], ["2"]);
  assert.deepEqual([...updateFilterValues(["studying"], "studying", false)], []);
});

test("filter summaries stay concise", async () => {
  const { filterSummary } = await loadTestFunctions();
  const labels = { 1: "HSK 1", 2: "HSK 2" };

  assert.equal(filterSummary([], labels, "No levels"), "No levels");
  assert.equal(filterSummary(["1"], labels, "No levels"), "HSK 1");
  assert.equal(filterSummary(["1", "2"], labels, "No levels"), "2 selected");
});

test("available HSK levels come from dataset metadata", async () => {
  const { datasetLevels } = await loadTestFunctions();

  assert.deepEqual(
    [...datasetLevels({ dataset: { levels: [4, 1, 3, 2, 4] } })],
    [1, 2, 3, 4],
  );
  assert.deepEqual([...datasetLevels({ dataset: { levels: [0, 1, 10] } })], [1]);
  assert.deepEqual(
    [...datasetLevels({ dataset: { levels: [9, 7, 5, 3, 1, 2, 4, 6, 8] } })],
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
});

test("the data manifest only accepts local JSON filenames", async () => {
  const { datasetUrlFromManifest } = await loadTestFunctions();

  assert.equal(
    datasetUrlFromManifest({ schemaVersion: 1, dataset: "levels-1-4.json" }),
    "./data/levels-1-4.json",
  );
  assert.throws(() =>
    datasetUrlFromManifest({ schemaVersion: 1, dataset: "../private.json" }),
  );
});

test("search matches characters and common pinyin forms", async () => {
  const { cardMatchesQuery } = await loadTestFunctions();
  const card = {
    simplified: "学习",
    pinyin: { display: "xué xí", numbered: "xue2 xi2" },
  };

  assert.equal(cardMatchesQuery(card, "学"), true);
  assert.equal(cardMatchesQuery(card, "xue"), true);
  assert.equal(cardMatchesQuery(card, "xué"), true);
  assert.equal(cardMatchesQuery(card, "xue2"), true);
  assert.equal(cardMatchesQuery(card, "shi"), false);
});

test("search suggestions rank exact matches first and respect the limit", async () => {
  const { matchingSearchSuggestions } = await loadTestFunctions();
  const cards = [
    {
      id: "two",
      simplified: "学习",
      pinyin: { display: "xué xí", numbered: "xue2 xi2" },
    },
    { id: "one", simplified: "学", pinyin: { display: "xué", numbered: "xue2" } },
    {
      id: "three",
      simplified: "学校",
      pinyin: { display: "xué xiào", numbered: "xue2 xiao4" },
    },
  ];

  assert.deepEqual(
    [...matchingSearchSuggestions(cards, "xue", 2)].map((card) => card.id),
    ["one", "two"],
  );
  assert.deepEqual(
    [...matchingSearchSuggestions(cards, "学校", 2)].map((card) => card.id),
    ["three"],
  );
  assert.deepEqual([...matchingSearchSuggestions(cards, "", 2)], []);
});

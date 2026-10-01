const STORAGE_KEY = "hsk-flashcards.deck-assignments.v2";
const LEGACY_STORAGE_KEY = "hsk-flashcards.deck-assignments.v1";
const LEGACY_DEFAULT_DECK = "later";
const HANZI_WRITER_SRC =
  "https://cdn.jsdelivr.net/npm/hanzi-writer@3.7.3/dist/hanzi-writer.min.js";
const HANZI_DATA_ROOT =
  "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/";
const DEFAULT_FILTER_DECK = "studying";
const NEW_CARD_DECK = "unclassified";
const PRECLASSIFIED_MAX_LEVEL = 2;
const SEARCH_SUGGESTION_LIMIT = 7;
const DECK_LABELS = {
  unclassified: "Unclassified",
  later: "To learn later",
  studying: "Studying",
  learned: "Learned",
};
const TONE_MARK_PATTERN = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u;

const state = {
  document: null,
  cards: [],
  index: 0,
  levels: [],
  decks: [DEFAULT_FILTER_DECK],
  query: "",
  searchSuggestionIndex: -1,
  searchSuggestionsVisible: false,
  assignments: {},
  canPersist: true,
  showPinyin: true,
  showEnglish: true,
  strokeCharacters: [],
  strokeIndex: 0,
  strokeWriter: null,
  strokeRenderToken: 0,
};

let hanziWriterPromise;

const elements = {
  levelFilterOptions: document.querySelector("#level-filter-options"),
  levelFilterSummary: document.querySelector("#level-filter-summary"),
  searchInput: document.querySelector("#search-input"),
  searchSuggestions: document.querySelector("#search-suggestions"),
  deckFilters: [...document.querySelectorAll(".deck-filter-input")],
  deckFilterSummary: document.querySelector("#deck-filter-summary"),
  deckCountLabels: [...document.querySelectorAll("[data-deck-count]")],
  filterMenus: [...document.querySelectorAll(".filter-menu details")],
  progress: document.querySelector("#progress"),
  cardMeta: document.querySelector("#card-meta"),
  levelBadge: document.querySelector("#level-badge"),
  partOfSpeech: document.querySelector("#part-of-speech"),
  hanzi: document.querySelector("#hanzi"),
  pinyin: document.querySelector("#pinyin"),
  translation: document.querySelector("#translation"),
  cardContent: document.querySelector("#card-content"),
  errorMessage: document.querySelector("#error-message"),
  emptyMessage: document.querySelector("#empty-message"),
  deckAssignment: document.querySelector("#deck-assignment"),
  deckButtons: [...document.querySelectorAll(".deck-button")],
  deckStatus: document.querySelector("#deck-status"),
  togglePinyin: document.querySelector("#toggle-pinyin"),
  toggleEnglish: document.querySelector("#toggle-english"),
  openStrokeOrder: document.querySelector("#open-stroke-order"),
  strokeDialog: document.querySelector("#stroke-dialog"),
  closeStrokeOrder: document.querySelector("#close-stroke-order"),
  strokeCharacter: document.querySelector("#stroke-character"),
  strokePosition: document.querySelector("#stroke-position"),
  strokeTarget: document.querySelector("#stroke-target"),
  strokeStatus: document.querySelector("#stroke-status"),
  strokeNavigation: document.querySelector("#stroke-navigation"),
  previousStrokeCharacter: document.querySelector("#previous-stroke-character"),
  replayStrokes: document.querySelector("#replay-strokes"),
  nextStrokeCharacter: document.querySelector("#next-stroke-character"),
  previous: document.querySelector("#previous-card"),
  shuffle: document.querySelector("#shuffle-card"),
  next: document.querySelector("#next-card"),
};

const toneVowels = {
  a: ["a", "ā", "á", "ǎ", "à"],
  e: ["e", "ē", "é", "ě", "è"],
  i: ["i", "ī", "í", "ǐ", "ì"],
  o: ["o", "ō", "ó", "ǒ", "ò"],
  u: ["u", "ū", "ú", "ǔ", "ù"],
  ü: ["ü", "ǖ", "ǘ", "ǚ", "ǜ"],
};

function markSyllable(spelling, tone) {
  if (tone === 5) return spelling;

  const lower = spelling.toLowerCase();
  let vowelIndex = lower.indexOf("a");
  if (vowelIndex < 0) vowelIndex = lower.indexOf("e");
  if (vowelIndex < 0 && lower.includes("ou")) vowelIndex = lower.indexOf("o");
  if (vowelIndex < 0) {
    for (let index = lower.length - 1; index >= 0; index -= 1) {
      if (toneVowels[lower[index]]) {
        vowelIndex = index;
        break;
      }
    }
  }
  if (vowelIndex < 0) return spelling;

  const vowel = lower[vowelIndex];
  const marked = toneVowels[vowel]?.[tone] ?? vowel;
  return `${spelling.slice(0, vowelIndex)}${marked}${spelling.slice(vowelIndex + 1)}`;
}

function currentCard() {
  return state.cards[state.index];
}

function initialDeckFor(card) {
  return Number(card?.level) <= PRECLASSIFIED_MAX_LEVEL
    ? DEFAULT_FILTER_DECK
    : NEW_CARD_DECK;
}

function deckFor(card) {
  return state.assignments[card.id] ?? initialDeckFor(card);
}

function strokeCharactersFor(card) {
  const characters = Array.isArray(card?.characters)
    ? card.characters
    : [...(card?.simplified ?? "")];
  return characters.filter((character) => character.trim().length > 0);
}

function clampStrokeIndex(index, characterCount) {
  if (characterCount === 0) return 0;
  return Math.min(Math.max(index, 0), characterCount - 1);
}

function sanitizeAssignments(value, validIds) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).filter(
      ([id, deck]) => validIds.has(id) && Object.hasOwn(DECK_LABELS, deck),
    ),
  );
}

function migrateLegacyAssignments(entries, value) {
  const validIds = new Set(entries.map((card) => card.id));
  const legacyAssignments = sanitizeAssignments(value, validIds);

  return Object.fromEntries(
    entries
      .map((card) => {
        const deck =
          legacyAssignments[card.id] ??
          (Number(card.level) <= PRECLASSIFIED_MAX_LEVEL
            ? LEGACY_DEFAULT_DECK
            : initialDeckFor(card));
        return [card.id, deck, card];
      })
      .filter(([, deck, card]) => deck !== initialDeckFor(card))
      .map(([id, deck]) => [id, deck]),
  );
}

function loadAssignments() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const validIds = new Set(state.document.entries.map((card) => card.id));
    if (saved) return sanitizeAssignments(JSON.parse(saved), validIds);

    const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacySaved) return {};

    const migrated = migrateLegacyAssignments(
      state.document.entries,
      JSON.parse(legacySaved),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch (error) {
    state.canPersist = false;
    console.warn("Deck assignments could not be read from browser storage.", error);
    return {};
  }
}

function saveAssignments() {
  if (!state.canPersist) return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.assignments));
  } catch (error) {
    state.canPersist = false;
    console.warn("Deck assignments could not be saved to browser storage.", error);
  }
}

function updateFilterValues(values, value, checked) {
  const nextValues = values.filter((item) => item !== value);
  if (checked) nextValues.push(value);
  return nextValues;
}

function datasetLevels(documentValue) {
  const levels = documentValue?.dataset?.levels;
  if (!Array.isArray(levels)) return [];
  return [...new Set(levels)]
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 9)
    .sort((left, right) => left - right);
}

function datasetUrlFromManifest(manifest) {
  const filename = manifest?.dataset;
  if (
    manifest?.schemaVersion !== 1 ||
    typeof filename !== "string" ||
    !/^[a-zA-Z0-9._-]+\.json$/.test(filename)
  ) {
    throw new Error("The data manifest is invalid.");
  }
  return `./data/${filename}`;
}

function filterSummary(values, labels, emptyLabel) {
  if (values.length === 0) return emptyLabel;
  if (values.length === 1) return labels[values[0]];
  return `${values.length} selected`;
}

function cardsInSelectedLevels() {
  return state.document.entries.filter(
    (card) => state.levels.includes(String(card.level)),
  );
}

function renderLevelFilters() {
  const availableLevels = datasetLevels(state.document);
  const availableValues = availableLevels.map(String);
  state.levels = state.levels.filter((level) => availableValues.includes(level));
  if (state.levels.length === 0 && availableValues.length > 0) {
    state.levels = [availableValues[0]];
  }

  const choices = availableLevels.map((level) => {
    const label = document.createElement("label");
    label.className = "filter-choice";

    const checkbox = document.createElement("input");
    checkbox.className = "level-filter-input";
    checkbox.type = "checkbox";
    checkbox.value = String(level);
    checkbox.checked = state.levels.includes(String(level));

    const text = document.createElement("span");
    text.textContent = `HSK ${level}`;
    label.append(checkbox, text);
    return label;
  });
  elements.levelFilterOptions.replaceChildren(...choices);
}

function normalizeMarkedPinyin(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replaceAll("u:", "ü")
    .replaceAll("v", "ü")
    .replace(/[\s'’.-]/g, "");
}

function normalizeNumberedPinyin(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replaceAll("u:", "v")
    .replaceAll("ü", "v")
    .replace(/[^a-z1-5]/g, "");
}

function normalizePlainPinyin(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll("v", "u")
    .replace(/[1-5]/g, "")
    .replace(/[^a-z]/g, "");
}

function cardMatchesQuery(card, queryValue) {
  const query = queryValue.trim();
  if (!query) return true;
  if (card.simplified.includes(query)) return true;

  if (/[1-5]/.test(query)) {
    const normalizedQuery = normalizeNumberedPinyin(query);
    return (
      normalizedQuery.length > 0 &&
      normalizeNumberedPinyin(card.pinyin.numbered).includes(normalizedQuery)
    );
  }

  if (TONE_MARK_PATTERN.test(query.normalize("NFC"))) {
    const normalizedQuery = normalizeMarkedPinyin(query);
    return (
      normalizedQuery.length > 0 &&
      normalizeMarkedPinyin(card.pinyin.display).includes(normalizedQuery)
    );
  }

  const normalizedQuery = normalizePlainPinyin(query);
  return (
    normalizedQuery.length > 0 &&
    normalizePlainPinyin(card.pinyin.display).includes(normalizedQuery)
  );
}

function matchesSearch(card) {
  return cardMatchesQuery(card, state.query);
}

function searchMatchRank(card, queryValue) {
  const query = queryValue.trim();
  if (card.simplified === query) return 0;
  if (card.simplified.startsWith(query)) return 1;

  let normalizedQuery;
  let normalizedPinyin;
  if (/[1-5]/.test(query)) {
    normalizedQuery = normalizeNumberedPinyin(query);
    normalizedPinyin = normalizeNumberedPinyin(card.pinyin.numbered);
  } else if (TONE_MARK_PATTERN.test(query.normalize("NFC"))) {
    normalizedQuery = normalizeMarkedPinyin(query);
    normalizedPinyin = normalizeMarkedPinyin(card.pinyin.display);
  } else {
    normalizedQuery = normalizePlainPinyin(query);
    normalizedPinyin = normalizePlainPinyin(card.pinyin.display);
  }

  if (normalizedQuery && normalizedPinyin === normalizedQuery) return 0;
  if (normalizedQuery && normalizedPinyin.startsWith(normalizedQuery)) return 1;
  return 2;
}

function matchingSearchSuggestions(cards, query, limit = SEARCH_SUGGESTION_LIMIT) {
  if (!query.trim() || limit <= 0) return [];
  return cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => cardMatchesQuery(card, query))
    .sort(
      (left, right) =>
        searchMatchRank(left.card, query) - searchMatchRank(right.card, query) ||
        left.index - right.index,
    )
    .slice(0, limit)
    .map(({ card }) => card);
}

function updateDeckOptions() {
  const counts = { unclassified: 0, later: 0, studying: 0, learned: 0 };
  cardsInSelectedLevels().forEach((card) => {
    counts[deckFor(card)] += 1;
  });

  elements.deckCountLabels.forEach((label) => {
    const deck = label.dataset.deckCount;
    label.textContent = `${DECK_LABELS[deck]} (${counts[deck]})`;
  });
}

function updateFilterSummaries() {
  const levelLabels = Object.fromEntries(
    datasetLevels(state.document).map((level) => [String(level), `HSK ${level}`]),
  );
  elements.levelFilterSummary.textContent = filterSummary(
    state.levels,
    levelLabels,
    "No levels",
  );
  elements.deckFilterSummary.textContent = filterSummary(
    state.decks,
    DECK_LABELS,
    "No decks",
  );
}

function createToneSpan(text, tone) {
  const span = document.createElement("span");
  span.className = `tone-${tone}`;
  span.textContent = text;
  span.dataset.tone = String(tone);
  return span;
}

function renderHanzi(card) {
  elements.hanzi.replaceChildren();
  const syllables = card.pinyin.readings[0] ?? [];
  card.characters.forEach((character, index) => {
    const tone = syllables[index]?.tone ?? 5;
    elements.hanzi.append(createToneSpan(character, tone));
  });
  elements.hanzi.setAttribute("aria-label", card.simplified);
}

function renderPinyin(card) {
  elements.pinyin.replaceChildren();
  card.pinyin.readings.forEach((reading, readingIndex) => {
    if (readingIndex > 0) {
      const separator = document.createElement("span");
      separator.textContent = "/";
      separator.setAttribute("aria-hidden", "true");
      elements.pinyin.append(separator);
    }
    reading.forEach((syllable) => {
      elements.pinyin.append(
        createToneSpan(markSyllable(syllable.spelling, syllable.tone), syllable.tone),
      );
    });
  });
  elements.pinyin.setAttribute("aria-label", card.pinyin.display);
}

function currentSearchSuggestions() {
  const eligibleCards = cardsInSelectedLevels().filter((card) =>
    state.decks.includes(deckFor(card)),
  );
  return matchingSearchSuggestions(eligibleCards, state.query);
}

function closeSearchSuggestions() {
  state.searchSuggestionsVisible = false;
  state.searchSuggestionIndex = -1;
  elements.searchSuggestions.hidden = true;
  elements.searchSuggestions.replaceChildren();
  elements.searchInput.setAttribute("aria-expanded", "false");
  elements.searchInput.removeAttribute("aria-activedescendant");
}

function renderSearchSuggestions() {
  const suggestions = currentSearchSuggestions();
  if (
    !state.searchSuggestionsVisible ||
    !state.query.trim() ||
    suggestions.length === 0
  ) {
    closeSearchSuggestions();
    return;
  }

  state.searchSuggestionIndex = Math.min(
    state.searchSuggestionIndex,
    suggestions.length - 1,
  );

  const options = suggestions.map((card, index) => {
    const option = document.createElement("li");
    option.id = `search-suggestion-${index}`;
    option.className = "search-suggestion";
    option.dataset.cardId = card.id;
    option.setAttribute("role", "option");
    option.setAttribute(
      "aria-selected",
      String(index === state.searchSuggestionIndex),
    );

    const heading = document.createElement("span");
    heading.className = "search-suggestion-heading";

    const hanzi = document.createElement("span");
    hanzi.className = "search-suggestion-hanzi";
    hanzi.lang = "zh-Hans";
    hanzi.textContent = card.simplified;

    const pinyin = document.createElement("span");
    pinyin.className = "search-suggestion-pinyin";
    pinyin.textContent = card.pinyin.display;

    const level = document.createElement("span");
    level.className = "level-badge search-suggestion-level";
    level.dataset.level = String(card.level);
    level.textContent = `HSK ${card.level}`;

    const definition = document.createElement("span");
    definition.className = "search-suggestion-definition";
    definition.textContent = card.definitions[0];

    heading.append(hanzi, pinyin, level);
    option.append(heading, definition);
    return option;
  });

  elements.searchSuggestions.replaceChildren(...options);
  elements.searchSuggestions.hidden = false;
  elements.searchInput.setAttribute("aria-expanded", "true");
  if (state.searchSuggestionIndex >= 0) {
    elements.searchInput.setAttribute(
      "aria-activedescendant",
      `search-suggestion-${state.searchSuggestionIndex}`,
    );
  } else {
    elements.searchInput.removeAttribute("aria-activedescendant");
  }
}

function setSearchSuggestionIndex(index) {
  const suggestions = currentSearchSuggestions();
  if (suggestions.length === 0) {
    closeSearchSuggestions();
    return;
  }
  state.searchSuggestionsVisible = true;
  state.searchSuggestionIndex = Math.min(Math.max(index, 0), suggestions.length - 1);
  renderSearchSuggestions();
  document
    .querySelector(`#search-suggestion-${state.searchSuggestionIndex}`)
    ?.scrollIntoView({ block: "nearest" });
}

function selectSearchSuggestion(cardId) {
  const card = state.document.entries.find((entry) => entry.id === cardId);
  if (!card) return;

  state.query = card.simplified;
  elements.searchInput.value = card.simplified;
  state.searchSuggestionsVisible = false;
  state.searchSuggestionIndex = -1;
  applyFilters();
  const selectedIndex = state.cards.findIndex((entry) => entry.id === card.id);
  if (selectedIndex >= 0) {
    state.index = selectedIndex;
    render();
  }
  closeSearchSuggestions();
}

function loadHanziWriter() {
  if (globalThis.HanziWriter) return Promise.resolve(globalThis.HanziWriter);
  if (hanziWriterPromise) return hanziWriterPromise;

  hanziWriterPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = HANZI_WRITER_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(globalThis.HanziWriter));
    script.addEventListener("error", () => {
      hanziWriterPromise = undefined;
      reject(new Error("Hanzi Writer could not be loaded."));
    });
    document.head.append(script);
  });

  return hanziWriterPromise;
}

function loadStrokeData(character) {
  return fetch(`${HANZI_DATA_ROOT}${encodeURIComponent(character)}.json`).then(
    (response) => {
      if (!response.ok) {
        throw new Error(`Stroke data request failed with status ${response.status}`);
      }
      return response.json();
    },
  );
}

function updateStrokeNavigation() {
  const lastIndex = state.strokeCharacters.length - 1;
  const hasMultipleCharacters = state.strokeCharacters.length > 1;
  elements.strokeNavigation.classList.toggle(
    "single-character",
    !hasMultipleCharacters,
  );
  elements.previousStrokeCharacter.hidden = !hasMultipleCharacters;
  elements.nextStrokeCharacter.hidden = !hasMultipleCharacters;
  elements.previousStrokeCharacter.disabled =
    !hasMultipleCharacters || state.strokeIndex <= 0;
  elements.nextStrokeCharacter.disabled =
    !hasMultipleCharacters || state.strokeIndex >= lastIndex;
}

async function renderStrokeCharacter() {
  const character = state.strokeCharacters[state.strokeIndex];
  if (!character) return;

  const renderToken = ++state.strokeRenderToken;
  state.strokeWriter = null;
  elements.strokeTarget.replaceChildren();
  elements.strokeCharacter.textContent = character;
  elements.strokePosition.textContent = `${state.strokeIndex + 1} of ${state.strokeCharacters.length}`;
  elements.strokeTarget.setAttribute(
    "aria-label",
    `Animated stroke order for ${character}`,
  );
  elements.strokeStatus.textContent = "Loading stroke data…";
  elements.replayStrokes.disabled = true;
  updateStrokeNavigation();

  try {
    const HanziWriter = await loadHanziWriter();
    if (renderToken !== state.strokeRenderToken || !elements.strokeDialog.open) return;

    const reduceMotion =
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let writer;
    writer = HanziWriter.create("stroke-target", character, {
      width: 278,
      height: 278,
      padding: 20,
      showOutline: true,
      showCharacter: reduceMotion,
      strokeColor: "#20272b",
      outlineColor: "#d5d9d6",
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 220,
      charDataLoader: loadStrokeData,
      onLoadCharDataSuccess() {
        Promise.resolve().then(() => {
          if (
            renderToken !== state.strokeRenderToken ||
            !elements.strokeDialog.open ||
            !state.strokeWriter
          ) {
            return;
          }
          elements.replayStrokes.disabled = false;
          if (reduceMotion) {
            elements.strokeStatus.textContent =
              "Animation ready. Select Replay to begin.";
          } else {
            elements.strokeStatus.textContent = "";
            state.strokeWriter.animateCharacter();
          }
        });
      },
      onLoadCharDataError(error) {
        if (renderToken !== state.strokeRenderToken) return;
        elements.strokeStatus.textContent =
          "Stroke order is unavailable. Check your connection and try again.";
        console.error(error);
      },
    });
    state.strokeWriter = writer;
  } catch (error) {
    if (renderToken !== state.strokeRenderToken) return;
    elements.strokeStatus.textContent =
      "Stroke order is unavailable. Check your connection and try again.";
    console.error(error);
  }
}

function openStrokeOrder() {
  const card = currentCard();
  if (!card) return;

  state.strokeCharacters = strokeCharactersFor(card);
  state.strokeIndex = 0;
  if (state.strokeCharacters.length === 0) return;

  if (typeof elements.strokeDialog.showModal === "function") {
    elements.strokeDialog.showModal();
  } else {
    elements.strokeDialog.setAttribute("open", "");
  }
  renderStrokeCharacter();
}

function cleanUpStrokeOrder() {
  state.strokeRenderToken += 1;
  state.strokeWriter = null;
  elements.strokeTarget.replaceChildren();
  elements.strokeStatus.textContent = "";
}

function closeStrokeOrder() {
  if (typeof elements.strokeDialog.close === "function") {
    elements.strokeDialog.close();
  } else {
    elements.strokeDialog.removeAttribute("open");
    cleanUpStrokeOrder();
  }
}

function setStrokeIndex(index) {
  const nextIndex = clampStrokeIndex(index, state.strokeCharacters.length);
  if (nextIndex === state.strokeIndex) return;
  state.strokeIndex = nextIndex;
  renderStrokeCharacter();
}

function replayStrokeOrder() {
  if (!state.strokeWriter) return;
  elements.strokeStatus.textContent = "";
  state.strokeWriter.animateCharacter();
}

function render() {
  const card = currentCard();
  const hasCard = Boolean(card);

  elements.cardMeta.hidden = !hasCard;
  elements.cardContent.hidden = !hasCard;
  elements.emptyMessage.hidden = hasCard;
  elements.deckButtons.forEach((button) => {
    button.disabled = !hasCard;
    button.setAttribute(
      "aria-pressed",
      String(hasCard && button.dataset.deck === deckFor(card)),
    );
  });
  [elements.previous, elements.shuffle, elements.next].forEach((button) => {
    button.disabled = !hasCard;
  });
  elements.openStrokeOrder.disabled = !hasCard;

  if (!hasCard) {
    elements.progress.textContent = "0 of 0";
    if (state.levels.length === 0 || state.decks.length === 0) {
      elements.emptyMessage.textContent =
        "Select at least one HSK level and one deck to see cards.";
    } else if (state.query.trim()) {
      elements.emptyMessage.textContent =
        `No cards in the selected levels and decks match “${state.query.trim()}”.`;
    } else {
      elements.emptyMessage.textContent =
        "No cards are in the selected levels and decks yet.";
    }
    return;
  }

  elements.progress.textContent = `${state.index + 1} of ${state.cards.length}`;
  elements.levelBadge.textContent = `HSK ${card.level}`;
  elements.levelBadge.dataset.level = String(card.level);

  const labels = state.document.partOfSpeechLabels;
  elements.partOfSpeech.textContent = card.partOfSpeech
    .map((part) => labels[part] ?? part)
    .join(" · ");

  renderHanzi(card);
  renderPinyin(card);
  elements.translation.textContent = card.definitions[0];

  elements.pinyin.classList.toggle("is-concealed", !state.showPinyin);
  elements.translation.classList.toggle("is-concealed", !state.showEnglish);
}

function applyFilters(resetIndex = true) {
  state.cards = cardsInSelectedLevels().filter(
    (card) => state.decks.includes(deckFor(card)) && matchesSearch(card),
  );
  state.index = resetIndex
    ? 0
    : Math.min(state.index, Math.max(state.cards.length - 1, 0));
  updateDeckOptions();
  updateFilterSummaries();
  render();
}

function setLevelFilter(level, checked) {
  state.levels = updateFilterValues(state.levels, level, checked);
  elements.deckStatus.textContent = "";
  applyFilters();
}

function setDeckFilter(deck, checked) {
  state.decks = updateFilterValues(state.decks, deck, checked);
  elements.deckStatus.textContent = "";
  applyFilters();
}

function setSearch(query) {
  state.query = query;
  state.searchSuggestionsVisible = Boolean(query.trim());
  state.searchSuggestionIndex = -1;
  elements.searchSuggestions.scrollTop = 0;
  elements.deckStatus.textContent = "";
  applyFilters();
  renderSearchSuggestions();
}

function assignCurrentCard(deck) {
  const card = currentCard();
  if (!card || !Object.hasOwn(DECK_LABELS, deck)) return;

  if (deck === initialDeckFor(card)) delete state.assignments[card.id];
  else state.assignments[card.id] = deck;

  saveAssignments();
  const persistenceNote = state.canPersist ? "" : " for this session only";
  elements.deckStatus.textContent =
    `${card.simplified} moved to ${DECK_LABELS[deck]}${persistenceNote}.`;
  applyFilters(false);
}

function move(offset) {
  if (state.cards.length === 0) return;
  state.index = (state.index + offset + state.cards.length) % state.cards.length;
  render();
}

function shuffle() {
  if (state.cards.length < 2) return;
  let nextIndex = state.index;
  while (nextIndex === state.index) {
    nextIndex = Math.floor(Math.random() * state.cards.length);
  }
  state.index = nextIndex;
  render();
}

function setVisibility(kind, visible) {
  const isPinyin = kind === "pinyin";
  if (isPinyin) state.showPinyin = visible;
  else state.showEnglish = visible;

  const button = isPinyin ? elements.togglePinyin : elements.toggleEnglish;
  button.setAttribute("aria-pressed", String(visible));
  button.textContent = `${isPinyin ? "Pinyin" : "English"} ${visible ? "on" : "off"}`;
  render();
}

function bindEvents() {
  elements.filterMenus.forEach((menu) => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      elements.filterMenus.forEach((otherMenu) => {
        if (otherMenu !== menu) otherMenu.open = false;
      });
    });
  });
  elements.levelFilterOptions.addEventListener("change", (event) => {
    const checkbox = event.target;
    if (
      !(checkbox instanceof HTMLInputElement) ||
      !checkbox.classList.contains("level-filter-input")
    ) {
      return;
    }
    setLevelFilter(checkbox.value, checkbox.checked);
  });
  elements.searchInput.addEventListener("input", (event) => setSearch(event.target.value));
  elements.searchInput.addEventListener("focus", () => {
    if (!state.query.trim()) return;
    state.searchSuggestionsVisible = true;
    renderSearchSuggestions();
  });
  elements.searchInput.addEventListener("keydown", (event) => {
    const suggestions = currentSearchSuggestions();
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      const nextIndex =
        state.searchSuggestionIndex >= suggestions.length - 1
          ? 0
          : state.searchSuggestionIndex + 1;
      setSearchSuggestionIndex(nextIndex);
    } else if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      const nextIndex =
        state.searchSuggestionIndex <= 0
          ? suggestions.length - 1
          : state.searchSuggestionIndex - 1;
      setSearchSuggestionIndex(nextIndex);
    } else if (event.key === "Enter" && state.searchSuggestionIndex >= 0) {
      event.preventDefault();
      selectSearchSuggestion(suggestions[state.searchSuggestionIndex]?.id);
    } else if (event.key === "Escape" || event.key === "Tab") {
      closeSearchSuggestions();
    }
  });
  elements.searchSuggestions.addEventListener("click", (event) => {
    const option = event.target.closest?.("[data-card-id]");
    if (!option) return;
    selectSearchSuggestion(option.dataset.cardId);
    elements.searchInput.focus();
  });
  elements.deckFilters.forEach((checkbox) => {
    checkbox.addEventListener("change", () =>
      setDeckFilter(checkbox.value, checkbox.checked),
    );
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest?.(".search-control")) closeSearchSuggestions();
    if (event.target.closest?.(".filter-menu")) return;
    elements.filterMenus.forEach((menu) => {
      menu.open = false;
    });
  });
  elements.deckButtons.forEach((button) => {
    button.addEventListener("click", () => assignCurrentCard(button.dataset.deck));
  });
  elements.previous.addEventListener("click", () => move(-1));
  elements.next.addEventListener("click", () => move(1));
  elements.shuffle.addEventListener("click", shuffle);
  elements.togglePinyin.addEventListener("click", () =>
    setVisibility("pinyin", !state.showPinyin),
  );
  elements.toggleEnglish.addEventListener("click", () =>
    setVisibility("english", !state.showEnglish),
  );
  elements.openStrokeOrder.addEventListener("click", openStrokeOrder);
  elements.closeStrokeOrder.addEventListener("click", closeStrokeOrder);
  elements.previousStrokeCharacter.addEventListener("click", () =>
    setStrokeIndex(state.strokeIndex - 1),
  );
  elements.nextStrokeCharacter.addEventListener("click", () =>
    setStrokeIndex(state.strokeIndex + 1),
  );
  elements.replayStrokes.addEventListener("click", replayStrokeOrder);
  elements.strokeDialog.addEventListener("close", cleanUpStrokeOrder);
  elements.strokeDialog.addEventListener("click", (event) => {
    if (event.target === elements.strokeDialog) closeStrokeOrder();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (elements.strokeDialog.open) return;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLButtonElement
    ) {
      return;
    }

    if (event.key === "ArrowLeft") move(-1);
    if (event.key === "ArrowRight") move(1);
    if (event.key.toLowerCase() === "p") setVisibility("pinyin", !state.showPinyin);
    if (event.key.toLowerCase() === "e") setVisibility("english", !state.showEnglish);
    if (event.key.toLowerCase() === "s") shuffle();
  });
}

async function initialize() {
  bindEvents();
  try {
    const manifestResponse = await fetch("./data/manifest.json");
    if (!manifestResponse.ok) {
      throw new Error(`Manifest request failed with status ${manifestResponse.status}`);
    }
    const manifest = await manifestResponse.json();
    const response = await fetch(datasetUrlFromManifest(manifest));
    if (!response.ok) throw new Error(`Data request failed with status ${response.status}`);
    state.document = await response.json();
    renderLevelFilters();
    state.assignments = loadAssignments();
    applyFilters();
  } catch (error) {
    elements.cardContent.hidden = true;
    elements.cardMeta.hidden = true;
    elements.deckAssignment.disabled = true;
    elements.openStrokeOrder.disabled = true;
    elements.errorMessage.hidden = false;
    elements.errorMessage.textContent =
      "The flashcard data could not be loaded. Please refresh the page.";
    elements.progress.textContent = "Unavailable";
    console.error(error);
  }
}

initialize();

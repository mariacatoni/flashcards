const STORAGE_KEY = "hsk-flashcards.deck-assignments.v2";
const LEGACY_STORAGE_KEY = "hsk-flashcards.deck-assignments.v1";
const LEGACY_DEFAULT_DECK = "later";
const DEFAULT_DECK = "studying";
const DECK_LABELS = {
  later: "To learn later",
  studying: "Studying",
  learned: "Learned",
};
const TONE_MARK_PATTERN = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u;

const state = {
  document: null,
  cards: [],
  index: 0,
  level: "1",
  deck: DEFAULT_DECK,
  query: "",
  assignments: {},
  canPersist: true,
  showPinyin: true,
  showEnglish: true,
};

const elements = {
  levelFilter: document.querySelector("#level-filter"),
  searchInput: document.querySelector("#search-input"),
  deckFilter: document.querySelector("#deck-filter"),
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

function deckFor(card) {
  return state.assignments[card.id] ?? DEFAULT_DECK;
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
      .map((card) => [
        card.id,
        legacyAssignments[card.id] ?? LEGACY_DEFAULT_DECK,
      ])
      .filter(([, deck]) => deck !== DEFAULT_DECK),
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

function cardsInSelectedLevel() {
  return state.document.entries.filter(
    (card) => state.level === "all" || String(card.level) === state.level,
  );
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

function matchesSearch(card) {
  const query = state.query.trim();
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

function updateDeckOptions() {
  const counts = { later: 0, studying: 0, learned: 0 };
  cardsInSelectedLevel().forEach((card) => {
    counts[deckFor(card)] += 1;
  });

  [...elements.deckFilter.options].forEach((option) => {
    option.textContent = `${DECK_LABELS[option.value]} (${counts[option.value]})`;
  });
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

  if (!hasCard) {
    const levelLabel = state.level === "all" ? "HSK 1–2" : `HSK ${state.level}`;
    elements.progress.textContent = "0 of 0";
    elements.emptyMessage.textContent = state.query.trim()
      ? `No ${levelLabel} cards in ${DECK_LABELS[state.deck]} match “${state.query.trim()}”.`
      : `No ${levelLabel} cards are in ${DECK_LABELS[state.deck]} yet. ` +
        "Choose another deck to move cards here.";
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
  state.cards = cardsInSelectedLevel().filter(
    (card) => deckFor(card) === state.deck && matchesSearch(card),
  );
  state.index = resetIndex
    ? 0
    : Math.min(state.index, Math.max(state.cards.length - 1, 0));
  updateDeckOptions();
  render();
}

function setLevel(level) {
  state.level = level;
  elements.deckStatus.textContent = "";
  applyFilters();
}

function setDeckFilter(deck) {
  state.deck = deck;
  elements.deckStatus.textContent = "";
  applyFilters();
}

function setSearch(query) {
  state.query = query;
  elements.deckStatus.textContent = "";
  applyFilters();
}

function assignCurrentCard(deck) {
  const card = currentCard();
  if (!card || !Object.hasOwn(DECK_LABELS, deck)) return;

  if (deck === DEFAULT_DECK) delete state.assignments[card.id];
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
  elements.levelFilter.addEventListener("change", (event) => setLevel(event.target.value));
  elements.searchInput.addEventListener("input", (event) => setSearch(event.target.value));
  elements.deckFilter.addEventListener("change", (event) =>
    setDeckFilter(event.target.value),
  );
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

  document.addEventListener("keydown", (event) => {
    const target = event.target;
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
    const response = await fetch("./data/levels-1-2.json");
    if (!response.ok) throw new Error(`Data request failed with status ${response.status}`);
    state.document = await response.json();
    state.assignments = loadAssignments();
    applyFilters();
  } catch (error) {
    elements.cardContent.hidden = true;
    elements.cardMeta.hidden = true;
    elements.deckAssignment.disabled = true;
    elements.errorMessage.hidden = false;
    elements.errorMessage.textContent =
      "The flashcard data could not be loaded. Please refresh the page.";
    elements.progress.textContent = "Unavailable";
    console.error(error);
  }
}

initialize();

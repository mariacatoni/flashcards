const state = {
  document: null,
  cards: [],
  index: 0,
  level: "1",
  showPinyin: true,
  showEnglish: true,
};

const elements = {
  levelFilter: document.querySelector("#level-filter"),
  progress: document.querySelector("#progress"),
  levelBadge: document.querySelector("#level-badge"),
  partOfSpeech: document.querySelector("#part-of-speech"),
  hanzi: document.querySelector("#hanzi"),
  pinyin: document.querySelector("#pinyin"),
  translation: document.querySelector("#translation"),
  cardContent: document.querySelector("#card-content"),
  errorMessage: document.querySelector("#error-message"),
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
  if (!card) return;

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

function setLevel(level) {
  state.level = level;
  state.cards = state.document.entries.filter(
    (card) => level === "all" || String(card.level) === level,
  );
  state.index = 0;
  render();
}

function move(offset) {
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
    if (target instanceof HTMLSelectElement || target instanceof HTMLButtonElement) return;

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
    setLevel(state.level);
  } catch (error) {
    elements.cardContent.hidden = true;
    elements.errorMessage.hidden = false;
    elements.errorMessage.textContent =
      "The flashcard data could not be loaded. Please refresh the page.";
    elements.progress.textContent = "Unavailable";
    console.error(error);
  }
}

initialize();

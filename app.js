const gradeNavigation = document.querySelector("#grade-navigation");
const surahNavigation = document.querySelector("#surah-navigation");
const surahsSection = document.querySelector("#surahs-section");
const lesson = document.querySelector("#lesson");
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
const searchInput = document.querySelector("#site-search");
const searchResults = document.querySelector("#search-results");
const gradeHint = document.querySelector("#grade-hint");
const surahHint = document.querySelector("#surah-hint");
const homeButton = document.querySelector("#home-button");
const progressStorageKey = "taryam-quran-progress-v1";
const quranTextKeys = {
  الفاتحة: "fatiha",
  الإخلاص: "ikhlas",
  الفلق: "falaq",
  الناس: "nas",
  قريش: "quraysh",
  العصر: "asr",
  الشرح: "sharh",
  الشمس: "shams",
  "آية الكرسي (البقرة: ٢٥٥)": "kursi",
  العلق: "alaq",
  المزمل: "muzzammil",
  الليل: "layl",
  الضحى: "duha",
  التين: "tin",
  البروج: "buruj",
  الطارق: "tariq",
  الانفطار: "infitar",
  التكوير: "takwir",
  السجدة: "sajdah",
  ق: "qaf",
  يس: "yasin",
  الحجرات: "hujurat",
  الكهف: "kahf",
  الأحزاب: "ahzab",
  النور: "nur"
};

let activeGradeIndex = null;
let activeAssignment = null;
let activeMode = "meanings";
let quizQuestions = [];
let questionIndex = 0;
let score = 0;
let answered = false;
let reviewProgress = loadLocalData(progressStorageKey);

function loadLocalData(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

function saveLocalData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function getReviewedCount(assignment) {
  return Object.values(reviewProgress[assignment] || {}).filter(Boolean).length;
}

function isAyahReviewed(assignment, ayahNumber) {
  return Boolean(reviewProgress[assignment]?.[ayahNumber]);
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function getMeaningEntries(assignment) {
  if (quranLearningData.surahs[assignment]) {
    return quranLearningData.surahs[assignment].meanings;
  }
  return quranLearningData.quizMeanings[assignment] || [];
}

function getAyahTafsirUrl(assignment, ayahNumber) {
  const meaningPage = quranLearningData.surahs[assignment]?.meaningsSource
    || quranLearningData.meaningPages[assignment];
  const surahNumber = meaningPage?.match(/\/w(\d+)\.html$/)?.[1];
  if (!surahNumber) return null;
  return `https://e-quran.com/pages/tafseer/saadi/${surahNumber}/${ayahNumber}.html`;
}

function getRevelationSourceUrl(assignment) {
  return quranLearningData.surahs[assignment]?.meaningsSource
    || quranLearningData.meaningPages[assignment]
    || null;
}

function getRevelationLabel(assignment) {
  const revelation = quranLearningData.revelationTypes[assignment];
  if (!revelation) return null;
  return assignment === "آية الكرسي (البقرة: ٢٥٥)"
    ? `${revelation} · سورة البقرة`
    : revelation;
}

function getAllMeaningEntries() {
  return [
    ...quranLearningData.surahs.الفاتحة.meanings,
    ...Object.values(quranLearningData.quizMeanings).flat()
  ];
}

function renderMeaningList(panel, entries, assignment) {
  panel.replaceChildren();
  if (entries.length === 0) {
    panel.append(createElement("p", "meanings-empty", "لا توجد معانٍ محددة لهذه الآية في المصدر."));
    return;
  }
  const list = createElement("ul", "meanings-list");
  entries.forEach((entry) => {
    const item = createElement("li", "meanings-item");
    item.append(
      createElement("span", "meanings-item__word", entry.word),
      createElement("span", "meanings-item__sep", " : "),
      createElement("span", "meanings-item__meaning", entry.meaning)
    );
    list.append(item);
  });
  const source = createElement("a", "meaning-source-tag", "المصدر: المصحف الإلكتروني");
  source.href = getRevelationSourceUrl(assignment) || quranLearningData.indexSource;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  panel.append(list, source);
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }
  return shuffled;
}

function normalizeArabicText(value) {
  return value
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/g, "")
    .replace(/[ـٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[.,،:؛!؟()\[\]{}«»“”\"'ـ۞۝]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getEntriesForWord(entries, verseNumber, word) {
  const targetWord = normalizeArabicText(word);
  return entries.flatMap((entry) => {
    const entryVerseNumber = Number(entry.ayah.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))));
    if (entryVerseNumber !== verseNumber) return [];

    const matchesPhrase = entry.word
      .split(/\s+/)
      .some((phraseWord) => normalizeArabicText(phraseWord) === targetWord);
    return matchesPhrase ? [{ entry }] : [];
  });
}

function getTafsirForVerse(textKey, verseNumber) {
  if (!textKey || verseNumber === null) return null;
  return tafsirData?.[textKey]?.[String(verseNumber)] || null;
}

function appendHighlightedPhrase(container, phrase, matches, panel) {
  const hl = createElement("span",
    matches.length > 0 ? "tafsir-hl-word tafsir-hl-word--has-meaning" : "tafsir-hl-word",
    phrase
  );
  if (matches.length > 0) {
    const tip = createElement("span", "tafsir-hl-tip");
    tip.hidden = true;
    matches.forEach(({ entry }) => {
      const row = createElement("span", "tafsir-tip-row");
      row.append(
        createElement("strong", "tafsir-tip-word", entry.word),
        document.createTextNode(": "),
        createElement("span", "tafsir-tip-meaning", entry.meaning)
      );
      tip.append(row);
    });
    const wrap = createElement("span", "tafsir-hl-wrap");
    hl.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.querySelectorAll(".tafsir-hl-tip").forEach((t) => { if (t !== tip) t.hidden = true; });
      tip.hidden = !tip.hidden;
    });
    wrap.append(hl, tip);
    container.append(wrap);
  } else {
    container.append(hl);
  }
}

function renderClickableWords(target, text, panel, entries, verseNumber, root, textKey) {
  // Every word in a verse with tafsir is tappable — highlighted if it has a meaning entry,
  // plain-tappable (no highlight) if only tafsir is available.
  const tafsirEntry = getTafsirForVerse(textKey, verseNumber);

  text.split(/(\s+)/).forEach((part) => {
    if (/^\s+$/.test(part)) {
      target.append(document.createTextNode(part));
      return;
    }

    const matches = verseNumber === null
      ? []
      : getEntriesForWord(entries, verseNumber, part);

    const hasMeaning = matches.length > 0;
    const hasTafsir  = tafsirEntry !== null;

    // If no tafsir AND no meaning — plain text
    if (!hasMeaning && !hasTafsir) {
      target.append(document.createTextNode(part));
      return;
    }

    // All words with tafsir are tappable; gold highlight if also has meaning
    const wordClass = hasMeaning
      ? "quran-word quran-word--has-meaning"
      : "quran-word quran-word--tafsir-only";
    const word = createElement("button", wordClass, part);
    word.type = "button";
    word.setAttribute("aria-expanded", "false");
    word.setAttribute("aria-controls", panel.id);

    word.addEventListener("click", () => {
      const wasExpanded = word.getAttribute("aria-expanded") === "true";
      root.querySelectorAll(".quran-word").forEach((btn) => {
        btn.setAttribute("aria-expanded", "false");
      });
      root.querySelectorAll(".word-meaning-panel").forEach((p) => {
        p.hidden = true;
        p.replaceChildren();
      });
      word.setAttribute("aria-expanded", String(!wasExpanded));
      panel.hidden = wasExpanded;
      if (wasExpanded) return;

      // ① Word/phrase meaning from e-Quran word-meanings source — show meaning only, no word label
      if (hasMeaning) {
        matches.forEach(({ entry }) => {
          const block = createElement("div", "word-meaning-entry");
          const text  = createElement("p", "meaning-word-text", entry.meaning);
          const src   = createElement("a", "meaning-source-tag", "معنى الكلمة · المصحف الإلكتروني");
          src.href   = quranLearningData.surahs[activeAssignment]?.meaningsSource
                       || quranLearningData.meaningPages[activeAssignment]
                       || quranLearningData.indexSource;
          src.target = "_blank";
          src.rel    = "noopener noreferrer";
          block.append(text, src);
          panel.append(block);
        });
      }

      // ② Tafsir (per-ayah) from e-Quran tafseer/saadi
      if (hasTafsir) {
        const block = createElement("div", "word-tafsir-entry");
        const body  = createElement("p", "tafsir-body");

        const tafsirText = tafsirEntry.text;
        const hasBraces  = tafsirText.includes("{");

        if (hasBraces) {
          // Strategy A: tafsir uses { } to mark Quran words — split on those
          tafsirText.split(/(\{[^}]+\})/).forEach((part) => {
            const braceMatch = part.match(/^\{([^}]+)\}$/);
            if (!braceMatch) {
              body.append(document.createTextNode(part));
              return;
            }
            const quranPhrase = braceMatch[1].trim();
            const phraseMatches = [];
            quranPhrase.split(/\s+/).forEach((w) => {
              getEntriesForWord(entries, verseNumber, w).forEach((m) => {
                if (!phraseMatches.some((x) => x.entry.word === m.entry.word)) phraseMatches.push(m);
              });
            });
            appendHighlightedPhrase(body, quranPhrase, phraseMatches, panel);
          });
        } else {
          // Strategy B: no braces — scan tafsir word by word and highlight
          // any token that matches a word in the current verse
          tafsirText.split(/(\s+)/).forEach((token) => {
            if (/^\s+$/.test(token)) {
              body.append(document.createTextNode(token));
              return;
            }
            // Strip punctuation from token ends for matching
            const clean = token.replace(/^[,،.:؟!؛]+|[,،.:؟!؛]+$/g, "");
            const punctSuffix = token.slice(clean.length);
            const tokenMatches = getEntriesForWord(entries, verseNumber, clean);
            if (tokenMatches.length === 0) {
              // Also try matching against the raw verse words (normalized)
              const normClean = normalizeArabicText(clean);
              const verseText = quranTextData[quranTextKeys[activeAssignment]]?.verses
                .find(v => v.number === verseNumber)?.text || "";
              const inVerse = verseText.split(/\s+/)
                .some(vw => normalizeArabicText(vw) === normClean);
              if (inVerse) {
                appendHighlightedPhrase(body, clean, [], panel);
                if (punctSuffix) body.append(document.createTextNode(punctSuffix));
              } else {
                body.append(document.createTextNode(token));
              }
            } else {
              appendHighlightedPhrase(body, clean, tokenMatches, panel);
              if (punctSuffix) body.append(document.createTextNode(punctSuffix));
            }
          });
        }

        const src = createElement("a", "meaning-source-tag", "تفسير السعدي · المصحف الإلكتروني");
        src.href   = tafsirEntry.url;
        src.target = "_blank";
        src.rel    = "noopener noreferrer";
        block.append(body, src);
        panel.append(block);
      }
    });

    target.append(word);
  });
}

function renderSearchResults() {
  const query = normalizeArabicText(searchInput.value);
  searchResults.replaceChildren();
  if (!query) {
    searchResults.hidden = true;
    return;
  }

  const matches = [];
  quranLearningData.grades.forEach((grade, gradeIndex) => {
    grade.assignments.forEach((assignment) => {
      const entries = getMeaningEntries(assignment);
      const matchingEntry = entries.find((entry) =>
        normalizeArabicText(`${entry.word} ${entry.meaning}`).includes(query)
      );
      if (normalizeArabicText(`${assignment} ${grade.name}`).includes(query) || matchingEntry) {
        matches.push({ gradeIndex, grade, assignment, matchingEntry });
      }
    });
  });

  if (matches.length === 0) {
    searchResults.append(createElement("p", "search-empty", "لم نعثر على سورة أو كلمة مطابقة في المقررات."));
    searchResults.hidden = false;
    return;
  }

  matches.slice(0, 12).forEach(({ gradeIndex, grade, assignment, matchingEntry }) => {
    const button = createElement("button", "search-result");
    button.type = "button";
    button.append(
      createElement("strong", "search-result__title", assignment),
      createElement("span", "search-result__grade", grade.name)
    );
    if (matchingEntry) {
      button.append(createElement("span", "search-result__meaning", `${matchingEntry.word}: ${matchingEntry.meaning}`));
    }
    button.addEventListener("click", () => {
      activeGradeIndex = gradeIndex;
      activeAssignment = assignment;
      surahsSection.hidden = false;
      document.querySelector("#quiz-mode-tab").disabled = getMeaningEntries(assignment).length === 0;
      setMode("meanings");
      renderGrades();
      renderSurahs();
      renderMeanings();
      searchResults.hidden = true;
      lesson.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    searchResults.append(button);
  });

  if (matches.length > 12) {
    searchResults.append(createElement("p", "search-more", `تظهر أول ١٢ نتيجة من ${toArabicNumber(matches.length)}.`));
  }
  searchResults.hidden = false;
}

searchInput.addEventListener("input", renderSearchResults);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchInput.value = "";
    renderSearchResults();
  }
});

function renderGrades() {
  gradeNavigation.replaceChildren();
  gradeHint.textContent = activeGradeIndex === null
    ? "اختر صفّك لعرض السور المقررة لك."
    : `تم اختيار ${quranLearningData.grades[activeGradeIndex].name}. اختر إحدى السور للبدء.`;
  quranLearningData.grades.forEach((grade, index) => {
    const button = createElement("button", "grade-button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(index === activeGradeIndex));
    button.setAttribute("aria-label", `${grade.name}، ${grade.assignments.length} مقررات`);

    const badge = createElement("span", "grade-badge", toArabicNumber(index + 1));
    const label = createElement("span", "grade-label", grade.name);
    const count = createElement("span", "grade-count", `${toArabicNumber(grade.assignments.length)} مقررات`);

    button.append(badge, label, count);
    button.addEventListener("click", () => {
      activeGradeIndex = index;
      activeAssignment = null;
      document.querySelector("#quiz-mode-tab").disabled = true;
      setMode("meanings");
      renderGrades();
      renderSurahs();
      surahsSection.hidden = false;
      lesson.replaceChildren();
    });
    gradeNavigation.append(button);
  });
}

function renderSurahs() {
  surahNavigation.replaceChildren();
  const grade = quranLearningData.grades[activeGradeIndex];
  if (!grade) return;
  const reviewed = grade.assignments.reduce((total, assignment) => total + getReviewedCount(assignment), 0);
  surahHint.textContent = `${grade.name} · ${grade.assignments.length} مقررات · ${toArabicNumber(reviewed)} آيات تمت مراجعتها`;

  grade.assignments.forEach((assignment) => {
    const button = createElement("button", "surah-button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(assignment === activeAssignment));
    button.append(createElement("span", "surah-button-name", assignment));
    const revelationLabel = getRevelationLabel(assignment);
    if (revelationLabel) {
      button.append(createElement("span", "surah-classification", revelationLabel));
    }
    const reviewedCount = getReviewedCount(assignment);
    if (reviewedCount > 0) {
      const verseCount = quranTextData[quranTextKeys[assignment]]?.verses.length || 0;
      const completed = verseCount > 0 && reviewedCount >= verseCount;
      button.append(createElement("span", "surah-progress", completed
        ? "⭐ أتممتها!"
        : `⭐ ${toArabicNumber(reviewedCount)} تمت مراجعتها`));
    }
    button.addEventListener("click", () => {
      activeAssignment = assignment;
      renderSurahs();
      if (activeMode === "quiz") {
        document.querySelector("#quiz-mode-tab").disabled = getMeaningEntries(assignment).length === 0;
        startQuiz();
      } else {
        renderMeanings();
      }
    });
    surahNavigation.append(button);
  });
}

homeButton.addEventListener("click", () => {
  activeGradeIndex = null;
  activeAssignment = null;
  surahsSection.hidden = true;
  document.querySelector("#quiz-mode-tab").disabled = true;
  setMode("meanings");
  renderGrades();
  lesson.replaceChildren();
  document.querySelector("#grades-title").scrollIntoView({ behavior: "smooth", block: "start" });
});

function renderMeanings() {
  lesson.replaceChildren();
  const entries = getMeaningEntries(activeAssignment);
  const reading = quranTextData[quranTextKeys[activeAssignment]];
  const textKey  = quranTextKeys[activeAssignment];

  if (!reading) {
    lesson.append(createElement("p", "empty-meanings", "لا يتوفر نص هذا المقرر."));
    document.querySelector("#quiz-mode-tab").disabled = entries.length === 0;
    return;
  }

  // ════════════════════════════════════════
  // BLOCK 1 — Surah text
  // ════════════════════════════════════════
  const surahText = createElement("section", "surah-text");
  surahText.setAttribute("aria-label", `نص ${activeAssignment}`);
  surahText.append(createElement("h2", "", "نص السورة"));

  const revelationLabel     = getRevelationLabel(activeAssignment);
  const revelationSourceUrl = getRevelationSourceUrl(activeAssignment);
  if (revelationLabel && revelationSourceUrl) {
    const classification = createElement("a", "surah-revelation-source", revelationLabel);
    classification.href   = revelationSourceUrl;
    classification.target = "_blank";
    classification.rel    = "noopener noreferrer";
    surahText.append(classification);
  }

  const lessonToolbar = createElement("div", "lesson-toolbar");
  const audioLink = createElement("a", "audio-source-button", "♪ الاستماع والتلاوة من المصحف الإلكتروني");
  audioLink.href = revelationSourceUrl || quranLearningData.indexSource;
  audioLink.target = "_blank";
  audioLink.rel = "noopener noreferrer";
  audioLink.setAttribute("aria-label", `افتح صفحة ${activeAssignment} في المصحف الإلكتروني للاستماع`);
  lessonToolbar.append(audioLink);
  const reviewedCount = getReviewedCount(activeAssignment);
  const progressLabel = createElement("span", "lesson-progress", reviewedCount >= reading.verses.length
    ? `أحسنت! أتممت مراجعة السورة ⭐ ${toArabicNumber(reviewedCount)} / ${toArabicNumber(reading.verses.length)}`
    : `نجوم المراجعة: ${toArabicNumber(reviewedCount)} / ${toArabicNumber(reading.verses.length)} ⭐`);
  progressLabel.setAttribute("role", "status");
  lessonToolbar.append(progressLabel);
  surahText.append(lessonToolbar);
  surahText.append(createElement("p", "interaction-hint", "اضغط على الكلمات المظللة لعرض معناها، أو على رقم الآية لعرض جميع معانيها."));

  if (reading.basmala) {
    surahText.append(createElement("div", "basmala", reading.basmala));
  }

  const verses = createElement("div", "verse-list");

  reading.verses.forEach((verse) => {
    const verseContainer = createElement("div", "verse-container");
    const ayahMeanings = entries.filter((entry) => {
      const n = Number(entry.ayah.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))));
      return n === verse.number;
    });

    // The verse remains verbatim; only words with a source-backed meaning become buttons.
    const line = createElement("p", "quran-verse");
    const verseText = createElement("span", "quran-verse-text");
    verse.text.split(/(\s+)/).forEach((part) => {
      if (/^\s+$/.test(part)) {
        verseText.append(document.createTextNode(part));
        return;
      }
      const cleanWord = part.replace(/^[۞۝﴿﴾]+|[۞۝﴿﴾،؛,.!?؟:]+$/g, "");
      const matches = getEntriesForWord(entries, verse.number, cleanWord);
      if (matches.length === 0) {
        verseText.append(document.createTextNode(part));
        return;
      }
      const wordButton = createElement("button", "quran-word quran-word--has-meaning", part);
      wordButton.type = "button";
      wordButton.setAttribute("aria-expanded", "false");
      wordButton.setAttribute("aria-label", `معنى ${cleanWord}`);
      wordButton.setAttribute("aria-controls", `ayah-meanings-${textKey}-${verse.number}`);
      wordButton.addEventListener("click", () => {
        const wasOpen = wordButton.getAttribute("aria-expanded") === "true";
        line.querySelectorAll(".quran-word").forEach((button) => button.setAttribute("aria-expanded", "false"));
        numBtn.setAttribute("aria-expanded", "false");
        if (wasOpen) {
          panel.hidden = true;
          panel.replaceChildren();
          verseContainer.classList.remove("verse-container--meaning-open");
          return;
        }
        wordButton.setAttribute("aria-expanded", "true");
        renderMeaningList(panel, matches.map(({ entry }) => entry), activeAssignment);
        panel.hidden = false;
        verseContainer.classList.add("verse-container--meaning-open");
      });
      verseText.append(wordButton);
    });
    line.append(verseText, document.createTextNode(" "));

    const numBtn = createElement("button", "quran-verse-number", toArabicNumber(verse.number));
    numBtn.type = "button";
    numBtn.setAttribute("aria-label", `معاني الآية ${toArabicNumber(verse.number)}`);
    numBtn.setAttribute("aria-expanded", "false");
    line.append(numBtn);
    verseContainer.append(line);

    // Meanings panel — shown on tap, word meanings ONLY
    const panel = createElement("div", "ayah-meanings-panel");
    panel.id = `ayah-meanings-${textKey}-${verse.number}`;
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    numBtn.setAttribute("aria-controls", panel.id);

    const reviewLabel = createElement("label", "review-toggle");
    const reviewCheckbox = document.createElement("input");
    reviewCheckbox.type = "checkbox";
    reviewCheckbox.checked = isAyahReviewed(activeAssignment, verse.number);
    reviewCheckbox.setAttribute("aria-label", `تحديد الآية ${toArabicNumber(verse.number)} تمت مراجعتها`);
    const reviewText = createElement("span", "", "تمت المراجعة");
    reviewLabel.append(reviewCheckbox, reviewText);
    reviewCheckbox.addEventListener("change", () => {
      reviewProgress[activeAssignment] ||= {};
      reviewProgress[activeAssignment][verse.number] = reviewCheckbox.checked;
      if (!reviewCheckbox.checked) delete reviewProgress[activeAssignment][verse.number];
      saveLocalData(progressStorageKey, reviewProgress);
      const count = getReviewedCount(activeAssignment);
      progressLabel.textContent = count >= reading.verses.length
        ? `أحسنت! أتممت مراجعة السورة ⭐ ${toArabicNumber(count)} / ${toArabicNumber(reading.verses.length)}`
        : `نجوم المراجعة: ${toArabicNumber(count)} / ${toArabicNumber(reading.verses.length)} ⭐`;
      renderSurahs();
    });
    line.append(reviewLabel);

    if (ayahMeanings.length > 0) {
      renderMeaningList(panel, ayahMeanings, activeAssignment);
    } else {
      panel.append(createElement("p", "meanings-empty", "لا توجد معانٍ محددة لهذه الآية في المصدر."));
    }

    verseContainer.append(panel);

    // Toggle
    numBtn.addEventListener("click", () => {
      const isOpen = numBtn.getAttribute("aria-expanded") === "true";
      verses.querySelectorAll(".quran-verse-number[aria-expanded='true']").forEach((btn) => {
        if (btn !== numBtn) {
          btn.setAttribute("aria-expanded", "false");
          const openVerse = btn.closest(".verse-container");
          openVerse.classList.remove("verse-container--meaning-open");
          openVerse.querySelector(".ayah-meanings-panel").hidden = true;
        }
      });
      numBtn.setAttribute("aria-expanded", String(!isOpen));
      panel.hidden = isOpen;
      verseContainer.classList.toggle("verse-container--meaning-open", !isOpen);
      if (!isOpen) renderMeaningList(panel, ayahMeanings, activeAssignment);
      line.querySelectorAll(".quran-word").forEach((button) => button.setAttribute("aria-expanded", "false"));
    });

    verses.append(verseContainer);
  });

  surahText.append(verses);
  lesson.append(surahText);

  // ════════════════════════════════════════
  // BLOCK 2 — Tafsir, one point per ayah
  // ════════════════════════════════════════
  const hasTafsirData = reading.verses.some((v) => getTafsirForVerse(textKey, v.number));
  if (hasTafsirData) {
    const tafsirSection = createElement("section", "tafsir-section");
    tafsirSection.setAttribute("aria-label", `تفسير ${activeAssignment}`);

    const heading = createElement("h2", "tafsir-section__heading", "التفسير");
    const src = createElement("a", "tafsir-section__source", "تفسير السعدي · المصحف الإلكتروني");
    src.href   = `https://e-quran.com/pages/tafseer/saadi/`;
    src.target = "_blank";
    src.rel    = "noopener noreferrer";
    tafsirSection.append(heading, src);

    const ol = createElement("ol", "tafsir-points");

    reading.verses.forEach((verse) => {
      const tafsirEntry = getTafsirForVerse(textKey, verse.number);
      if (!tafsirEntry) return;

      const li = createElement("li", "tafsir-point");

      // Highlighted ayah text at the start of each point
      const ayahLine = createElement("p", "tafsir-point__ayah");
      ayahLine.append(
        createElement("span", "tafsir-point__num", toArabicNumber(verse.number)),
        document.createTextNode(" "),
        createElement("span", "tafsir-point__verse-text", verse.text)
      );

      // Clean tafsir body — strip { } braces
      const cleanText = tafsirEntry.text
        .replace(/\{([^}]+)\}/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
      const body = createElement("p", "tafsir-point__body", cleanText);

      const link = createElement("a", "tafsir-point__link", "المصدر");
      link.href   = tafsirEntry.url;
      link.target = "_blank";
      link.rel    = "noopener noreferrer";

      li.append(ayahLine, body, link);
      ol.append(li);
    });

    tafsirSection.append(ol);
    lesson.append(tafsirSection);
  }

  document.querySelector("#quiz-mode-tab").disabled = entries.length === 0;
}

function toArabicNumber(number) {
  return String(number).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
}

function renderQuizQuestion() {
  lesson.replaceChildren();
  const question = quizQuestions[questionIndex];
  const card = createElement("div", "quiz-card");
  const progress = createElement("p", "quiz-progress", `السؤال ${questionIndex + 1} من ${quizQuestions.length}`);
  const heading = createElement("h2", "", `ما معنى «${question.word}»؟`);
  const ayah = createElement("p", "meaning-reference", `الآية ${question.ayah}`);
  const answers = createElement("div", "answer-list");
  const feedback = createElement("p", "quiz-feedback");
  feedback.setAttribute("aria-live", "polite");
  const nextButton = createElement(
    "button",
    "mode-button next-button",
    questionIndex + 1 === quizQuestions.length ? "النتيجة" : "السؤال التالي"
  );
  nextButton.type = "button";
  nextButton.hidden = true;
  nextButton.addEventListener("click", () => {
    if (questionIndex + 1 === quizQuestions.length) {
      renderQuizResult();
      return;
    }
    questionIndex += 1;
    answered = false;
    renderQuizQuestion();
  });

  const distractors = getAllMeaningEntries()
    .filter((entry) => entry.meaning !== question.meaning)
    .map((entry) => entry.meaning)
    .filter((meaning, index, meanings) => meanings.indexOf(meaning) === index);
  const choices = shuffle([question.meaning, ...shuffle(distractors).slice(0, 3)]);

  choices.forEach((choice) => {
    const button = createElement("button", "answer-button", choice);
    button.type = "button";
    button.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const isCorrect = choice === question.meaning;
      if (isCorrect) score += 1;
      button.classList.add(isCorrect ? "answer-correct" : "answer-wrong");
      Array.from(answers.children).forEach((answerButton) => {
        answerButton.disabled = true;
        if (answerButton.textContent === question.meaning) {
          answerButton.classList.add("answer-correct");
        }
      });
      feedback.textContent = isCorrect
        ? "أحسنت! إجابة صحيحة."
        : `الإجابة الصحيحة: ${question.meaning}`;
      feedback.classList.toggle("feedback-correct", isCorrect);
      nextButton.hidden = false;
    });
    answers.append(button);
  });

  card.append(progress, heading, ayah, answers, feedback, nextButton);
  lesson.append(card);
}

function renderQuizResult() {
  lesson.replaceChildren();
  const card = createElement("div", "result-card");
  const stars = Math.round((score / quizQuestions.length) * 5);
  const praise = score === quizQuestions.length
    ? "ممتاز! أنت نجم القرآن!"
    : score > 0
      ? "أحسنت! كل محاولة تزيدك معرفة."
      : "لا بأس، جرّب مرة أخرى وستنجح!";
  card.append(
    createElement("div", "result-stars", stars ? "⭐ ".repeat(stars).trim() : "✨"),
    createElement("h2", "", "انتهى الاختبار"),
    createElement("p", "result-praise", praise),
    createElement("p", "result-score", `نتيجتك: ${score} من ${quizQuestions.length}`)
  );
  const retryButton = createElement("button", "mode-button", "أعد الاختبار");
  retryButton.type = "button";
  retryButton.addEventListener("click", startQuiz);
  card.append(retryButton);
  lesson.append(card);
}

function startQuiz() {
  const entries = getMeaningEntries(activeAssignment);
  if (entries.length === 0) {
    lesson.replaceChildren(
      createElement("p", "empty-meanings", "لا توجد معانٍ متحققة للاختبار في هذا الاختيار.")
    );
    return;
  }

  quizQuestions = shuffle(entries).slice(0, Math.min(5, entries.length));
  questionIndex = 0;
  score = 0;
  answered = false;
  renderQuizQuestion();
}

function setMode(mode) {
  if (mode === "quiz" && !activeAssignment) return;
  if (mode === "quiz" && getMeaningEntries(activeAssignment).length === 0) return;
  activeMode = mode;
  modeTabs.forEach((tab) => {
    tab.setAttribute("aria-pressed", String(tab.dataset.mode === mode));
  });
  if (!activeAssignment) {
    lesson.replaceChildren();
    return;
  }
  if (mode === "quiz") {
    startQuiz();
  } else {
    renderMeanings();
  }
}

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

renderGrades();

const gradeNavigation = document.querySelector("#grade-navigation");
const surahNavigation = document.querySelector("#surah-navigation");
const surahsSection = document.querySelector("#surahs-section");
const lesson = document.querySelector("#lesson");
const modeTabs = Array.from(document.querySelectorAll(".mode-tab"));
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

    // Nothing to show — plain text
    if (!hasMeaning && !hasTafsir) {
      target.append(document.createTextNode(part));
      return;
    }

    const wordClass = hasMeaning ? "quran-word quran-word--has-meaning" : "quran-word quran-word--tafsir-only";
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

      // ① Word/phrase meaning from e-Quran word-meanings source
      if (hasMeaning) {
        matches.forEach(({ entry }) => {
          const block = createElement("div", "word-meaning-entry");
          const label = createElement("strong", "meaning-word-label", entry.word);
          const text  = createElement("p",      "meaning-word-text",  entry.meaning);
          const src   = createElement("a", "meaning-source-tag", "معنى الكلمة · المصحف الإلكتروني");
          src.href   = quranLearningData.surahs[activeAssignment]?.meaningsSource
                       || quranLearningData.meaningPages[activeAssignment]
                       || quranLearningData.indexSource;
          src.target = "_blank";
          src.rel    = "noopener noreferrer";
          block.append(label, text, src);
          panel.append(block);
        });
      }

      // ② Tafsir (per-ayah) from e-Quran tafseer/saadi
      if (hasTafsir) {
        const block   = createElement("div", "word-tafsir-entry");
        const heading = createElement("p", "tafsir-label", `تفسير الآية ${toArabicNumber(verseNumber)}`);
        const body    = createElement("p", "tafsir-body");

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
        block.append(heading, body, src);
        panel.append(block);
      }
    });

    target.append(word);
  });
}

function renderGrades() {
  gradeNavigation.replaceChildren();
  quranLearningData.grades.forEach((grade, index) => {
    const button = createElement("button", "grade-button", grade.name);
    button.type = "button";
    button.setAttribute("aria-pressed", String(index === activeGradeIndex));
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

  grade.assignments.forEach((assignment) => {
    const button = createElement("button", "surah-button");
    button.type = "button";
    button.setAttribute("aria-pressed", String(assignment === activeAssignment));
    button.append(createElement("span", "surah-button-name", assignment));
    const revelationLabel = getRevelationLabel(assignment);
    if (revelationLabel) {
      button.append(createElement("span", "surah-classification", revelationLabel));
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

function renderMeanings() {
  lesson.replaceChildren();
  const entries = getMeaningEntries(activeAssignment);
  const reading = quranTextData[quranTextKeys[activeAssignment]];

  if (reading) {
    const surahText = createElement("section", "surah-text");
    surahText.setAttribute("aria-label", `نص ${activeAssignment}`);
    surahText.append(createElement("h2", "", "نص السورة"));
    const revelationLabel = getRevelationLabel(activeAssignment);
    const revelationSourceUrl = getRevelationSourceUrl(activeAssignment);
    if (revelationLabel && revelationSourceUrl) {
      const classification = createElement("a", "surah-revelation-source", revelationLabel);
      classification.href = revelationSourceUrl;
      classification.target = "_blank";
      classification.rel = "noopener noreferrer";
      surahText.append(classification);
    }
    const textKey = quranTextKeys[activeAssignment];
    if (reading.basmala) {
      const basmala = createElement("div", "basmala");
      const basmalaWords = createElement("span", "quran-verse-text");
      const basmalaPanel = createElement("aside", "word-meaning-panel");
      basmalaPanel.hidden = true;
      basmalaPanel.setAttribute("aria-live", "polite");
      basmalaPanel.id = `meaning-${textKey}-basmala`;
      renderClickableWords(basmalaWords, reading.basmala, basmalaPanel, entries, null, surahText, textKey);
      basmala.append(basmalaWords, basmalaPanel);
      surahText.append(basmala);
    }
    const verses = createElement("div", "verse-list");
    reading.verses.forEach((verse) => {
      const verseContainer = createElement("div", "verse-container");
      const line = createElement("p", "quran-verse");
      const wordList = createElement("span", "quran-verse-text");
      const meaningPanel = createElement("aside", "word-meaning-panel");
      meaningPanel.hidden = true;
      meaningPanel.setAttribute("aria-live", "polite");
      meaningPanel.id = `meaning-${textKey}-${verse.number}`;

      renderClickableWords(wordList, verse.text, meaningPanel, entries, verse.number, surahText, textKey);

      line.append(
        wordList,
        document.createTextNode(" "),
        createElement("span", "quran-verse-number", toArabicNumber(verse.number))
      );
      verseContainer.append(line, meaningPanel);
      verses.append(verseContainer);
    });
    surahText.append(verses);
    lesson.append(surahText);
  } else {
    lesson.append(createElement("p", "empty-meanings", "لا يتوفر نص هذا المقرر."));
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
  card.append(
    createElement("h2", "", "انتهى الاختبار"),
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

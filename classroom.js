(() => {
  // The static website connects to the separate Render WebSocket service.
  const SOCKET_URL = "wss://taryam-quran-classroom.onrender.com";
  let socket = null;
  let session = null;
  let lastGrades = [];
  let getEntries = () => [];
  let root = null;

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function send(type, data = {}) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...data }));
  }

  function panel(title, description) {
    const card = el("section", "classroom-card");
    card.append(el("h2", "", title));
    if (description) card.append(el("p", "classroom-description", description));
    return card;
  }

  function inputField(label, placeholder, maxLength = 24) {
    const wrap = el("label", "classroom-field");
    wrap.append(el("span", "", label));
    const input = el("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.autocomplete = "off";
    input.required = true;
    wrap.append(input);
    return { wrap, input };
  }

  function actionButton(text, onClick, secondary = false) {
    const button = el("button", secondary ? "classroom-button classroom-button--secondary" : "classroom-button", text);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function statusLine(text, kind = "") {
    const line = el("p", `classroom-status ${kind}`.trim(), text);
    line.setAttribute("role", "status");
    return line;
  }

  function render() {
    if (!root) return;
    root.replaceChildren();
    if (!session) return renderRoles();
    if (session.phase === "lobby") return renderLobby();
    if (session.phase === "playing") return renderTurn();
    if (session.phase === "finished") return renderResults();
    if (session.phase === "error") return renderRoles(session.error);
  }

  function currentPlayer() {
    const playerId = session?.turnOrder?.[session.turnIndex];
    return session?.players?.find((player) => player.id === playerId) || null;
  }

  function renderRoles(error = "") {
    const card = panel("لعبة الصف", "العبوا معًا في غرفة واحدة. اختاروا دوركم للبدء.");
    const roles = el("div", "classroom-role-grid");
    roles.append(
      actionButton("أنا معلّم / معلّمة", () => renderTeacherForm()),
      actionButton("أنا طالب / طالبة", () => renderStudentForm(), true)
    );
    card.append(roles);
    if (error) card.append(statusLine(error, "classroom-status--error"));
    card.append(actionButton("تدرّب وحدك", () => document.querySelector("#solo-quiz-mode-tab").click(), true));
    root.append(card);
  }

  function renderTeacherForm() {
    const card = panel("إنشاء غرفة للصف", "اختر الصف والسورة، ثم شارك رمز الغرفة مع الطلاب.");
    const host = inputField("اسم المعلّم / المعلّمة", "مثال: الأستاذة مريم");
    const gradeLabel = el("label", "classroom-field");
    gradeLabel.append(el("span", "", "الصف"));
    const gradeSelect = el("select");
    gradeSelect.append(new Option("اختر الصف", ""));
    lastGrades.forEach((grade, index) => gradeSelect.append(new Option(grade.name, String(index))));
    gradeLabel.append(gradeSelect);
    const surahLabel = el("label", "classroom-field");
    surahLabel.append(el("span", "", "السورة"));
    const surahSelect = el("select");
    surahSelect.append(new Option("اختر السورة", ""));
    surahSelect.disabled = true;
    surahLabel.append(surahSelect);
    const status = statusLine("");
    const create = actionButton("إنشاء الغرفة", () => {
      const hostName = host.input.value.trim();
      const grade = lastGrades[Number(gradeSelect.value)];
      const surah = surahSelect.value;
      if (!hostName || !grade || !surah) {
        status.textContent = "أكمل الاسم والصف والسورة أولًا.";
        status.className = "classroom-status classroom-status--error";
        return;
      }
      const entries = getEntries(surah);
      if (!entries.length) {
        status.textContent = "لا تتوفر معانٍ كافية لهذه السورة في الموقع حتى الآن.";
        status.className = "classroom-status classroom-status--error";
        return;
      }
      connect(status, { type: "create", hostName, gradeName: grade.name, surah, questions: entries });
    });
    gradeSelect.addEventListener("change", () => {
      surahSelect.replaceChildren(new Option("اختر السورة", ""));
      const grade = lastGrades[Number(gradeSelect.value)];
      surahSelect.disabled = !grade;
      (grade?.assignments || []).forEach((surah) => surahSelect.append(new Option(surah, surah)));
    });
    card.append(host.wrap, gradeLabel, surahLabel, create, status,
      actionButton("رجوع", () => renderRoles(), true));
    root.replaceChildren(card);
  }

  function renderStudentForm() {
    const card = panel("الانضمام إلى غرفة", "اكتب الرمز الذي شاركه المعلّم معك.");
    const name = inputField("اسم الطالب / الطالبة", "اكتب اسمك");
    const code = inputField("رمز الغرفة", "مثال: A7K4P", 6);
    code.input.maxLength = 6;
    code.input.autocapitalize = "characters";
    const status = statusLine("");
    const join = actionButton("انضم إلى الغرفة", () => {
      const playerName = name.input.value.trim();
      const roomCode = code.input.value.trim().toUpperCase();
      if (!playerName || !roomCode) {
        status.textContent = "اكتب اسمك ورمز الغرفة أولًا.";
        status.className = "classroom-status classroom-status--error";
        return;
      }
      connect(status, { type: "join", roomCode, playerName });
    });
    code.input.addEventListener("input", () => { code.input.value = code.input.value.toUpperCase(); });
    card.append(name.wrap, code.wrap, join, status,
      actionButton("رجوع", () => renderRoles(), true));
    root.replaceChildren(card);
  }

  function connect(status, message) {
    if (SOCKET_URL.includes("REPLACE_WITH")) {
      status.textContent = "خدمة الغرف المباشرة لم تُنشر بعد.";
      status.className = "classroom-status classroom-status--error";
      return;
    }
    status.textContent = "جارٍ الاتصال بالغرفة… قد يستغرق تشغيل الخدمة المجانية دقيقة عند أول استخدام.";
    status.className = "classroom-status";
    try {
      socket = new WebSocket(SOCKET_URL);
    } catch {
      status.textContent = "تعذّر الاتصال. حاول مرة أخرى بعد قليل.";
      status.className = "classroom-status classroom-status--error";
      return;
    }
    socket.addEventListener("open", () => send(message.type, message), { once: true });
    socket.addEventListener("message", (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === "error") {
        if (session && ["lobby", "playing"].includes(session.phase)) {
          session.messageError = data.message;
        } else {
          socket.close();
          session = { phase: "error", error: data.message };
        }
        render();
        return;
      }
      if (data.type === "created" || data.type === "joined" || data.type === "room") {
        session = { ...session, ...data.room, phase: data.room.phase || "lobby", isHost: data.isHost ?? session?.isHost ?? false,
          selfId: data.selfId || session?.selfId, messageError: "" };
        render();
      }
      if (data.type === "started") {
        session = { ...session, ...data.room, phase: "playing", messageError: "" };
        render();
      }
      if (data.type === "answered") {
        session = { ...session, ...data.room, lastAnswer: data.answer, phase: "playing", messageError: "" };
        render();
      }
      if (data.type === "finished") {
        session = { ...session, ...data.room, phase: "finished", messageError: "" };
        render();
      }
    });
    socket.addEventListener("close", () => {
      if (session && ["lobby", "playing"].includes(session.phase)) {
        session = { phase: "error", error: "انقطع الاتصال بالغرفة. ارجع وحاول الانضمام من جديد." };
        render();
      }
    });
    socket.addEventListener("error", () => {
      status.textContent = "لم نتمكن من الوصول إلى خدمة الغرف. حاول مرة أخرى.";
      status.className = "classroom-status classroom-status--error";
    });
  }

  function playerList() {
    const list = el("ul", "classroom-player-list");
    (session.players || []).forEach((player, index) => {
      const row = el("li", "classroom-player");
      row.append(el("span", "classroom-player__number", `${toArabic(index + 1)}.`),
        el("span", "", player.name),
        el("span", "classroom-player__points", `${toArabic(player.points || 0)} نقطة`));
      list.append(row);
    });
    return list;
  }

  function toArabic(value) { return String(value).replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]); }

  function renderLobby() {
    const card = panel(session.isHost ? "غرفتك جاهزة!" : `أهلًا ${session.selfName || "بك"}!`,
      session.isHost ? "شارك هذا الرمز مع طلابك. ابدأ عندما يصبح الجميع جاهزين." : "انتظر حتى يبدأ المعلّم اللعبة.");
    const codeBox = el("div", "classroom-code-box");
    codeBox.append(el("span", "", "رمز الغرفة"), el("strong", "", session.code || "———"));
    if (session.isHost) {
      codeBox.append(actionButton("نسخ الرمز", async () => {
        try { await navigator.clipboard.writeText(session.code); } catch { /* code remains visible */ }
      }, true));
    }
    card.append(codeBox, el("p", "classroom-meta", `${session.gradeName || ""} · ${session.surah || ""}`),
      el("h3", "classroom-subheading", `الطلاب المنضمون (${toArabic((session.players || []).length)})`), playerList());
    if (session.isHost) {
      const start = actionButton("ابدأ اللعبة", () => send("start"));
      start.disabled = (session.players || []).length === 0;
      card.append(start);
    }
    card.append(statusLine(session.isHost && !session.players?.length
      ? "بانتظار انضمام طالب واحد على الأقل…" : "تم تحديث قائمة المشاركين تلقائيًا."));
    root.replaceChildren(card);
  }

  function renderTurn() {
    const player = currentPlayer();
    if (!player) return renderResults();
    const card = panel(`دور ${player.name}!`, `السؤال ${toArabic(session.turnIndex + 1)} من ${toArabic(session.turnOrder?.length || 0)}`);
    const order = el("div", "classroom-turn-order");
    order.append(el("span", "classroom-turn-order__label", "ترتيب اللعب"));
    (session.turnOrder || []).forEach((playerId, index) => {
      const ordered = session.players.find((item) => item.id === playerId);
      const chip = el("span", `classroom-turn-chip ${index === session.turnIndex ? "is-current" : ""}`, `${toArabic(index + 1)}. ${ordered?.name || ""}`);
      order.append(chip);
    });
    const question = session.currentQuestion;
    const prompt = el("div", "classroom-question");
    prompt.append(el("p", "classroom-question__reference", `${session.surah} · الآية ${question.ayah}`),
      el("h3", "", `ما معنى «${question.word}»؟`));
    const answers = el("div", "classroom-answer-list");
    const canAnswer = player.id === session.selfId && !session.answered;
    (question.choices || []).forEach((choice) => {
      const button = actionButton(choice, () => send("answer", { choice }));
      button.classList.add("classroom-answer");
      button.disabled = !canAnswer;
      answers.append(button);
    });
    prompt.append(answers);
    card.append(order, prompt);
    if (session.lastAnswer) {
      card.append(statusLine(session.lastAnswer.correct
        ? `أحسنت يا ${session.lastAnswer.playerName}! إجابة صحيحة ونقطة جديدة ⭐`
        : `الإجابة الصحيحة: ${session.lastAnswer.correctMeaning}`,
        session.lastAnswer.correct ? "classroom-status--success" : "classroom-status--error"));
    } else if (canAnswer) {
      card.append(statusLine("اختر إجابتك من جهازك."));
    } else if (player.id === session.selfId) {
      card.append(statusLine("تم تسجيل إجابتك، انتظر نتيجة السؤال."));
    } else {
      card.append(statusLine(`السؤال الآن لـ ${player.name}.`));
    }
    if (session.messageError) card.append(statusLine(session.messageError, "classroom-status--error"));
    if (session.isHost && (session.lastAnswer || session.turnIndex >= (session.turnOrder || []).length - 1)) {
      card.append(actionButton(session.turnIndex >= (session.turnOrder || []).length - 1 ? "عرض النتائج" : "اللاعب التالي",
        () => send("next")));
    } else if (session.isHost) {
      card.append(actionButton("تجاوز هذا الدور", () => send("next"), true));
    }
    card.append(el("h3", "classroom-subheading", "النقاط"), playerList());
    root.replaceChildren(card);
  }

  function renderResults() {
    const players = [...(session.players || [])].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "ar"));
    const topScore = players[0]?.points || 0;
    const winners = players.filter((player) => player.points === topScore);
    const card = panel("انتهت اللعبة!", winners.length > 1
      ? `تعادل رائع بين ${winners.map((player) => player.name).join(" و ")}!`
      : `البطل / البطلة: ${winners[0]?.name || ""} 🏆`);
    const list = el("ol", "classroom-leaderboard");
    players.forEach((player, index) => {
      const row = el("li", index === 0 ? "classroom-leaderboard__winner" : "");
      row.append(el("span", "", `${toArabic(index + 1)}. ${player.name}`), el("strong", "", `${toArabic(player.points)} نقطة`));
      list.append(row);
    });
    card.append(list, actionButton("العودة إلى لعبة الصف", () => { session = null; socket?.close(); render(); }));
    root.replaceChildren(card);
  }

  window.classroomMode = {
    render(container, grades, entriesFor) {
      root = container;
      lastGrades = grades;
      getEntries = entriesFor;
      render();
    }
  };
})();

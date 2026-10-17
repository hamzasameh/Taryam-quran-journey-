const http = require("node:http");
const { randomBytes, randomUUID } = require("node:crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 10000;
const MAX_PLAYERS = 35;
const MAX_ROOM_AGE_MS = 2 * 60 * 60 * 1000;
const rooms = new Map();
const peers = new Map();

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  response.end("خدمة لعبة الصف تعمل.");
});

const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

function send(peer, message) {
  if (peer?.readyState === WebSocket.OPEN) peer.send(JSON.stringify(message));
}

function error(peer, message) { send(peer, { type: "error", message }); }

function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result;
  do {
    const bytes = randomBytes(6);
    result = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  } while (rooms.has(result));
  return result;
}

function publicRoom(room) {
  return {
    code: room.code,
    hostName: room.hostName,
    gradeName: room.gradeName,
    surah: room.surah,
    phase: room.phase,
    players: room.players.map(({ id, name, points }) => ({ id, name, points })),
    turnOrder: room.turnOrder,
    turnIndex: room.turnIndex,
    currentQuestion: room.currentQuestion,
    answered: room.answered,
    lastAnswer: room.lastAnswer || null
  };
}

function sendRoom(room, type = "room") {
  const view = publicRoom(room);
  for (const [peer, state] of peers) {
    if (state.roomCode === room.code) {
      send(peer, { type, room: view, isHost: state.role === "host", selfId: state.playerId,
        selfName: room.players.find((player) => player.id === state.playerId)?.name || room.hostName });
    }
  }
}

function cleanName(value) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24) : "";
}

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomBytes(4).readUInt32BE(0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createRoom(peer, data) {
  const hostName = cleanName(data.hostName);
  const gradeName = cleanName(data.gradeName);
  const surah = cleanName(data.surah);
  const questions = Array.isArray(data.questions) ? data.questions.filter((q) =>
    q && typeof q.word === "string" && typeof q.meaning === "string" && typeof q.ayah === "string"
  ).slice(0, 200) : [];
  if (!hostName || !gradeName || !surah || questions.length < 1) {
    error(peer, "أكمل بيانات الغرفة، وتأكد من توفر معاني للسورة.");
    return;
  }
  const roomCode = code();
  const room = {
    code: roomCode,
    hostName,
    gradeName,
    surah,
    questionBank: questions,
    phase: "lobby",
    players: [],
    turnOrder: [],
    turnIndex: 0,
    currentQuestion: null,
    answered: false,
    createdAt: Date.now()
  };
  rooms.set(roomCode, room);
  peers.set(peer, { role: "host", roomCode });
  send(peer, { type: "created", room: publicRoom(room), isHost: true, selfName: hostName });
}

function joinRoom(peer, data) {
  const roomCode = typeof data.roomCode === "string" ? data.roomCode.toUpperCase().trim() : "";
  const playerName = cleanName(data.playerName);
  const room = rooms.get(roomCode);
  if (!room) return error(peer, "لم نعثر على غرفة بهذا الرمز. تأكد من كتابته كما ظهر عند المعلّم.");
  if (room.phase !== "lobby") return error(peer, "بدأت اللعبة بالفعل، ولا يمكن الانضمام الآن.");
  if (!playerName) return error(peer, "اكتب اسمك قبل الانضمام.");
  if (room.players.length >= MAX_PLAYERS) return error(peer, "اكتمل عدد الطلاب في هذه الغرفة.");
  if ([room.hostName, ...room.players.map((player) => player.name)].some((name) => name.toLocaleLowerCase() === playerName.toLocaleLowerCase())) {
    return error(peer, "هذا الاسم مستخدم في الغرفة. أضف حرفًا أو رقمًا لتمييزه.");
  }
  const player = { id: randomUUID(), name: playerName, points: 0, connected: true };
  room.players.push(player);
  peers.set(peer, { role: "student", roomCode, playerId: player.id });
  send(peer, { type: "joined", room: publicRoom(room), isHost: false, selfId: player.id, selfName: player.name });
  sendRoom(room);
}

function startGame(peer, state) {
  const room = rooms.get(state.roomCode);
  if (!room || state.role !== "host") return error(peer, "المعلّم فقط يستطيع بدء اللعبة.");
  if (room.phase !== "lobby") return error(peer, "بدأت هذه اللعبة بالفعل.");
  if (room.players.length < 1) return error(peer, "انتظر انضمام طالب واحد على الأقل.");
  room.turnOrder = shuffle(room.players.map((player) => player.id));
  room.phase = "playing";
  room.turnIndex = 0;
  beginTurn(room);
  sendRoom(room, "started");
}

function beginTurn(room) {
  const playerId = room.turnOrder[room.turnIndex];
  const player = room.players.find((item) => item.id === playerId);
  if (!player || room.turnIndex >= room.turnOrder.length) {
    room.phase = "finished";
    room.currentQuestion = null;
    return;
  }
  const entry = shuffle(room.questionBank)[room.turnIndex % room.questionBank.length];
  const distractors = shuffle([...new Set(room.questionBank.map((item) => item.meaning))]
    .filter((meaning) => meaning !== entry.meaning)).slice(0, 3);
  room.currentQuestion = {
    word: entry.word.slice(0, 120),
    ayah: entry.ayah.slice(0, 12),
    choices: shuffle([entry.meaning, ...distractors.map((meaning) => meaning.slice(0, 300))])
  };
  room.currentAnswer = entry.meaning;
  room.currentPlayerId = player.id;
  room.answered = false;
  room.lastAnswer = null;
}

function answer(peer, state, data) {
  const room = rooms.get(state.roomCode);
  if (!room || room.phase !== "playing") return error(peer, "لا يوجد سؤال نشط الآن.");
  if (state.role !== "student" || state.playerId !== room.currentPlayerId) return error(peer, "انتظر دورك للإجابة.");
  if (room.answered) return error(peer, "تم تسجيل إجابة هذا السؤال بالفعل.");
  if (typeof data.choice !== "string" || !room.currentQuestion.choices.includes(data.choice)) return error(peer, "اختر إجابة من الخيارات الظاهرة.");
  const player = room.players.find((item) => item.id === state.playerId);
  const correct = data.choice === room.currentAnswer;
  if (correct) player.points += 1;
  room.answered = true;
  room.lastAnswer = { correct, correctMeaning: room.currentAnswer, playerName: player.name };
  const view = publicRoom(room);
  for (const [connectedPeer, connectedState] of peers) {
    if (connectedState.roomCode === room.code) {
      send(connectedPeer, { type: "answered", room: view, isHost: connectedState.role === "host",
        selfId: connectedState.playerId, selfName: player.name, answer: room.lastAnswer });
    }
  }
}

function nextTurn(peer, state) {
  const room = rooms.get(state.roomCode);
  if (!room || state.role !== "host") return error(peer, "المعلّم فقط يستطيع الانتقال للسؤال التالي.");
  if (room.phase !== "playing") return error(peer, "لا توجد لعبة نشطة.");
  room.turnIndex += 1;
  if (room.turnIndex >= room.turnOrder.length) {
    room.phase = "finished";
    room.currentQuestion = null;
    room.answered = true;
    sendRoom(room, "finished");
    return;
  }
  beginTurn(room);
  sendRoom(room);
}

wss.on("connection", (peer) => {
  peers.set(peer, {});
  peer.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch { return error(peer, "تعذر قراءة الطلب."); }
    if (!data || typeof data.type !== "string") return error(peer, "طلب غير معروف.");
    const state = peers.get(peer) || {};
    if (data.type === "create" && !state.roomCode) return createRoom(peer, data);
    if (data.type === "join" && !state.roomCode) return joinRoom(peer, data);
    if (!state.roomCode) return error(peer, "أنشئ غرفة أو انضم إلى غرفة أولًا.");
    if (data.type === "start") return startGame(peer, state);
    if (data.type === "answer") return answer(peer, state, data);
    if (data.type === "next") return nextTurn(peer, state);
    error(peer, "هذا الإجراء غير متاح.");
  });
  peer.on("close", () => {
    const state = peers.get(peer);
    peers.delete(peer);
    if (!state?.roomCode) return;
    const room = rooms.get(state.roomCode);
    if (!room) return;
    if (state.role === "host") {
      rooms.delete(room.code);
      for (const [otherPeer, otherState] of peers) {
        if (otherState.roomCode === room.code) {
          send(otherPeer, { type: "error", message: "أغلق المعلّم الغرفة." });
          otherPeer.close();
        }
      }
      return;
    }
    const player = room.players.find((item) => item.id === state.playerId);
    if (player) player.connected = false;
    if (room.phase === "lobby") room.players = room.players.filter((item) => item.id !== state.playerId);
    sendRoom(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [roomCode, room] of rooms) {
    if (now - room.createdAt > MAX_ROOM_AGE_MS) rooms.delete(roomCode);
  }
}, 15 * 60 * 1000).unref();

server.listen(PORT, "0.0.0.0", () => console.log(`Classroom service listening on ${PORT}`));

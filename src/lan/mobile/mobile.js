/* Chơi LAN — trang điện thoại của học sinh.
 *
 * Vai trò: chỉ gửi ý định (`lan:join`, `lan:answer`) và vẽ lại trạng thái do máy
 * giáo viên gửi xuống. Trang này KHÔNG chấm điểm, KHÔNG biết đáp án đúng, và không
 * giữ điểm số — máy giáo viên là nguồn chân lý duy nhất.
 *
 * Ràng buộc: HTML/CSS/JS thuần, không bundler (copyfiles chép thẳng như
 * presentation.html). `io` là socket.io-client đi kèm server (route /socket.io/),
 * nên không cần mạng Internet và không tải script từ origin khác (CSP chặn).
 */
(function () {
  'use strict';

  var LS_TOKEN = 'edugame.lan.token';
  var LS_ROOM = 'edugame.lan.room';
  var LS_NAME = 'edugame.lan.name';

  var socket = io({ autoConnect: true, reconnectionDelay: 800, reconnectionDelayMax: 8000 });
  var player = { id: null, token: null, name: '', teamId: '' };
  var latest = null;
  var answeredRound = -1;
  var joined = false;

  function $(id) { return document.getElementById(id); }
  /** The room this phone joined: from the URL, else what the pupil typed. */
  function currentRoom() {
    return String($('roomInput').value || roomFromUrl || '').toUpperCase();
  }
  function show(id) {
    ['view-join', 'view-wait', 'view-question', 'view-status'].forEach(function (view) {
      $(view).hidden = view !== id;
    });
  }
  function setText(id, text) { $(id).textContent = text == null ? '' : String(text); }
  function setError(id, message) {
    var node = $(id);
    node.textContent = message || '';
    node.hidden = !message;
  }

  var params = new URLSearchParams(window.location.search);
  var roomFromUrl = String(params.get('room') || '').toUpperCase().slice(0, 6);
  var tokenFromUrl = String(params.get('token') || '');
  if (roomFromUrl) $('roomInput').value = roomFromUrl;
  try {
    var savedRoom = localStorage.getItem(LS_ROOM) || '';
    var savedToken = localStorage.getItem(LS_TOKEN) || '';
    var savedName = localStorage.getItem(LS_NAME) || '';
    if (!roomFromUrl && savedRoom) $('roomInput').value = savedRoom;
    if (savedName) $('nameInput').value = savedName;
    if (savedToken) tokenFromUrl = tokenFromUrl || savedToken;
  } catch (error) { /* private mode: localStorage can throw */ }

  function remember() {
    try {
      localStorage.setItem(LS_TOKEN, player.token || '');
      localStorage.setItem(LS_ROOM, $('roomInput').value.toUpperCase());
      localStorage.setItem(LS_NAME, player.name || $('nameInput').value);
    } catch (error) { /* ignore */ }
  }

  function joinNow() {
    var room = String($('roomInput').value || '').trim().toUpperCase();
    var name = String($('nameInput').value || '').trim();
    if (!room) { setError('joinError', 'Hãy nhập mã phòng trên màn hình máy chiếu.'); return; }
    if (!name) { setError('joinError', 'Hãy nhập tên của em.'); return; }
    setError('joinError', '');
    $('joinBtn').disabled = true;
    player.name = name;
    player.token = null;
    socket.emit('lan:join', { room: room, name: name });
    setTimeout(function () { $('joinBtn').disabled = false; }, 1500);
  }

  $('joinBtn').addEventListener('click', joinNow);
  $('nameInput').addEventListener('keydown', function (event) {
    if (event.key === 'Enter') joinNow();
  });

  socket.on('connect', function () {
    setError('joinError', '');
    // A reload or a Wi-Fi drop reconnects with the saved token, so the pupil gets
    // their own points back and is not asked to type the name again.
    if (tokenFromUrl && !joined) {
      socket.emit('lan:rejoin', { room: String($('roomInput').value || roomFromUrl).toUpperCase(), token: tokenFromUrl });
    }
  });
  socket.on('disconnect', function () {
    if (!joined) return;
    show('view-status');
    setText('statusIcon', '📶');
    setText('statusTitle', 'Mất kết nối');
    setText('statusNote', 'Đang thử kết nối lại… Điểm của em vẫn được giữ.');
  });

  socket.on('lan:refused', function (payload) {
    joined = false;
    player.token = null;
    tokenFromUrl = '';
    try { localStorage.removeItem(LS_TOKEN); } catch (error) { /* ignore */ }
    show('view-join');
    setError('joinError', (payload && payload.message) || 'Không vào được phòng.');
    if (payload && payload.status === 'not-in-room') {
      // Saved token belonged to an older room: forget it so a rename is possible.
      socket.emit('lan:join', { room: String($('roomInput').value || '').toUpperCase(), name: String($('nameInput').value || '').trim() });
    }
  });

  socket.on('lan:joined', function (payload) {
    joined = true;
    player.id = payload.playerId;
    player.token = payload.token;
    if (payload.name) player.name = payload.name;
    tokenFromUrl = payload.token;
    remember();
    setText('waitName', player.name);
    show('view-wait');
  });

  socket.on('lan:state', function (snapshot) {
    latest = snapshot;
    render(snapshot);
  });

  socket.on('lan:round-closed', function (payload) {
    var index = payload && typeof payload.roundIndex === 'number' ? payload.roundIndex : -1;
    if (latest && index === latest.currentRoundIndex && answeredRound !== index) {
      show('view-status');
      setText('statusIcon', '⏰');
      setText('statusTitle', 'Đã hết thời gian');
      setText('statusNote', 'Câu này đã được chốt. Chờ câu tiếp theo.');
    }
  });

  socket.on('lan:answer-ack', function () {
    answeredRound = latest ? latest.currentRoundIndex : answeredRound;
    show('view-status');
    setText('statusIcon', '✓');
    setText('statusTitle', 'Đã ghi nhận câu trả lời');
    // Deliberately no right/wrong here: the projector announces the answer.
    setText('statusNote', 'Kết quả đúng/sai sẽ hiện trên máy chiếu.');
  });

  socket.on('lan:answer-refused', function (payload) {
    var status = payload && payload.status;
    if (status === 'already-answered') {
      show('view-status');
      setText('statusIcon', '✓');
      setText('statusTitle', 'Em đã trả lời câu này');
      setText('statusNote', 'Chờ câu tiếp theo nhé.');
      return;
    }
    setError('qError', (payload && payload.message) || 'Không gửi được câu trả lời.');
    document.querySelectorAll('.options button').forEach(function (button) { button.disabled = false; });
  });

  function render(snapshot) {
    if (!snapshot || !joined) return;
    // The server no longer sends the room code to phones (it is the join secret and
    // only reaches pupils through the URL they opened).
    setText('roomTag', 'Phòng ' + currentRoom());
    if (snapshot.state === 'finished') {
      answeredRound = -1;
      show('view-status');
      setText('statusIcon', '🏁');
      setText('statusTitle', 'Phiên chơi đã kết thúc');
      var mine = findMe(snapshot);
      setText('statusNote', mine ? 'Em trả lời đúng ' + mine.correct + '/' + mine.answered + ' câu · ' + mine.points + ' điểm.' : 'Cảm ơn em đã tham gia!');
      return;
    }
    var mineNow = findMe(snapshot);
    if (mineNow && mineNow.teamId) player.teamId = mineNow.teamId;
    var team = snapshot.teams.filter(function (entry) { return entry.id === player.teamId; })[0];
    var pill = $('teamPill');
    if (team) {
      pill.hidden = false;
      pill.textContent = (team.icon || '👥') + ' ' + team.name;
    } else {
      pill.hidden = true;
    }

    if (snapshot.state === 'lobby') {
      show('view-wait');
      setText('waitHint', snapshot.players.length + ' bạn đã vào phòng · Chờ giáo viên bắt đầu…');
      return;
    }

    if (snapshot.state === 'question') {
      if (answeredRound === snapshot.currentRoundIndex) {
        show('view-status');
        setText('statusIcon', '✓');
        setText('statusTitle', 'Đã ghi nhận câu trả lời');
        setText('statusNote', 'Kết quả đúng/sai sẽ hiện trên máy chiếu.');
        return;
      }
      renderQuestion(snapshot);
      return;
    }

    // reveal: the teacher closed the question for latecomers.
    show('view-status');
    setText('statusIcon', '📣');
    setText('statusTitle', 'Giáo viên đang chốt đáp án');
    setText('statusNote', 'Chờ câu tiếp theo…');
  }

  function findMe(snapshot) {
    if (!snapshot || !snapshot.players) return null;
    return snapshot.players.filter(function (entry) { return entry.id === player.id; })[0] || null;
  }

  function renderQuestion(snapshot) {
    show('view-question');
    setText('qKicker', snapshot.kicker + ' · ' + snapshot.roundIndex + '/' + snapshot.roundCount);
    // The stage story stays on the projector: phones get the question only, which is
    // what pupils need to answer and keeps the 360px screen readable.
    setText('qPrompt', snapshot.prompt);
    setError('qError', '');
    var input = snapshot.input || { kind: 'unsupported', reason: 'Chưa có câu hỏi.' };
    var list = $('qOptions');
    var form = $('qTextForm');
    list.innerHTML = '';
    if (input.kind === 'options') {
      form.hidden = true;
      list.hidden = false;
      input.options.forEach(function (option, index) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'option';
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', 'false');
        var letter = document.createElement('span');
        letter.className = 'letter';
        letter.textContent = String.fromCharCode(65 + index);
        var label = document.createElement('span');
        // textContent, not innerHTML: the prompt comes from teacher content.
        label.textContent = option.text;
        button.appendChild(letter);
        button.appendChild(label);
        button.addEventListener('click', function () {
          list.querySelectorAll('button').forEach(function (entry) { entry.disabled = true; entry.setAttribute('aria-checked', 'false'); });
          button.setAttribute('aria-checked', 'true');
          button.classList.add('selected');
          socket.emit('lan:answer', { optionId: option.id, answerText: '' });
        });
        list.appendChild(button);
      });
      return;
    }
    if (input.kind === 'text') {
      list.hidden = true;
      form.hidden = false;
      $('qTextInput').placeholder = input.placeholder || 'Nhập câu trả lời';
      $('qTextInput').value = '';
      // Do not autofocus: a phone that pops the keyboard while scrolling is jarring.
      return;
    }
    list.hidden = true;
    form.hidden = true;
    setError('qError', input.reason || 'Câu này chưa chơi được trên điện thoại.');
  }

  $('qTextForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var value = String($('qTextInput').value || '').trim();
    if (!value) { setError('qError', 'Hãy nhập câu trả lời trước.'); return; }
    setError('qError', '');
    $('qTextInput').disabled = true;
    socket.emit('lan:answer', { optionId: null, answerText: value });
    setTimeout(function () { $('qTextInput').disabled = false; }, 1200);
  });
})();

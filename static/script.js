let currentClass = "";
let timeLeft = 15;
let timerInterval;
let predictionInterval;
let lastPrediction = null;
let isHost = false;
let submitted = false;
let currentViewImage = null;
let roundStartTime = 0;
let timeSpent = 0;

const socket = io();

let roomId = null;

socket.on("room_created", (data) => {

    console.log("Room created:", data.room);

    roomId = data.room;
    isHost = true;

    document.getElementById("roomInput").value = roomId;
    document.getElementById("roomStatus").innerText = "Room Created: " + data.room;
    document.getElementById("startBtn").style.display = "inline-block";

});

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let drawing = false;

ctx.fillStyle = "white";
ctx.fillRect(0, 0, canvas.width, canvas.height);

function startGame() {
    if (!roomId) return;

    const startBtn = document.getElementById("startBtn");

    startBtn.disabled = true;
    startBtn.innerText = "Game in Progress...";

    startBtn.style.opacity = "0.5";
    startBtn.style.cursor = "not-allowed";
    startBtn.style.transform = "scale(1)";
    startBtn.style.background = "rgba(255, 255, 255, 0.05)";
    startBtn.style.boxShadow = "none";
    startBtn.classList.remove("btn-next-round");

    socket.emit("start_game", {
        room: roomId
    });
}

socket.on("game_started", (data) => {

    submitted = false;
    roundStartTime = Date.now();

    document.getElementById("submitBtn").disabled = false;

    currentClass = data.class;

    document.getElementById("classDisplay").innerText =
        "Draw: " + currentClass;

    clearCanvas();

    startTimer();

    clearInterval(predictionInterval);

    predictionInterval = setInterval(sendDrawing, 1000);

});

function startTimer() {
    timeLeft = 15;
    document.getElementById("timer").innerText = timeLeft;

    clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        timeLeft--;
        document.getElementById("timer").innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            clearInterval(predictionInterval);

            if (!submitted) {
                console.log("Time is up! Auto submitting...");
                submitDrawing();
            }

            if (isHost) {
                setTimeout(() => {
                    socket.emit("end_round", {
                        room: roomId
                    });
                }, 1500);
            }
        }
    }, 1000);
}

function clearCanvas() {

    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    document.getElementById("result").innerText = "";
}

canvas.addEventListener("mousedown", () => {
    drawing = true;
});

canvas.addEventListener("mouseup", () => {

    drawing = false;
    ctx.beginPath();

});

canvas.addEventListener("mousemove", draw);

function draw(e) {

    if (!drawing) return;

    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.strokeStyle = "black";

    ctx.lineTo(e.offsetX, e.offsetY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(e.offsetX, e.offsetY);
}

function drawRemote(x, y) {

    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.strokeStyle = "black";

    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y);
}

function createRoom() {

    const name = document.getElementById("nameInput").value;

    socket.emit("create_room", {
        name: name
    });

}

socket.on("player_joined", (data) => {
    console.log("Players in room:", data);

    const playerCountEl = document.getElementById("playerCount");
    const playerListEl = document.getElementById("playerList");

    if (!data.players) return;

    if (playerCountEl) {
        playerCountEl.innerText = `Players: ${data.players.length}/4`;
    }

    let listHtml = '<div style="color: var(--text-muted); margin-bottom: 8px; font-weight: 600;">👥 Participants:</div>';
    listHtml += '<div style="display: flex; flex-wrap: wrap; gap: 8px;">';

    data.players.forEach(p => {
        listHtml += `
            <div style="
                background: rgba(255, 255, 255, 0.1); 
                padding: 6px 12px; 
                border-radius: 20px; 
                border: 1px solid var(--glass-border);
                font-size: 0.85rem;
                display: flex;
                align-items: center;
                gap: 5px;
            ">
                <span style="color: #818cf8;">●</span> ${p}
            </div>`;
    });

    listHtml += '</div>';
    playerListEl.innerHTML = listHtml;
});

function joinRoom() {

    const room = document.getElementById("roomInput").value;
    const name = document.getElementById("nameInput").value;

    roomId = room;

    socket.emit("join_room", {
        room: room,
        name: name
    });

}

socket.on("joined_room", (data) => {

    console.log("Joined room:", data.room);

    roomId = data.room;

    document.getElementById("roomStatus").innerText =
        "Joined Room: " + data.room;

    document.getElementById("startBtn").style.display = "none";
});

socket.on("round_results", (data) => {

    let html = "<b>🏆 Correct</b>";

    data.correct.forEach((r, i) => {

        html += `
        ${r.rank}. ${r.player} - ${r.score}% (${r.guess})
        <button onclick="showDrawing('${r.image}')">View</button>
        `;

    });

    if (data.wrong.length > 0) {

        html += "<br><b>❌ Wrong</b><br>";

        data.wrong.forEach(r => {

            html += `
            ${r.player} - ${r.score}% (${r.guess})
            <button onclick="showDrawing('${r.image}')">View</button>
            `;

        });

    }

    document.getElementById("result").innerHTML = html;

    if (isHost) {
        const startBtn = document.getElementById("startBtn");
        startBtn.disabled = false;
        startBtn.innerText = "Start Next Round";
        startBtn.style.display = "inline-block";
        startBtn.style.background = "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)"; // สีม่วงไล่เฉด
        startBtn.style.boxShadow = "0 10px 15px -3px rgba(99, 102, 241, 0.4)";
        startBtn.style.opacity = "1";
        startBtn.style.cursor = "pointer";
        startBtn.style.transform = "scale(1.05)";
    } else {
        document.getElementById("startBtn").style.display = "none";
    }

});

function submitDrawing() {
    if (!roomId || submitted) return;

    const endTime = Date.now();
    timeSpent = Math.floor((endTime - roundStartTime) / 1000);
    if (timeSpent > 15) timeSpent = 15;

    submitted = true;
    const submitBtn = document.getElementById("submitBtn");
    submitBtn.disabled = true;

    const image = canvas.toDataURL("image/png");

    fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            image: image,
            room: roomId,
            player: socket.id
        })
    })
        .then(res => res.json())
        .then(data => {
            let percent = (data.predictions[0].confidence * 100).toFixed(2);
            let predictedClass = data.predictions[0].class;

            const resultArea = document.getElementById("result");
            resultArea.innerHTML = `
            <div style="text-align: center; padding: 20px; animation: pulse 1.5s infinite;">
                <div style="font-size: 1.2rem; margin-bottom: 8px;">Submitted</div>
                <div style="color: var(--text-muted); font-size: 0.8rem;">
                    AI thinks you drew a <b style="color: #22d3ee;">${predictedClass}</b> (${percent}%)
                </div>
                <div style="margin-top: 10px; font-size: 0.7rem; color: #fbbf24;">
                    Waiting for other players to finish...
                </div>
            </div>
        `;

            socket.emit("player_submitted", {
                room: roomId,
                score: percent,
                guess: predictedClass,
                image: image,
                timeSpent: timeSpent
            });
        })
        .catch(err => {
            console.error("Submit error:", err);
            submitted = false;
            submitBtn.disabled = false;
            submitBtn.innerText = "Retry Submit";
        });
}

function showDrawing(image) {
    const viewer = document.getElementById("drawingViewer");

    if (currentViewImage === image) {
        viewer.innerHTML = "";
        currentViewImage = null;
        return;
    }

    currentViewImage = image;
    viewer.innerHTML = `
        <div style="
            margin-top: 15px; 
            padding: 10px; 
            background: rgba(255,255,255,0.05); 
            border-radius: 16px; 
            border: 1px solid var(--glass-border);
            animation: fadeIn 0.3s ease;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Drawing Preview</span>
                <button onclick="closeViewer()" style="padding: 4px 8px; font-size: 10px; background: rgba(248, 113, 113, 0.2); color: #f87171;">✕ Close</button>
            </div>
            <img src="${image}" style="width: 100%; border-radius: 10px; border: 2px solid rgba(255,255,255,0.1);">
        </div>
    `;
}

function closeViewer() {
    document.getElementById("drawingViewer").innerHTML = "";
    currentViewImage = null;
}

function sendDrawing() {

    if (!roomId) return;

    if (!roomId || submitted) return;

    const image = canvas.toDataURL("image/png");

    fetch("/predict", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            image: image,
            room: roomId,
            player: socket.id
        })
    })
        .then(res => res.json())
        .then(data => {

            /*let text = "AI guesses:\n\n";

            data.predictions.forEach((p, i) => {

                let percent = (p.confidence * 100).toFixed(2);

                text += `${i + 1}. ${p.class}\n`;
                text += `confidence: ${percent}%\n\n`;

            });

            text += "Target: " + currentClass;

            document.getElementById("result").innerText = text;*/

            lastPrediction = data.predictions[0].class;

        });
}

canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
    const mouseEvent = new MouseEvent("mouseup", {});
    canvas.dispatchEvent(mouseEvent);
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    if (!drawing) return;

    ctx.lineWidth = 12;
    ctx.lineCap = "round";
    ctx.strokeStyle = "black";
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}, { passive: false });

function updatePlayerList(players) {
    const listContainer = document.getElementById("playerList");
    let html = '<div style="color: var(--text-muted); margin-bottom: 5px;">Online Players:</div>';
    players.forEach(p => {
        html += `<div style="background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 8px; margin-bottom: 4px; display: inline-block; margin-right: 5px;">👤 ${p}</div>`;
    });
    listContainer.innerHTML = html;
}

socket.on("round_results", (data) => {
    let html = `
        <div style="margin-bottom: 20px; text-align: center; border-bottom: 1px solid var(--glass-border); padding-bottom: 15px;">
            <h2 style="margin: 0; color: #4ade80;">Round Results</h2>
            <p style="margin: 5px 0; font-size: 0.9rem; color: #22d3ee;">Target: <b>${currentClass}</b></p>
        </div>
    `;

    const createCard = (r, isWinner) => `
        <div style="
            background: ${isWinner ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)'};
            border: 1px solid ${isWinner ? 'var(--primary)' : 'var(--glass-border)'};
            padding: 15px;
            border-radius: 18px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            animation: fadeIn 0.5s ease;
        ">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 800; font-size: 1.1rem;">
                    ${isWinner ? + r.rank + '.' : '👤'} ${r.player}
                </span>
                <span style="font-size: 0.8rem; color: var(--text-muted);">⏱ ${r.timeSpent}s</span>
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); padding: 8px 12px; border-radius: 10px;">
                <span style="font-size: 0.8rem;">AI Guess: <b style="color: ${isWinner ? '#4ade80' : '#f87171'}">${r.guess}</b></span>
                <span style="font-weight: bold; color: #fbbf24;">${parseFloat(r.score).toFixed(2)}%</span>
            </div>

            <button class="btn-secondary" style="width: 100%; padding: 8px; font-size: 0.8rem;" onclick="showDrawing('${r.image}')">
                View
            </button>
        </div>
    `;

    if (data.correct && data.correct.length > 0) {
        data.correct.forEach(r => html += createCard(r, true));
    }

    if (data.wrong && data.wrong.length > 0) {
        html += '<div style="margin: 20px 0 10px; font-weight: bold; text-align: left; opacity: 0.6;">Wrong Classes</div>';
        data.wrong.forEach(r => html += createCard(r, false));
    }

    document.getElementById("result").innerHTML = html;
});
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import torch
import base64
from io import BytesIO
from PIL import Image
import numpy as np
import random
from model import CNN
from flask_socketio import SocketIO, join_room, emit
import time

app = Flask(__name__)
CORS(app)

socketio = SocketIO(app, cors_allowed_origins="*")

CLASSES = [
    "cat", "dog", "car", "house", "tree",
    "cup", "fish", "clock", "chair", "airplane"
]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

model = CNN(num_classes=len(CLASSES))
model.load_state_dict(torch.load("drawing_weights.pth", map_location=device))
model.to(device)
model.eval()


def preprocess_image(image):
    img = np.array(image)

    img = 255 - img

    mask = img > 10
    coords = np.column_stack(np.where(mask))

    if coords.size > 0:
        y_min, x_min = coords.min(axis=0)
        y_max, x_max = coords.max(axis=0)
        img = img[y_min:y_max+1, x_min:x_max+1]

    img = Image.fromarray(img)
    img = img.resize((28,28), Image.Resampling.NEAREST)

    img = np.array(img).astype(np.float32) / 255.0

    img = torch.tensor(img).unsqueeze(0).unsqueeze(0)

    return img.to(device)

@app.route("/start_round", methods=["POST"])
def start_round():

    import random

    classes = [
        "cat",
        "dog",
        "car",
        "tree",
        "house",
        "bicycle",
        "apple",
        "chair"
    ]

    chosen = random.choice(classes)

    return jsonify({
        "class": chosen
    })

@app.route("/")
def home():
    return render_template("index.html")

@app.route("/predict", methods=["POST"])
def predict():

    data = request.get_json()

    room_id = data["room"]
    player_id = data["player"]

    image_data = data["image"]

    image_data = image_data.split(",")[1]
    image_bytes = base64.b64decode(image_data)
    image = Image.open(BytesIO(image_bytes)).convert("L")

    img_tensor = preprocess_image(image)

    with torch.no_grad():
        outputs = model(img_tensor)
        probs = torch.softmax(outputs, dim=1)
        top_probs, top_indices = torch.topk(probs, 3)

    top_predictions = [
        {
            "class": CLASSES[top_indices[0][i].item()],
            "confidence": float(top_probs[0][i].item())
        }
        for i in range(3)
    ]

    best_class = top_predictions[0]["class"]
    best_conf = top_predictions[0]["confidence"]

    room = rooms[room_id]
    target = room["target"]

    if best_class == target:
        if player_id not in room["scores"]:
            room["scores"][player_id] = best_conf
        else:
            room["scores"][player_id] = max(room["scores"][player_id], best_conf)

    target = room["target"]

    ai_guessed_correctly = (
        top_predictions[0]["class"] == target and
        best_conf > 0.75
    )

    return jsonify({
        "predictions": top_predictions,
        "ai_correct": ai_guessed_correctly
    })

rooms = {}

@socketio.on("create_room")
def create_room(data):

    room_id = str(random.randint(1000,9999))

    name = data.get("name", "Player")

    rooms[room_id] = {
        "players": [request.sid],
        "names": {request.sid: name},
        "scores": {},
        "target": None,
        "submissions": []
    }

    join_room(room_id)

    emit("room_created", {
    "room": room_id,
    "players": [name]
})


@socketio.on("join_room")
def join(data):

    room_id = data["room"]
    name = data["name"]

    if room_id not in rooms:
        emit("error", {"message": "Room not found"})
        return

    join_room(room_id)

    if "names" not in rooms[room_id]:
        rooms[room_id]["names"] = {}

    rooms[room_id]["names"][request.sid] = name

    if request.sid not in rooms[room_id]["players"]:
        rooms[room_id]["players"].append(request.sid)

    emit("joined_room", {"room": room_id})

    emit("player_joined",
        {"players": list(rooms[room_id]["names"].values())},
        room=room_id)


@socketio.on("drawing")
def drawing(data):
    pass

@socketio.on("disconnect")
def disconnect():

    for room_id in list(rooms.keys()):

        if request.sid in rooms[room_id]["players"]:

            rooms[room_id]["players"].remove(request.sid)

            emit("player_left",
                 {"players": len(rooms[room_id]["players"])},
                 room=room_id)

            if len(rooms[room_id]["players"]) == 0:
                del rooms[room_id]

@socketio.on("start_game")
def start_game(data):

    room = data["room"]

    target = random.choice(CLASSES)

    rooms[room]["target"] = target

    rooms[room]["submissions"] = []

    rooms[room]["scores"] = {
        player: 0 for player in rooms[room]["players"]
    }

    emit("game_started", {"class": target}, room=room)


@socketio.on("end_round")
def end_round(data):
    room_id = data["room"]
    if room_id not in rooms: return

    submissions = rooms[room_id]["submissions"]
    target = rooms[room_id]["target"]
    names = rooms[room_id]["names"]

    correct = []
    wrong = []

    for s in submissions:
        if s["guess"] == target:
            correct.append(s)
        else:
            wrong.append(s)

    correct = sorted(correct, key=lambda x: (-x["score"], x["timeSpent"]))

    results = []
    for i, entry in enumerate(correct):
        results.append({
            "rank": i+1,
            "player": names.get(entry["player"], "Unknown"),
            "score": float(entry["score"]),
            "guess": entry["guess"],
            "image": entry["image"],
            "timeSpent": entry["timeSpent"]
        })

    wrong_results = []
    for entry in wrong:
        wrong_results.append({
            "player": names.get(entry["player"], "Unknown"),
            "score": float(entry["score"]),
            "guess": entry["guess"],
            "image": entry["image"],
            "timeSpent": entry["timeSpent"]
        })

    socketio.emit("round_results", {
        "correct": results,
        "wrong": wrong_results
    }, room=room_id)

@socketio.on("player_submitted")
def player_submitted(data):
    room = data["room"]
    score = float(data["score"])
    guess = data["guess"]
    image = data["image"]
    time_spent = data.get("timeSpent", 0)

    rooms[room]["submissions"].append({
        "player": request.sid,
        "score": score,
        "guess": guess,
        "image": image,
        "time": time.time(),
        "timeSpent": time_spent
    })

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host='0.0.0.0', port=port)
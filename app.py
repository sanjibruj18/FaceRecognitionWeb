from flask import Flask, render_template, jsonify, request, send_file
import cv2
import numpy as np
import face_recognition
import os
import csv
from datetime import datetime
import base64

app = Flask(__name__)

# Paths 
DATASET_PATH = "dataset"
ATTENDANCE_FILE = "attendance.csv"

os.makedirs(DATASET_PATH, exist_ok=True)

# In-memory state 
encode_list_known = []
person_names = []

# Helper: encode faces from dataset 
def load_encodings():
    global encode_list_known, person_names
    enc_list, valid_names = [], []

    for fname in os.listdir(DATASET_PATH):
        if not fname.lower().endswith(('.jpg', '.jpeg', '.png')):
            continue

        img = cv2.imread(os.path.join(DATASET_PATH, fname))
        if img is None:
            print(f"Could not read {fname}")
            continue

        img = np.ascontiguousarray(img, dtype=np.uint8)
        if len(img.shape) == 3 and img.shape[2] == 4:
            img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)

        img = cv2.resize(img, (0, 0), None, 0.5, 0.5)
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        rgb = np.ascontiguousarray(rgb, dtype=np.uint8)

        locs = face_recognition.face_locations(rgb, model='hog')
        if not locs:
            print(f"✗ No face detected in {fname}, skipping.")
            continue

        try:
            encs = face_recognition.face_encodings(rgb, known_face_locations=locs)
            if encs:
                enc_list.append(encs[0])
                valid_names.append(os.path.splitext(fname)[0])
                print(f"✓ Encoded: {fname}")
            else:
                print(f"✗ Encoding failed: {fname}")
        except Exception as e:
            print(f"✗ Error encoding {fname}: {e}")

    encode_list_known = enc_list
    person_names = valid_names
    print(f"Total encoded: {len(valid_names)} → {valid_names}")
    return len(valid_names)

# Helper: mark attendance 
def mark_attendance(name):
    now = datetime.now()
    date_str = now.strftime("%d/%m/%Y")
    time_str = now.strftime("%H:%M:%S")

    existing = set()
    if os.path.exists(ATTENDANCE_FILE):
        with open(ATTENDANCE_FILE, "r") as f:
            for row in csv.DictReader(f):
                if row.get("Date") == date_str:
                    existing.add(row.get("Name", "").upper())

    if name.upper() not in existing:
        file_exists = os.path.exists(ATTENDANCE_FILE)
        with open(ATTENDANCE_FILE, "a", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["Name", "Time", "Date"])
            if not file_exists:
                writer.writeheader()
            writer.writerow({"Name": name.upper(), "Time": time_str, "Date": date_str})
        return True
    return False

# WebRTC: process frame sent from browser 
@app.route("/process_frame", methods=["POST"])
def process_frame():
    data = request.json.get("frame", "")
    if not data:
        return jsonify({"faces": []})

    try:
        header, encoded = data.split(",", 1)
        img_bytes = base64.b64decode(encoded)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"faces": []})

        frame = np.ascontiguousarray(frame, dtype=np.uint8)
        h, w = frame.shape[:2]

        net = app.config.get("dnn_net")
        faces_data = []

        if net is not None:
            blob = cv2.dnn.blobFromImage(frame, 1.0, (128, 128),
                                         [104, 117, 123], False, False)
            net.setInput(blob)
            detections = net.forward()

            for i in range(detections.shape[2]):
                confidence = detections[0, 0, i, 2]
                if confidence < 0.7:
                    continue

                x1 = max(0, int(detections[0, 0, i, 3] * w))
                y1 = max(0, int(detections[0, 0, i, 4] * h))
                x2 = min(w, int(detections[0, 0, i, 5] * w))
                y2 = min(h, int(detections[0, 0, i, 6] * h))

                name = "UNKNOWN"
                if encode_list_known and (x2 - x1) > 20 and (y2 - y1) > 20:
                    try:
                        small = cv2.resize(frame, (0, 0), None, 0.5, 0.5)
                        rgb = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
                        rgb = np.ascontiguousarray(rgb, dtype=np.uint8)
                        face_loc = [(y1 // 2, x2 // 2, y2 // 2, x1 // 2)]
                        encs = face_recognition.face_encodings(rgb, known_face_locations=face_loc)
                        if encs:
                            distances = face_recognition.face_distance(encode_list_known, encs[0])
                            idx = np.argmin(distances)
                            if distances[idx] < 0.6:
                                name = person_names[idx].upper()
                                mark_attendance(name)
                    except Exception:
                        pass

                faces_data.append({
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "name": name,
                    "confidence": round(float(confidence), 2)
                })

        return jsonify({"faces": faces_data})

    except Exception as e:
        print(f"Frame processing error: {e}")
        return jsonify({"faces": []})

# Routes
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/attendance")
def get_attendance():
    records = []
    if os.path.exists(ATTENDANCE_FILE):
        with open(ATTENDANCE_FILE, "r") as f:
            records = list(csv.DictReader(f))
    return jsonify(records[::-1])

@app.route("/delete_attendance", methods=["POST"])
def delete_attendance():
    body = request.json
    name = body.get("name", "").strip().upper()
    time_val = body.get("time", "").strip()
    date_val = body.get("date", "").strip()

    if not name or not time_val or not date_val:
        return jsonify({"error": "name, time and date are required"}), 400

    if not os.path.exists(ATTENDANCE_FILE):
        return jsonify({"error": "No attendance file found"}), 404

    kept = []
    deleted = False

    with open(ATTENDANCE_FILE, "r", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or ["Name", "Time", "Date"]
        for row in reader:
            if (row.get("Name", "").upper() == name
                    and row.get("Time", "").strip() == time_val
                    and row.get("Date", "").strip() == date_val
                    and not deleted):
                deleted = True
            else:
                kept.append(row)

    if not deleted:
        return jsonify({"error": "Record not found"}), 404

    with open(ATTENDANCE_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    return jsonify({"message": f"Record for {name} on {date_val} deleted."})

@app.route("/clear_attendance", methods=["POST"])
def clear_attendance():
    if not os.path.exists(ATTENDANCE_FILE):
        return jsonify({"error": "No attendance file found"}), 404

    with open(ATTENDANCE_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Name", "Time", "Date"])
        writer.writeheader()

    return jsonify({"message": "All attendance records cleared."})

@app.route("/persons")
def get_persons():
    persons = []
    for fname in os.listdir(DATASET_PATH):
        if fname.lower().endswith(('.jpg', '.jpeg', '.png')):
            persons.append(os.path.splitext(fname)[0])
    return jsonify(sorted(persons))

@app.route("/add_person", methods=["POST"])
def add_person():
    name = request.form.get("name", "").strip()
    file = request.files.get("image")
    if not name or not file:
        return jsonify({"error": "Name and image required"}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ('.jpg', '.jpeg', '.png'):
        return jsonify({"error": "Only JPG/PNG allowed"}), 400

    save_path = os.path.join(DATASET_PATH, f"{name}{ext}")
    file.save(save_path)
    count = load_encodings()
    return jsonify({"message": f"{name} added. {count} person(s) encoded."})

@app.route("/remove_person", methods=["POST"])
def remove_person():
    name = request.json.get("name", "")
    removed = False
    for fname in os.listdir(DATASET_PATH):
        if os.path.splitext(fname)[0].lower() == name.lower():
            os.remove(os.path.join(DATASET_PATH, fname))
            removed = True
            break
    if removed:
        load_encodings()
        return jsonify({"message": f"{name} removed."})
    return jsonify({"error": "Person not found"}), 404

@app.route("/export_csv")
def export_csv():
    if not os.path.exists(ATTENDANCE_FILE):
        return jsonify({"error": "No attendance data"}), 404
    return send_file(ATTENDANCE_FILE, as_attachment=True,
                     download_name=f"attendance_{datetime.now().strftime('%Y%m%d')}.csv")

@app.route("/dataset_img/<name>")
def dataset_img(name):
    for ext in ('.jpg', '.jpeg', '.png'):
        p = os.path.join(DATASET_PATH, f"{name}{ext}")
        if os.path.exists(p):
            return send_file(p)
    return "", 404

# Boot 
if __name__ == "__main__":
    print("Loading DNN face detector...")
    net = cv2.dnn.readNetFromTensorflow(
        'opencv_face_detector_uint8.pb',
        'opencv_face_detector.pbtxt'
    )
    app.config["dnn_net"] = net
    print("Loading face encodings from dataset...")
    count = load_encodings()
    print(f"Ready! {count} person(s) loaded.")
    app.run(debug=False, host="0.0.0.0", port=5000)
# FaceRecognitionWeb 🎯

A real-time Face Recognition Attendance System built with Flask, OpenCV, and face_recognition.

## Features
- 📷 Live webcam face recognition
- ✅ Automatic attendance marking
- 📋 Attendance log with search
- 👤 Add / Remove persons from dataset
- 📥 Export attendance as CSV

## Setup

### 1. Clone the repository
```
git clone https://github.com/sanjibruj18/FaceRecognitionWeb.git
cd FaceRecognitionWeb
```

### 2. Create virtual environment
```
python -m venv venv
venv\Scripts\activate
```

### 3. Install dependencies
```
pip install flask opencv-python numpy==1.26.4 Pillow
pip install dlib-19.24.1-cp311-cp311-win_amd64.whl
pip install face-recognition
```

### 4. Run
```
python app.py
```

### 5. Open browser
```
http://localhost:5000
```

## Tech Stack
- Python 3.11
- Flask
- OpenCV DNN
- face_recognition + dlib
- HTML / CSS / JavaScript
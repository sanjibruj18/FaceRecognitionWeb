// Mobile nav toggle 
function toggleNav() {
  const nav = document.querySelector('nav');
  const overlay = document.getElementById('overlay');
  nav.classList.toggle('open');
  overlay.classList.toggle('show');
}

// Section navigation 
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  document.querySelector(`nav a[data-section="${id}"]`).classList.add('active');
  if (id === 'attendance') loadAttendance();
  if (id === 'persons') loadPersons();
  document.querySelector('nav').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

// Toast 
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3200);
}

// WebRTC Camera 
let stream = null;
let recognitionInterval = null;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 360, facingMode: 'user' },
      audio: false
    });

    const video = document.getElementById('cam-video');
    video.srcObject = stream;
    video.style.display = 'block';
    document.getElementById('cam-placeholder').style.display = 'none';
    document.getElementById('scan-line').style.display = 'block';
    document.getElementById('btn-start').style.display = 'none';
    document.getElementById('btn-stop').style.display = 'inline-flex';
    document.getElementById('live-badge').classList.add('on');

    recognitionInterval = setInterval(sendFrame, 300);

  } catch (err) {
    toast('Camera access denied or not available.', 'error');
    console.error('Camera error:', err);
  }
}

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  if (recognitionInterval) {
    clearInterval(recognitionInterval);
    recognitionInterval = null;
  }

  const video = document.getElementById('cam-video');
  video.srcObject = null;
  video.style.display = 'none';

  const overlay = document.getElementById('cam-overlay');
  const oc = overlay.getContext('2d');
  oc.clearRect(0, 0, overlay.width, overlay.height);

  document.getElementById('cam-placeholder').style.display = 'flex';
  document.getElementById('scan-line').style.display = 'none';
  document.getElementById('btn-start').style.display = 'inline-flex';
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('live-badge').classList.remove('on');
}

//  Send frame to server for recognition
let processing = false;

async function sendFrame() {
  if (processing) return;
  const video = document.getElementById('cam-video');
  if (!video.srcObject || video.readyState < 2) return;

  processing = true;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.drawImage(video, 0, 0);
  const frameData = canvas.toDataURL('image/jpeg', 0.7);

  try {
    const res = await fetch('/process_frame', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ frame: frameData })
    });
    const data = await res.json();
    drawOverlay(data.faces, video.videoWidth, video.videoHeight);
  } catch (e) {
    console.error('Frame error:', e);
  }
  processing = false;
}

// Draw face boxes on canvas overlay 
function drawOverlay(faces, vw, vh) {
  const overlay = document.getElementById('cam-overlay');
  overlay.width = vw;
  overlay.height = vh;
  const oc = overlay.getContext('2d');
  oc.clearRect(0, 0, vw, vh);

  faces.forEach(f => {
    const color = f.name !== 'UNKNOWN' ? '#00e5a0' : '#0044ff';
    const bw = f.x2 - f.x1;

    oc.strokeStyle = color;
    oc.lineWidth = 2;
    oc.strokeRect(f.x1, f.y1, bw, f.y2 - f.y1);

    oc.fillStyle = color;
    oc.fillRect(f.x1, f.y2 - 28, bw, 28);

    oc.fillStyle = f.name !== 'UNKNOWN' ? '#000' : '#fff';
    oc.font = 'bold 13px monospace';
    oc.fillText(f.name, f.x1 + 6, f.y2 - 10);
  });

  if (faces.some(f => f.name !== 'UNKNOWN')) {
    loadAttendance();
  }
}

//  Attendance 
let allRecords = [];

async function loadAttendance() {
  const res = await fetch('/attendance');
  allRecords = await res.json();
  renderTable(allRecords);
  updateStats(allRecords);
}

function updateStats(records) {
  const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '/');
  const todayRecs = records.filter(r => r.Date === today);
  const unique = new Set(records.map(r => r.Name)).size;
  document.getElementById('stat-total').textContent = records.length;
  document.getElementById('stat-today').textContent = todayRecs.length;
  document.getElementById('stat-persons').textContent = unique;
}

function renderTable(records) {
  const tbody = document.getElementById('att-body');
  if (!records.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No attendance records yet.</td></tr>';
    return;
  }
  tbody.innerHTML = records.map((r, i) => `
    <tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td><span class="badge-name">${r.Name}</span></td>
      <td>${r.Time}</td>
      <td>${r.Date}</td>
      <td>
        <button class="del-att-btn" title="Delete record"
          onclick="deleteAttendanceRecord('${r.Name}', '${r.Time}', '${r.Date}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </td>
    </tr>
  `).join('');
}

function filterTable() {
  const q = document.getElementById('att-search').value.toLowerCase();
  const filtered = allRecords.filter(r =>
    r.Name.toLowerCase().includes(q) || r.Date.includes(q)
  );
  renderTable(filtered);
}

function exportCSV() {
  window.location.href = '/export_csv';
}

//  Delete single attendance record 
async function deleteAttendanceRecord(name, time, date) {
  if (!confirm(`Delete attendance record for ${name} at ${time} on ${date}?`)) return;

  const res = await fetch('/delete_attendance', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, time, date })
  });
  const data = await res.json();
  toast(data.message || data.error, res.ok ? 'success' : 'error');
  if (res.ok) loadAttendance();
}

// Clear all attendance records 
async function clearAllAttendance() {
  if (!confirm('Are you sure you want to delete ALL attendance records? This cannot be undone.')) return;

  const res = await fetch('/clear_attendance', { method: 'POST' });
  const data = await res.json();
  toast(data.message || data.error, res.ok ? 'success' : 'error');
  if (res.ok) loadAttendance();
}

// Persons 
async function loadPersons() {
  const res = await fetch('/persons');
  const names = await res.json();
  const grid = document.getElementById('person-grid');
  if (!names.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No persons enrolled yet.</div>';
    return;
  }
  grid.innerHTML = names.map(n => `
    <div class="person-card">
      <img src="/dataset_img/${encodeURIComponent(n)}" onerror="this.src=''" alt="${n}" style="background:#1a1d22;"/>
      <div class="person-card-footer">
        <span>${n}</span>
        <button class="del-btn" onclick="removePerson('${n}')" title="Remove">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
            <path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

async function removePerson(name) {
  if (!confirm(`Remove ${name} from the dataset?`)) return;
  const res = await fetch('/remove_person', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  const data = await res.json();
  toast(data.message || data.error, res.ok ? 'success' : 'error');
  if (res.ok) loadPersons();
}

// Add Person 
async function addPerson() {
  const name = document.getElementById('inp-name').value.trim();
  const file = document.getElementById('inp-file').files[0];
  if (!name || !file) { toast('Name and image are required.', 'error'); return; }

  const fd = new FormData();
  fd.append('name', name);
  fd.append('image', file);

  toast('Uploading and encoding…');
  const res = await fetch('/add_person', { method: 'POST', body: fd });
  const data = await res.json();
  toast(data.message || data.error, res.ok ? 'success' : 'error');
  if (res.ok) {
    document.getElementById('inp-name').value = '';
    document.getElementById('inp-file').value = '';
  }
}

// Boot 
loadAttendance();
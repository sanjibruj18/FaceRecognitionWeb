// Section navigation 
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('active');
  document.querySelector(`nav a[data-section="${id}"]`).classList.add('active');

  if (id === 'attendance') loadAttendance();
  if (id === 'persons') loadPersons();
}

// Toast 
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `show ${type}`;
  setTimeout(() => { t.className = ''; }, 3200);
}

// Camera 
function startCamera() {
  const feed = document.getElementById('cam-feed');
  feed.src = '/video_feed?' + Date.now();
  feed.style.display = 'block';
  document.getElementById('cam-placeholder').style.display = 'none';
  document.getElementById('scan-line').style.display = 'block';
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-stop').style.display = 'inline-flex';
  document.getElementById('live-badge').classList.add('on');
}

function stopCamera() {
  fetch('/stop_camera', { method: 'POST' });
  const feed = document.getElementById('cam-feed');
  feed.src = '';
  feed.style.display = 'none';
  document.getElementById('cam-placeholder').style.display = 'flex';
  document.getElementById('scan-line').style.display = 'none';
  document.getElementById('btn-start').style.display = 'inline-flex';
  document.getElementById('btn-stop').style.display = 'none';
  document.getElementById('live-badge').classList.remove('on');
}

// Attendance 
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
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No attendance records yet.</td></tr>';
    return;
  }
  tbody.innerHTML = records.map((r, i) => `
    <tr>
      <td style="color:var(--muted)">${i + 1}</td>
      <td><span class="badge-name">${r.Name}</span></td>
      <td>${r.Time}</td>
      <td>${r.Date}</td>
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
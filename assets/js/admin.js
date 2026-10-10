const firebaseConfig = {
  apiKey: 'AIzaSyCaCT-CvcjUv_MeFd59TuBUyqukFHZ6wDE',
  authDomain: 'website-keuangan-1c179.firebaseapp.com',
  projectId: 'website-keuangan-1c179',
  storageBucket: 'website-keuangan-1c179.firebasestorage.app',
  messagingSenderId: '1022456802942',
  appId: '1:1022456802942:web:8d5cbd9bca32a07675f22f',
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const users = [];
let cursor = null;
let busy = false;
const byId = id => document.getElementById(id);

function render() {
  const needle = byId('search').value.toLocaleLowerCase('id-ID');
  const rows = byId('rows');
  rows.replaceChildren();
  for (const user of users.filter(item =>
    [item.name, item.email, item.profileId].some(value => String(value || '').toLocaleLowerCase('id-ID').includes(needle))
  )) {
    const tr = document.createElement('tr');
    const identity = document.createElement('td');
    const name = document.createElement('strong');
    name.textContent = user.name || 'Tanpa nama';
    const email = document.createElement('small');
    email.textContent = user.email || 'Belum ada email Firebase';
    identity.append(name, email);
    const profile = document.createElement('td');
    profile.textContent = user.profileId || '—';
    const status = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = 'pill' + (user.status === 'Perlu migrasi' ? ' pending' : '');
    pill.textContent = user.status;
    status.append(pill);
    const lastSignIn = document.createElement('td');
    lastSignIn.textContent = user.lastSignInAt
      ? new Date(user.lastSignInAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Belum pernah';
    tr.append(identity, profile, status, lastSignIn);
    rows.append(tr);
  }
  byId('count').textContent = `${users.length} pengguna`;
  byId('more').hidden = !cursor;
}

async function loadUsers(reset = false) {
  if (busy || !auth.currentUser) return;
  busy = true;
  byId('refresh').disabled = true;
  byId('more').disabled = true;
  if (reset) { users.length = 0; cursor = null; }
  byId('status').textContent = 'Memuat daftar pengguna…';
  try {
    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/api/admin-users' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), {
      headers: { Authorization: 'Bearer ' + token },
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Gagal memuat daftar pengguna');
    users.push(...data.users);
    cursor = data.nextCursor;
    byId('loginPrompt').hidden = true;
    byId('userArea').hidden = false;
    byId('status').textContent = 'Data hanya dapat dilihat oleh admin yang terverifikasi.';
    render();
  } catch (error) {
    byId('status').textContent = error.message;
    byId('loginPrompt').hidden = false;
    byId('userArea').hidden = true;
  } finally {
    busy = false;
    byId('refresh').disabled = false;
    byId('more').disabled = false;
  }
}

byId('search').addEventListener('input', render);
byId('refresh').addEventListener('click', () => loadUsers(true));
byId('more').addEventListener('click', () => loadUsers(false));
byId('loginGoogle').addEventListener('click', async () => {
  try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
  catch (error) { byId('status').textContent = error.message; }
});
auth.onAuthStateChanged(user => {
  if (user) loadUsers(true);
  else { byId('status').textContent = 'Masuk dengan Google untuk memeriksa akses admin.'; byId('loginPrompt').hidden = false; byId('userArea').hidden = true; }
});

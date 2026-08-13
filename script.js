// =========================
// SUPABASE
// =========================


const scanButton = document.getElementById('scanButton');
const bookGrid = document.getElementById('bookGrid');
const navButtons = document.querySelectorAll('.nav-button');
const searchInput = document.getElementById('searchInput');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const toast = document.getElementById('toast');

const accountModal = document.getElementById('accountModal');
const accountForm = document.getElementById('accountForm');
const accountModalTitle = document.getElementById('accountModalTitle');
const accountModalSubtitle = document.getElementById('accountModalSubtitle');
const accountSubmit = document.getElementById('accountSubmit');
const switchAccountMode = document.getElementById('switchAccountMode');
const forgotPasswordButton = document.getElementById('forgotPasswordButton');
const accountMessage = document.getElementById('accountMessage');
const accountEmail = document.getElementById('accountEmail');
const accountPassword = document.getElementById('accountPassword');
const accountLoggedOut = document.getElementById('accountLoggedOut');
const accountLoggedIn = document.getElementById('accountLoggedIn');
const userEmail = document.getElementById('userEmail');
const accountBanner = document.getElementById('accountBanner');

let scanner = null;
let currentStatus = 'read';
let books = JSON.parse(localStorage.getItem('myBooks') || '[]').map(normalizeBook);
let currentUser = null;
let accountMode = 'login';
let supabaseClient = null;
let cloudReady = false;
let saving = false;

const config = window.BOOK_LIBRARY_CONFIG || {};
const hasSupabaseConfig = Boolean(
  window.supabase &&
  config.supabaseUrl &&
  config.supabaseKey &&
  !config.supabaseUrl.includes('YOUR_') &&
  !config.supabaseKey.includes('YOUR_')
);

if (hasSupabaseConfig) {
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  cloudReady = true;
} else {
  console.warn('Supabase is not configured. The library will use local browser storage until an account backend is configured.');
}

init();

async function init() {
  bindNavigation();
  bindAccountUI();
  bindScanner();
  updatePageTitle();
  renderBooks();

  if (!cloudReady) {
    showAccountBanner('Log in to save your library online. Add your Supabase settings to enable accounts.');
    return;
  }

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) console.error(error);
  await handleSession(data?.session || null);

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    await handleSession(session);
  });
}

function bindNavigation() {
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      currentStatus = button.dataset.status;
      updatePageTitle();
      renderBooks();
    });
  });
}

function updatePageTitle() {
  const titles = {
    read: ['Already Read', 'Your finished books'],
    reading: ['Currently Reading', "Books you're reading right now"],
    want: ['Want to Read', 'Books waiting on your reading list']
  };
  [pageTitle.textContent, pageSubtitle.textContent] = titles[currentStatus];
}

function bindAccountUI() {
  document.getElementById('loginButton').addEventListener('click', () => openAccountModal('login'));
  document.getElementById('signupButton').addEventListener('click', () => openAccountModal('signup'));
  document.getElementById('bannerLoginButton').addEventListener('click', () => openAccountModal('login'));
  document.getElementById('logoutButton').addEventListener('click', logout);
  document.getElementById('closeAccountModal').addEventListener('click', closeAccountModal);
  switchAccountMode.addEventListener('click', () => openAccountModal(accountMode === 'login' ? 'signup' : 'login'));
  forgotPasswordButton.addEventListener('click', sendPasswordReset);
  accountForm.addEventListener('submit', submitAccountForm);
  accountModal.addEventListener('click', event => {
    if (event.target === accountModal) closeAccountModal();
  });
}

function bindScanner() {
  scanButton.addEventListener('click', startScanner);
}

function openAccountModal(mode = 'login') {
  if (!cloudReady) {
    setAccountMessage('Accounts are not connected yet. Add your Supabase URL and publishable key to config.js first.', true);
    return;
  }
  accountMode = mode;
  accountModalTitle.textContent = mode === 'login' ? 'Log in' : 'Create your account';
  accountModalSubtitle.textContent = mode === 'login'
    ? 'Sign in to access your online library.'
    : 'Create an account and keep your library synced everywhere.';
  accountSubmit.textContent = mode === 'login' ? 'Log in' : 'Create account';
  switchAccountMode.textContent = mode === 'login' ? 'Create an account instead' : 'I already have an account';
  forgotPasswordButton.classList.toggle('hidden', mode !== 'login');
  setAccountMessage('');
  accountModal.classList.remove('hidden');
  setTimeout(() => accountEmail.focus(), 0);
}

function closeAccountModal() {
  accountModal.classList.add('hidden');
  accountForm.reset();
  setAccountMessage('');
}

async function submitAccountForm(event) {
  event.preventDefault();
  if (!supabaseClient) return;

  const email = accountEmail.value.trim();
  const password = accountPassword.value;
  setFormBusy(true);
  setAccountMessage('');

  try {
    if (accountMode === 'signup') {
      const redirectTo = window.location.origin;
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;

      if (data.session) {
        closeAccountModal();
        showToast('Account created. Your library is now synced.');
      } else {
        setAccountMessage('Account created. Check your email to confirm your address, then log in.', false);
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      closeAccountModal();
      showToast('Welcome back!');
    }
  } catch (error) {
    console.error(error);
    setAccountMessage(cleanAuthError(error.message), true);
  } finally {
    setFormBusy(false);
  }
}

async function sendPasswordReset() {
  if (!supabaseClient) return;
  const email = accountEmail.value.trim();
  if (!email) {
    setAccountMessage('Enter your email address first.', true);
    accountEmail.focus();
    return;
  }

  try {
    const redirectTo = window.location.origin;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
    setAccountMessage('Password reset email sent. Check your inbox.', false);
  } catch (error) {
    setAccountMessage(cleanAuthError(error.message), true);
  }
}

async function logout() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showToast(cleanAuthError(error.message), true);
    return;
  }
  currentUser = null;
  books = loadLocalBooks();
  updateAccountUI();
  renderBooks();
  showToast('Logged out.');
}

async function handleSession(session) {
  currentUser = session?.user || null;
  updateAccountUI();

  if (!currentUser) {
    books = loadLocalBooks();
    renderBooks();
    return;
  }

  try {
    await loadCloudBooks();
    await importLocalBooksIfNeeded();
    await loadCloudBooks();
    renderBooks();
  } catch (error) {
    console.error(error);
    showToast('Could not load your online library. Your local books are still safe on this device.', true);
  }
}

function updateAccountUI() {
  const loggedIn = Boolean(currentUser);
  accountLoggedOut.classList.toggle('hidden', loggedIn);
  accountLoggedIn.classList.toggle('hidden', !loggedIn);
  accountBanner.classList.toggle('hidden', loggedIn || !cloudReady);
  if (loggedIn) userEmail.textContent = currentUser.email || 'Signed in';
}

function showAccountBanner(message) {
  accountBanner.classList.remove('hidden');
  accountBanner.querySelector('small').textContent = message.replace('Log in to save your library online. ', '');
}

function loadLocalBooks() {
  return JSON.parse(localStorage.getItem('myBooks') || '[]').map(normalizeBook);
}

function saveLocalBooks() {
  localStorage.setItem('myBooks', JSON.stringify(books));
}

function normalizeBook(book) {
  return {
    id: book.id || null,
    isbn: String(book.isbn || '').replace(/[\s-]/g, ''),
    title: book.title || 'Unknown title',
    authors: Array.isArray(book.authors) ? book.authors : ['Unknown author'],
    description: book.description || '',
    cover: book.cover || '',
    status: ['read', 'reading', 'want'].includes(book.status) ? book.status : 'read',
    addedAt: book.addedAt || new Date().toISOString()
  };
}

async function loadCloudBooks() {
  if (!currentUser || !supabaseClient) return;
  const { data, error } = await supabaseClient
    .from('books')
    .select('id,isbn,title,authors,description,cover,status,added_at')
    .eq('user_id', currentUser.id)
    .order('added_at', { ascending: true });
  if (error) throw error;
  books = (data || []).map(row => normalizeBook({
    id: row.id,
    isbn: row.isbn,
    title: row.title,
    authors: row.authors,
    description: row.description,
    cover: row.cover,
    status: row.status,
    addedAt: row.added_at
  }));
  saveLocalBooks();
}

async function importLocalBooksIfNeeded() {
  if (!currentUser || !supabaseClient) return;
  const localBooks = loadLocalBooks();
  if (!localBooks.length || books.length) return;

  const shouldImport = window.confirm(`I found ${localBooks.length} book${localBooks.length === 1 ? '' : 's'} saved on this device. Add them to your online library?`);
  if (!shouldImport) return;

  for (const book of localBooks) {
    await upsertCloudBook(book);
  }
  showToast('Your existing books have been copied to your online library.');
}

async function upsertCloudBook(book) {
  if (!currentUser || !supabaseClient) return;
  const payload = {
    user_id: currentUser.id,
    isbn: book.isbn,
    title: book.title,
    authors: book.authors,
    description: book.description,
    cover: book.cover,
    status: book.status,
    added_at: book.addedAt || new Date().toISOString()
  };
  const { data, error } = await supabaseClient
    .from('books')
    .upsert(payload, { onConflict: 'user_id,isbn' })
    .select('id,isbn,title,authors,description,cover,status,added_at')
    .single();
  if (error) throw error;
  return normalizeBook({
    id: data.id,
    isbn: data.isbn,
    title: data.title,
    authors: data.authors,
    description: data.description,
    cover: data.cover,
    status: data.status,
    addedAt: data.added_at
  });
}

async function saveBook(book) {
  books = books.map(existing => existing.isbn === book.isbn ? book : existing);
  if (!books.some(existing => existing.isbn === book.isbn)) books.push(book);
  saveLocalBooks();

  if (currentUser && supabaseClient) {
    saving = true;
    try {
      const saved = await upsertCloudBook(book);
      books = books.map(existing => existing.isbn === saved.isbn ? saved : existing);
    } finally {
      saving = false;
    }
  }
}

async function removeBook(book) {
  if (!window.confirm(`Remove “${book.title}” from your library?`)) return;

  books = books.filter(existing => existing.isbn !== book.isbn);
  saveLocalBooks();
  renderBooks();

  if (currentUser && supabaseClient) {
    const { error } = await supabaseClient
      .from('books')
      .delete()
      .eq('user_id', currentUser.id)
      .eq('isbn', book.isbn);
    if (error) {
      showToast('The book was removed locally, but the online copy could not be removed.', true);
      console.error(error);
    }
  }
}

async function changeBookStatus(book, status) {
  book.status = status;
  books = books.map(existing => existing.isbn === book.isbn ? book : existing);
  saveLocalBooks();
  renderBooks();

  if (currentUser && supabaseClient) {
    const { error } = await supabaseClient
      .from('books')
      .update({ status })
      .eq('user_id', currentUser.id)
      .eq('isbn', book.isbn);
    if (error) {
      showToast('The shelf changed on this device, but online saving failed.', true);
      console.error(error);
    }
  }
}

function startScanner() {
  if (scanner) return;

  const scannerWindow = document.createElement('div');
  scannerWindow.id = 'scannerWindow';
  scannerWindow.innerHTML = `
    <div class="scanner-box">
      <button class="modal-close scanner-close" id="closeScanner" aria-label="Close scanner">×</button>
      <h2>📷 Scan a Book</h2>
      <p>Point your camera at the ISBN barcode on the back of the book.</p>
      <div id="reader"></div>
      <button class="close-scanner-button" id="closeScannerBottom">Close Scanner</button>
    </div>`;
  document.body.appendChild(scannerWindow);

  document.getElementById('closeScanner').addEventListener('click', stopScanner);
  document.getElementById('closeScannerBottom').addEventListener('click', stopScanner);

  scanner = new Html5Qrcode('reader');
  scanner.start(
    { facingMode: 'environment' },
    {
      fps: 10,
      qrbox: { width: 280, height: 150 },
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A
      ]
    },
    decodedText => {
      stopScanner();
      findBook(decodedText);
    },
    () => {}
  ).catch(error => {
    console.error(error);
    showToast('Could not start the camera. Check camera permission and try again.', true);
    stopScanner();
  });
}

function stopScanner() {
  const activeScanner = scanner;
  scanner = null;
  document.getElementById('scannerWindow')?.remove();
  if (activeScanner) {
    activeScanner.stop().then(() => activeScanner.clear()).catch(() => {});
  }
}

async function findBook(isbn) {
  isbn = String(isbn).replace(/[\s-]/g, '');
  showLoading();
  try {
    let book = null;
    const googleQueries = [`isbn:${isbn}`, isbn];
    for (const query of googleQueries) {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`);
      if (!response.ok) continue;
      const data = await response.json();
      if (data.items?.length) {
        const exact = data.items.find(item => (item.volumeInfo.industryIdentifiers || []).some(id => id.identifier.replace(/[\s-]/g, '') === isbn));
        book = (exact || data.items[0]).volumeInfo;
        break;
      }
    }

    if (!book) {
      const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`);
      if (response.ok) {
        const data = await response.json();
        const result = data[`ISBN:${isbn}`];
        if (result) {
          book = {
            title: result.title || 'Unknown title',
            authors: result.authors?.map(author => author.name) || ['Unknown author'],
            description: typeof result.notes === 'string' ? result.notes : '',
            imageLinks: result.cover ? { thumbnail: result.cover.medium || result.cover.large } : undefined
          };
        }
      }
    }

    hideLoading();
    if (!book) return showNotFound(isbn);
    showBookPreview(book, isbn);
  } catch (error) {
    console.error(error);
    hideLoading();
    showNotFound(isbn);
  }
}

function showBookPreview(book, isbn) {
  const existing = document.getElementById('bookPreview');
  existing?.remove();

  const title = book.title || 'Unknown title';
  const authors = book.authors?.join(', ') || 'Unknown author';
  const description = book.description || 'No description available.';
  const cover = book.imageLinks?.thumbnail?.replace('http://', 'https://') || 'https://placehold.co/180x270/e8e0d4/51453b?text=No+Cover';
  const existingBook = books.find(item => item.isbn === isbn);

  const preview = document.createElement('div');
  preview.id = 'bookPreview';
  preview.innerHTML = `
    <div class="book-preview-box">
      <button class="modal-close" id="closePreview" aria-label="Close">×</button>
      <div class="preview-content">
        <img class="preview-cover" src="${escapeAttribute(cover)}" alt="${escapeAttribute(title)}">
        <div class="preview-details">
          <p class="eyebrow">ISBN ${escapeHTML(isbn)}</p>
          <h2>${escapeHTML(title)}</h2>
          <h3>${escapeHTML(authors)}</h3>
          <p class="book-description">${escapeHTML(description)}</p>
          <p class="status-question">${existingBook ? 'Move this book to:' : 'Add this book to:'}</p>
          <div class="status-buttons">
            ${statusButton('read', '📖 Already Read')}
            ${statusButton('reading', '📕 Currently Reading')}
            ${statusButton('want', '📚 Want to Read')}
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(preview);

  document.getElementById('closePreview').addEventListener('click', () => preview.remove());
  preview.querySelectorAll('.status-button').forEach(button => {
    button.addEventListener('click', async () => {
      const newBook = normalizeBook({
        ...(existingBook || {}),
        isbn,
        title,
        authors: book.authors || ['Unknown author'],
        description,
        cover,
        status: button.dataset.status,
        addedAt: existingBook?.addedAt || new Date().toISOString()
      });
      try {
        await saveBook(newBook);
        preview.remove();
        renderBooks();
        showToast(currentUser ? 'Book saved to your online library. ☁️' : 'Book added to your library.');
      } catch (error) {
        console.error(error);
        showToast('The book was added on this device, but online saving failed.', true);
      }
    });
  });
}

function statusButton(status, label) {
  return `<button class="status-button ${currentStatus === status ? 'selected' : ''}" data-status="${status}">${label}</button>`;
}
function renderBooks() {
  const query = searchInput.value.trim().toLowerCase();

  const filtered = books.filter(book => {
    const matchesStatus = book.status === currentStatus;
    const haystack = `${book.title} ${book.authors.join(' ')}`.toLowerCase();

    return matchesStatus && (!query || haystack.includes(query));
  });

  updateCounts();

  if (!filtered.length) {
    bookGrid.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">📚</div>
        <h3>${query ? 'No books found' : 'This shelf is empty'}</h3>
        <p>${query ? 'Try another search.' : 'Scan a book to add it here.'}</p>
      </div>`;

    return;
  }

  // Number of books on each wooden shelf
  const booksPerShelf = 6;

  let shelvesHTML = '';

  for (let i = 0; i < filtered.length; i += booksPerShelf) {
    const shelfBooks = filtered.slice(i, i + booksPerShelf);

    shelvesHTML += `
      <div class="book-shelf-row">
        <div class="book-shelf-books">
          ${shelfBooks.map(book => {
            const cover =
              book.cover ||
              'https://placehold.co/135x210/e8e0d4/51453b?text=No+Cover';

            return `
              <article class="book" data-isbn="${escapeAttribute(book.isbn)}">

                <button
                  class="book-remove"
                  title="Remove book"
                  aria-label="Remove ${escapeAttribute(book.title)}"
                >×</button>

                <button
                  class="book-cover-button"
                  title="${escapeAttribute(book.title)}"
                >
                  <img
                    src="${escapeAttribute(cover)}"
                    alt="${escapeAttribute(book.title)}"
                  >
                </button>

                <div class="book-info">
                  <strong>${escapeHTML(book.title)}</strong>
                  <span>${escapeHTML(book.authors.join(', '))}</span>
                </div>

              </article>
            `;
          }).join('')}
        </div>

        <div class="wooden-shelf"></div>
      </div>
    `;
  }

  bookGrid.innerHTML = shelvesHTML;

  // Open book details
  bookGrid.querySelectorAll('.book-cover-button').forEach(button => {
    button.addEventListener('click', () => {
      const isbn = button.closest('.book').dataset.isbn;
      const book = books.find(item => item.isbn === isbn);

      if (book) {
        showSavedBook(book);
      }
    });
  });

  // Remove books
  bookGrid.querySelectorAll('.book-remove').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();

      const isbn = button.closest('.book').dataset.isbn;
      const book = books.find(item => item.isbn === isbn);

      if (book) {
        removeBook(book);
      }
    });
  });
}


function showSavedBook(book) {
  const preview = document.createElement('div');
  preview.id = 'bookPreview';
  const cover = book.cover || 'https://placehold.co/180x270/e8e0d4/51453b?text=No+Cover';
  preview.innerHTML = `
    <div class="book-preview-box">
      <button class="modal-close" id="closeSavedBook">×</button>
      <div class="preview-content">
        <img class="preview-cover" src="${escapeAttribute(cover)}" alt="${escapeAttribute(book.title)}">
        <div class="preview-details">
          <p class="eyebrow">ISBN ${escapeHTML(book.isbn)}</p>
          <h2>${escapeHTML(book.title)}</h2>
          <h3>${escapeHTML(book.authors.join(', '))}</h3>
          <p class="book-description">${escapeHTML(book.description || 'No description available.')}</p>
          <p class="status-question">Move to:</p>
          <div class="status-buttons">
            ${statusButton('read', '📖 Already Read')}
            ${statusButton('reading', '📕 Currently Reading')}
            ${statusButton('want', '📚 Want to Read')}
          </div>
          <button class="danger-button" id="deleteSavedBook">🗑️ Remove from library</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(preview);
  document.getElementById('closeSavedBook').addEventListener('click', () => preview.remove());
  document.getElementById('deleteSavedBook').addEventListener('click', async () => {
    preview.remove();
    await removeBook(book);
  });
  preview.querySelectorAll('.status-button').forEach(button => {
    button.addEventListener('click', async () => {
      await changeBookStatus(book, button.dataset.status);
      preview.remove();
      showToast('Book moved to its new shelf.');
    });
  });
}

function updateCounts() {
  document.getElementById('readCount').textContent = books.filter(book => book.status === 'read').length;
  document.getElementById('readingCount').textContent = books.filter(book => book.status === 'reading').length;
  document.getElementById('wantCount').textContent = books.filter(book => book.status === 'want').length;
}

searchInput.addEventListener('input', renderBooks);

function showLoading() {
  const loading = document.createElement('div');
  loading.id = 'loadingWindow';
  loading.innerHTML = `<div class="loading-box"><div class="loading-spinner"></div><h2>🔎 Finding your book…</h2><p>Checking the book databases.</p></div>`;
  document.body.appendChild(loading);
}

function hideLoading() {
  document.getElementById('loadingWindow')?.remove();
}

function showNotFound(isbn) {
  const message = document.createElement('div');
  message.id = 'bookNotFound';
  message.innerHTML = `
    <div class="not-found-box">
      <div class="not-found-icon">📚</div>
      <h2>Book not found</h2>
      <p>We scanned this ISBN:</p>
      <strong>${escapeHTML(isbn)}</strong>
      <p class="not-found-help">It wasn't found in the databases we checked.</p>
      <button id="closeNotFound">Close</button>
    </div>`;
  document.body.appendChild(message);
  document.getElementById('closeNotFound').addEventListener('click', () => message.remove());
}

function setFormBusy(busy) {
  accountSubmit.disabled = busy;
  accountSubmit.textContent = busy ? 'Please wait…' : (accountMode === 'login' ? 'Log in' : 'Create account');
}

function setAccountMessage(message, error = false) {
  accountMessage.textContent = message;
  accountMessage.classList.toggle('error', error);
  accountMessage.classList.toggle('success', Boolean(message) && !error);
}

function cleanAuthError(message = '') {
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/user already registered/i.test(message)) return 'An account with that email already exists. Try logging in.';
  if (/password should be at least/i.test(message)) return 'Your password needs to be at least 6 characters.';
  return message;
}

function showToast(message, error = false) {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function escapeHTML(text) {
  const div = document.createElement('div');
  div.textContent = text ?? '';
  return div.innerHTML;
}

function escapeAttribute(text) {
  return escapeHTML(text).replace(/"/g, '&quot;');
}
// =========================
// ACCOUNT SYSTEM
// =========================

const accountScreen =
    document.getElementById("accountScreen");

const loginForm =
    document.getElementById("loginForm");

const signupForm =
    document.getElementById("signupForm");


// Show signup
document
    .getElementById("showSignup")
    .addEventListener("click", () => {

        loginForm.style.display = "none";
        signupForm.style.display = "block";

    });


// Show login
document
    .getElementById("showLogin")
    .addEventListener("click", () => {

        signupForm.style.display = "none";
        loginForm.style.display = "block";

    });


// =========================
// CREATE ACCOUNT
// =========================

document
    .getElementById("signupButton")
    .addEventListener("click", async () => {

        const email =
            document.getElementById("signupEmail").value.trim();

        const password =
            document.getElementById("signupPassword").value;

        const confirmPassword =
            document.getElementById("signupPasswordConfirm").value;

        const message =
            document.getElementById("signupMessage");


        if (!email || !password) {

            message.textContent =
                "Please enter your email and password.";

            return;
        }


        if (password !== confirmPassword) {

            message.textContent =
                "The passwords don't match.";

            return;
        }


        if (password.length < 6) {

            message.textContent =
                "Your password must be at least 6 characters.";

            return;
        }


        message.textContent =
            "Creating your account...";


        const { data, error } =
            await supabaseClient.auth.signUp({
                email: email,
                password: password
            });


        if (error) {

            console.error(error);

            message.textContent =
                error.message;

            return;
        }


        if (data.session) {

            message.textContent =
                "Account created!";

            hideAccountScreen();

        } else {

            message.textContent =
                "Account created! Check your email to confirm your account.";
        }

    });


// =========================
// LOGIN
// =========================

document
    .getElementById("loginButton")
    .addEventListener("click", async () => {

        const email =
            document.getElementById("loginEmail").value.trim();

        const password =
            document.getElementById("loginPassword").value;

        const message =
            document.getElementById("loginMessage");


        if (!email || !password) {

            message.textContent =
                "Please enter your email and password.";

            return;
        }


        message.textContent =
            "Logging in...";


        const { data, error } =
            await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });


        if (error) {

            console.error(error);

            message.textContent =
                error.message;

            return;
        }


        message.textContent =
            "Logged in!";

        hideAccountScreen();

    });


// =========================
// CHECK LOGIN
// =========================

async function checkLogin() {

    const {
        data: { session }
    } = await supabaseClient.auth.getSession();


    if (session) {

        hideAccountScreen();

    } else {

        showAccountScreen();

    }
}


function hideAccountScreen() {

    if (accountScreen) {
        accountScreen.style.display = "none";
    }
}


function showAccountScreen() {

    if (accountScreen) {
        accountScreen.style.display = "flex";
    }
}


// Check account when website opens
checkLogin();
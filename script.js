const scanButton = document.getElementById("scanButton");
const bookGrid = document.getElementById("bookGrid");
const bookCount = document.getElementById("bookCount");
const navButtons = document.querySelectorAll(".nav-button");

let scanner = null;

let currentStatus = "read";

let books = JSON.parse(localStorage.getItem("myBooks")) || [];


// =========================
// STARTUP
// =========================

renderBooks();


// =========================
// NAVIGATION
// =========================

navButtons.forEach(button => {

    button.addEventListener("click", () => {

        // Remove active from all buttons
        navButtons.forEach(btn => {
            btn.classList.remove("active");
        });

        // Make clicked button active
        button.classList.add("active");

        // Get selected shelf
        currentStatus = button.dataset.status;

        updatePageTitle();

        renderBooks();
    });

});


// =========================
// PAGE TITLE
// =========================

function updatePageTitle() {

    const heading = document.querySelector("header h2");
    const subtitle = document.querySelector("header p");

    if (currentStatus === "read") {

        heading.textContent = "Already Read";
        subtitle.textContent = "Your finished books";

    } else if (currentStatus === "reading") {

        heading.textContent = "Currently Reading";
        subtitle.textContent = "Books you're reading right now";

    } else if (currentStatus === "want") {

        heading.textContent = "Want to Read";
        subtitle.textContent = "Books waiting on your reading list";
    }
}


// =========================
// SCANNER
// =========================

scanButton.addEventListener("click", startScanner);


function startScanner() {

    const scannerWindow = document.createElement("div");

    scannerWindow.id = "scannerWindow";

    scannerWindow.innerHTML = `
        <div class="scanner-box">

            <h2>📷 Scan a Book</h2>

            <p>
                Point your camera at the ISBN barcode
                on the back of the book.
            </p>

            <div id="reader"></div>

            <button id="closeScanner">
                Close Scanner
            </button>

        </div>
    `;

    document.body.appendChild(scannerWindow);

    scanner = new Html5Qrcode("reader");


    scanner.start(
        { facingMode: "environment" },

        {
            fps: 10,

            qrbox: {
                width: 280,
                height: 150
            },

            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A
            ]
        },

        decodedText => {

            console.log("Barcode detected:", decodedText);

            stopScanner();

            findBook(decodedText);
        },

        () => {
            // Ignore scanning errors
        }

    ).catch(error => {

        console.error(error);

        alert(
            "Could not start the camera. " +
            "Please check your camera permissions."
        );
    });


    document
        .getElementById("closeScanner")
        .addEventListener("click", stopScanner);
}


// =========================
// STOP SCANNER
// =========================

function stopScanner() {

    const scannerWindow =
        document.getElementById("scannerWindow");

    // Remove the scanner window immediately
    if (scannerWindow) {
        scannerWindow.remove();
    }

    // Stop the camera safely
    if (scanner) {

        scanner.stop()
            .then(() => {

                scanner.clear();
                scanner = null;

            })
            .catch(error => {

                console.log("Scanner stopped.");

                scanner = null;
            });
    }
}


function removeScannerWindow() {

    const window = document.getElementById("scannerWindow");

    if (window) {
        window.remove();
    }
}


// =========================
// FIND BOOK
// =========================


async function findBook(isbn) {

    // Clean the barcode
    isbn = isbn.replace(/[\s-]/g, "");

    console.log("Scanned ISBN:", isbn);

    showLoading();

    try {

        let book = null;

        // =====================================
        // TRY GOOGLE BOOKS - ISBN
        // =====================================

        let response = await fetch(
            `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`
        );

        if (response.ok) {

            const data = await response.json();

            if (data.items && data.items.length > 0) {
                book = data.items[0].volumeInfo;
            }
        }


        // =====================================
        // TRY GOOGLE BOOKS - EXACT NUMBER
        // =====================================

        if (!book) {

            response = await fetch(
                `https://www.googleapis.com/books/v1/volumes?q=${isbn}`
            );

            if (response.ok) {

                const data = await response.json();

                if (data.items && data.items.length > 0) {
                    book = data.items[0].volumeInfo;
                }
            }
        }


        // =====================================
        // TRY OPEN LIBRARY
        // =====================================

        if (!book) {

            response = await fetch(
                `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`
            );

            if (response.ok) {

                const data = await response.json();

                const result = data[`ISBN:${isbn}`];

                if (result) {

                    book = {
                        title: result.title || "Unknown title",

                        authors: result.authors
                            ? result.authors.map(author => author.name)
                            : ["Unknown author"],

                        description:
                            result.notes ||
                            "No description available.",

                        imageLinks: result.cover
                            ? {
                                thumbnail:
                                    result.cover.medium ||
                                    result.cover.large
                            }
                            : undefined
                    };
                }
            }
        }


        hideLoading();


        // =====================================
        // NOTHING FOUND
        // =====================================

        if (!book) {

            showNotFound(isbn);

            return;
        }


        // =====================================
        // BOOK FOUND
        // =====================================

        showBookPreview(book, isbn);


    } catch (error) {

        console.error("Book lookup error:", error);

        hideLoading();

        showNotFound(isbn);
    }
}
function showNotFound(isbn) {

    const message = document.createElement("div");

    message.id = "bookNotFound";

    message.innerHTML = `

        <div class="not-found-box">

            <div class="not-found-icon">
                📚
            </div>

            <h2>
                Book not found
            </h2>

            <p>
                We scanned this ISBN:
            </p>

            <strong>
                ${escapeHTML(isbn)}
            </strong>

            <p class="not-found-help">
                The book isn't in the databases we checked.
            </p>

            <button id="closeNotFound">
                Close
            </button>

        </div>
    `;

    document.body.appendChild(message);


    document
        .getElementById("closeNotFound")
        .addEventListener(
            "click",
            () => message.remove()
        );
}


// =========================
// LOADING
// =========================

function showLoading() {

    const loading = document.createElement("div");

    loading.id = "loadingWindow";

    loading.innerHTML = `
        <div class="loading-box">

            <div class="loading-spinner"></div>

            <h2>🔎 Finding your book...</h2>

            <p>
                Looking up the ISBN in the book database.
            </p>

        </div>
    `;

    document.body.appendChild(loading);
}


function hideLoading() {

    const loading = document.getElementById("loadingWindow");

    if (loading) {
        loading.remove();
    }
}


// =========================
// BOOK PREVIEW
// =========================

function showBookPreview(book, isbn) {

    const preview = document.createElement("div");

    preview.id = "bookPreview";

    const title = book.title || "Unknown title";

    const authors = book.authors
        ? book.authors.join(", ")
        : "Unknown author";

    const description = book.description
        ? book.description
        : "No description available.";

    const cover = book.imageLinks
        ? book.imageLinks.thumbnail.replace(
            "http://",
            "https://"
        )
        : "https://via.placeholder.com/180x270?text=No+Cover";


    preview.innerHTML = `

        <div class="book-preview-box">

            <button
                class="preview-close"
                id="closePreview"
            >
                ×
            </button>


            <div class="preview-content">

                <img
                    class="preview-cover"
                    src="${cover}"
                    alt="${escapeHTML(title)}"
                >


                <div class="preview-details">

                    <h2>
                        ${escapeHTML(title)}
                    </h2>

                    <h3>
                        ${escapeHTML(authors)}
                    </h3>


                    <p class="book-description">
                        ${escapeHTML(description)}
                    </p>


                    <p class="status-question">
                        Add this book to:
                    </p>


                    <div class="status-buttons">

                        <button
                            class="status-button"
                            data-status="read"
                        >
                            📖 Already Read
                        </button>

                        <button
                            class="status-button"
                            data-status="reading"
                        >
                            📕 Currently Reading
                        </button>

                        <button
                            class="status-button"
                            data-status="want"
                        >
                            📚 Want to Read
                        </button>

                    </div>

                </div>

            </div>

        </div>
    `;


    document.body.appendChild(preview);


    document
        .getElementById("closePreview")
        .addEventListener(
            "click",
            () => preview.remove()
        );


    const statusButtons =
        preview.querySelectorAll(".status-button");


    statusButtons.forEach(button => {

        button.addEventListener("click", () => {

            addBook(
                book,
                isbn,
                button.dataset.status
            );

        });

    });
}


// =========================
// ADD BOOK
// =========================

function addBook(book, isbn, status) {

    const existingBook = books.find(
        existing => existing.isbn === isbn
    );


    if (existingBook) {

        // Move existing book to new shelf
        existingBook.status = status;

        saveBooks();

        renderBooks();

        const preview =
            document.getElementById("bookPreview");

        if (preview) {
            preview.remove();
        }

        alert("The book has been moved to its new shelf! 📚");

        return;
    }


    const newBook = {

        isbn: isbn,

        title: book.title || "Unknown title",

        authors: book.authors || ["Unknown author"],

        description: book.description || "",

        cover: book.imageLinks
            ? book.imageLinks.thumbnail.replace(
                "http://",
                "https://"
            )
            : "",

        status: status,

        addedAt: new Date().toISOString()
    };


    books.push(newBook);

    saveBooks();

    renderBooks();


    const preview =
        document.getElementById("bookPreview");

    if (preview) {
        preview.remove();
    }


    alert(
        `"${newBook.title}" has been added to your library! 📚`
    );
}


// =========================
// SAVE BOOKS
// =========================

function saveBooks() {

    localStorage.setItem(
        "myBooks",
        JSON.stringify(books)
    );
}


// =========================
// DISPLAY BOOKS
// =========================

function renderBooks() {

    const filteredBooks = books.filter(
        book => book.status === currentStatus
    );


    bookCount.textContent = filteredBooks.length;


    if (filteredBooks.length === 0) {

        bookGrid.innerHTML = `

            <div class="empty-library">

                <div class="empty-icon">
                    📚
                </div>

                <h3>
                    This shelf is empty
                </h3>

                <p>
                    Scan a book to add it here.
                </p>

            </div>
        `;

        return;
    }


    bookGrid.innerHTML = "";


    filteredBooks.forEach(book => {

        const bookElement =
            document.createElement("div");

        bookElement.className = "book";


        const cover = book.cover
            ? book.cover
            : "https://via.placeholder.com/135x210?text=No+Cover";


        bookElement.innerHTML = `

            <img
                src="${cover}"
                alt="${escapeHTML(book.title)}"
                title="${escapeHTML(book.title)}"
            >

        `;


        bookGrid.appendChild(bookElement);
    });
}


// =========================
// SECURITY HELPER
// =========================

function escapeHTML(text) {

    const div = document.createElement("div");

    div.textContent = text;

    return div.innerHTML;
}
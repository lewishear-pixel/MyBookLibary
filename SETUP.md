# My Book Library — finished version

This version keeps the working barcode scanner and book lookup, adds search/book details, and adds Supabase accounts + online library syncing.

## 1. Create the Supabase project

Create a free project at https://supabase.com/.

In the Supabase dashboard, open **SQL Editor**, create a new query, paste the contents of `supabase.sql`, and run it.

## 2. Get the browser credentials

In the Supabase dashboard, open the project's API settings. Copy:

- Project URL
- Publishable key (or the legacy `anon` public key if that is what the dashboard shows)

Do **not** use or publish the `service_role`/secret key.

Supabase's browser client is designed to use the project URL plus a publishable/anon key, with Row Level Security protecting user rows.

## 3. Put the credentials in config.js

Open `config.js` and replace:

YOUR_SUPABASE_URL
YOUR_SUPABASE_PUBLISHABLE_KEY

with your real values.

Example:

window.BOOK_LIBRARY_CONFIG = {
  supabaseUrl: 'https://your-project.supabase.co',
  supabaseKey: 'your-public-key'
};

## 4. Configure email authentication

In Supabase Authentication settings, make sure **Email** authentication is enabled.

For a GitHub Pages site, add your exact GitHub Pages address to the allowed redirect/site URLs. For example:

https://YOUR-USERNAME.github.io/MyBookLibrary/

If email confirmation is enabled, creating an account will send a confirmation email before the first login.

## 5. Upload these files to GitHub Pages

Upload:

- index.html
- style.css
- script.js
- config.js

Do not upload `supabase.sql` if you don't want it visible in the website; it is only the database setup script.

## Existing books

The site still keeps a local copy in browser storage. When you log into a new account, if the account's online library is empty and local books exist, the site asks whether you want to copy those books to the online library.

## Important security note

The browser key belongs in `config.js`; the Supabase service_role/secret key must never be put into the website.

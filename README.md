# AutoFillAI

A Chrome extension that extracts contact, education, and professional fields from pasted text and autofills forms on the current web page.

## Setup

1. Create a Python virtual environment and activate it.
2. Install backend dependencies:

```bash
pip install -r requirements.txt
```

3. If the spaCy English model is not installed, install it:

```bash
python -m spacy download en_core_web_sm
```

4. Start the backend API:

```bash
python app.py
```

5. Install Node dependencies for frontend development (optional):

```bash
npm install
```

## Load the extension

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click "Load unpacked" and select the `autofill-form` project folder.

## Notes

- The extension popup sends text to the local backend at `http://127.0.0.1:5001/extract`.
- Sign in / sign up opens `auth.html` for Firebase authentication.
- Firebase is initialized with the app configuration already present in the source.
- If you want to use your own Firebase project, replace the `firebaseConfig` object in `popup.js` and `auth.js`.


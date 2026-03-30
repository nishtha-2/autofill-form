from flask import Flask, request, jsonify
from flask_cors import CORS
import spacy
import re

app = Flask(__name__)
CORS(app)

nlp = spacy.load("en_core_web_sm")

@app.route("/extract", methods=["POST"])
def extract():
    data = request.get_json()
    text = data.get("text", "")

    doc = nlp(text)

    name = None
    location = None
    email = None
    phone = None

    # Named Entity Recognition
    for ent in doc.ents:
        if ent.label_ == "PERSON" and not name:
            name = ent.text
        if ent.label_ == "GPE" and not location:
            location = ent.text

    # Regex for email
    email_match = re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text)
    if email_match:
        email = email_match.group()

    # Regex for phone (10-digit)
    phone_match = re.search(r"\b\d{10}\b", text)
    if phone_match:
        phone = phone_match.group()

    return jsonify({
        "name": name,
        "email": email,
        "phone": phone,
        "location": location
    })

if __name__ == "__main__":
    app.run(debug=True)
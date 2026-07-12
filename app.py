import os
import re

import spacy
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)


def get_server_port():
    """Return the configured port, defaulting to 5001 to avoid macOS conflicts."""
    raw_port = os.getenv("PORT", "5001")
    try:
        port = int(raw_port)
    except (TypeError, ValueError):
        return 5001
    return port if port > 0 else 5001

try:
    nlp = spacy.load("en_core_web_sm")
except OSError:
    # Fallback if the language model is not installed.
    # This avoids a hard crash and keeps the API operational.
    print("[AutoFillAI] en_core_web_sm model not found. Falling back to blank English model.")
    nlp = spacy.blank("en")

# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_email(email):
    """RFC-5321-ish email validation."""
    pattern = r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$"
    return bool(re.match(pattern, email)) if email else False

def validate_phone(phone):
    """Accepts 10-digit local or E.164-style international numbers."""
    cleaned = re.sub(r"[\s\-\(\)\.]", "", phone)
    return bool(re.match(r"^\+?\d{10,15}$", cleaned)) if phone else False

def validate_url(url, domain_hint=None):
    """Basic URL structure check; optionally assert a domain substring."""
    pattern = r"https?://[^\s]+" if not domain_hint else rf"https?://(?:www\.)?{re.escape(domain_hint)}[^\s]*"
    return bool(re.search(pattern, url, re.IGNORECASE)) if url else False

def validate_dob(dob):
    """Sanity-check: string must be non-empty and parseable as a date token."""
    return bool(dob and len(dob) >= 4)

# ---------------------------------------------------------------------------
# Extraction helpers  (each returns {"value": ..., "confidence": 0.0-1.0})
# ---------------------------------------------------------------------------

def extract_email(text):
    # Precise RFC pattern — high confidence when matched
    match = re.search(
        r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", text
    )
    if match:
        val = match.group()
        return {"value": val, "confidence": 0.95 if validate_email(val) else 0.50}
    return {"value": None, "confidence": 0.0}


def extract_phone(text):
    r"""
    Improved patterns (over the original \b\d{10}\b):
    - International: +1-800-555-0100, +44 20 7946 0958
    - Local formatted: (555) 867-5309, 555.867.5309
    - Plain 10-digit: 5558675309
    """
    patterns = [
        r"\+?1?\s?[\-\.]?\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}",  # NA formatted
        r"\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,5}[\s\-]?\d{4,9}",  # International
        r"\b\d{10}\b",                                                 # Plain 10-digit
    ]
    for i, pat in enumerate(patterns):
        match = re.search(pat, text)
        if match:
            val = match.group().strip()
            confidence = 0.90 if i < 2 else (0.80 if validate_phone(val) else 0.55)
            return {"value": val, "confidence": confidence}
    return {"value": None, "confidence": 0.0}


def extract_linkedin(text):
    match = re.search(
        r"https?://(?:www\.)?linkedin\.com/in/[A-Za-z0-9\-_%]+/?", text, re.IGNORECASE
    )
    if match:
        return {"value": match.group(), "confidence": 0.98}
    # Fallback: bare slug without protocol
    match = re.search(r"linkedin\.com/in/([A-Za-z0-9\-_%]+)", text, re.IGNORECASE)
    if match:
        url = "https://www.linkedin.com/in/" + match.group(1)
        return {"value": url, "confidence": 0.85}
    return {"value": None, "confidence": 0.0}


def extract_github(text):
    match = re.search(
        r"https?://(?:www\.)?github\.com/[A-Za-z0-9\-_]+/?", text, re.IGNORECASE
    )
    if match:
        return {"value": match.group(), "confidence": 0.98}
    match = re.search(r"github\.com/([A-Za-z0-9\-_]+)", text, re.IGNORECASE)
    if match:
        url = "https://github.com/" + match.group(1)
        return {"value": url, "confidence": 0.85}
    return {"value": None, "confidence": 0.0}


def extract_dob(text):
    """
    Matches common date formats:
    - DD/MM/YYYY, MM-DD-YYYY, YYYY-MM-DD
    - Written: 12 March 1995, March 12, 1995
    """
    patterns = [
        (r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})\b", 0.80),
        (r"\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b", 0.80),
        (
            r"\b(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
            r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
            r"\s+\d{4})\b",
            0.90,
        ),
        (
            r"\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?"
            r"|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"
            r"\s+\d{1,2},?\s+\d{4})\b",
            0.90,
        ),
    ]
    for pat, conf in patterns:
        match = re.search(pat, text, re.IGNORECASE)
        if match:
            return {"value": match.group(1), "confidence": conf}
    return {"value": None, "confidence": 0.0}


# Known skill keywords — extend freely
SKILLS_VOCABULARY = {
    # Languages
    "python", "javascript", "typescript", "java", "c++", "c#", "ruby", "go",
    "rust", "swift", "kotlin", "php", "scala", "r", "matlab",
    # Web
    "html", "css", "react", "angular", "vue", "next.js", "node.js", "express",
    "django", "flask", "fastapi", "spring", "laravel",
    # Data / ML
    "machine learning", "deep learning", "nlp", "tensorflow", "pytorch",
    "scikit-learn", "pandas", "numpy", "sql", "nosql", "mongodb",
    "postgresql", "mysql", "redis",
    # Cloud / DevOps
    "aws", "azure", "gcp", "docker", "kubernetes", "ci/cd", "git",
    "terraform", "linux",
    # Other
    "graphql", "rest api", "microservices", "agile", "scrum",
}

def extract_skills(text):
    text_lower = text.lower()
    found = [skill for skill in SKILLS_VOCABULARY if skill in text_lower]
    if found:
        # Deduplicate while preserving insertion order
        seen = set()
        unique = [s for s in found if not (s in seen or seen.add(s))]
        return {
            "value": sorted(unique),
            "confidence": 0.85 if len(unique) >= 2 else 0.70,
        }
    return {"value": [], "confidence": 0.0}


# University keywords — NER ORG + these signals disambiguate education from company
UNIVERSITY_SIGNALS = [
    "university", "college", "institute of technology", "school of",
    "polytechnic", "academy", "iit", "iim", "nit", "bits", "mit", "caltech",
]

COMPANY_ANTI_SIGNALS = UNIVERSITY_SIGNALS  # used to exclude edu from company

def extract_company_and_university(text, doc):
    """
    Uses spaCy ORG entities, then disambiguates using keyword signals.
    Returns separate company and university results.
    """
    company = {"value": None, "confidence": 0.0}
    university = {"value": None, "confidence": 0.0}

    for ent in doc.ents:
        if ent.label_ not in ("ORG",):
            continue
        ent_lower = ent.text.lower()

        is_edu = any(sig in ent_lower for sig in UNIVERSITY_SIGNALS)

        if is_edu and not university["value"]:
            university = {"value": ent.text, "confidence": 0.78}
        elif not is_edu and not company["value"]:
            company = {"value": ent.text, "confidence": 0.72}

    # Regex boost: explicit "at <Company>" or "works at" patterns
    at_match = re.search(
        r"(?:works?\s+at|working\s+at|employed\s+(?:at|by)|joined)\s+([A-Z][A-Za-z0-9&\s,\.]{2,40}?)(?:\s+as|\s+since|,|\.|$)",
        text,
    )
    if at_match and not company["value"]:
        candidate = at_match.group(1).strip()
        if not any(sig in candidate.lower() for sig in COMPANY_ANTI_SIGNALS):
            company = {"value": candidate, "confidence": 0.82}

    # Regex boost: explicit university patterns
    edu_match = re.search(
        r"(?:studied\s+at|graduated\s+from|attending|alumnus\s+of)\s+([A-Z][A-Za-z0-9\s,\.]{3,60}?)(?:\s+in|\s+with|,|\.|$)",
        text,
    )
    if edu_match and not university["value"]:
        university = {"value": edu_match.group(1).strip(), "confidence": 0.82}

    return company, university


# ---------------------------------------------------------------------------
# Validation layer — applied after all extraction
# ---------------------------------------------------------------------------

def validate_result(result):
    """
    Adds a 'valid' boolean and 'error' message to each field.
    Does NOT strip valid data — just annotates.
    """
    validations = {}

    if result["email"]["value"]:
        ok = validate_email(result["email"]["value"])
        validations["email"] = {"valid": ok, "error": None if ok else "Invalid email format"}

    if result["phone"]["value"]:
        ok = validate_phone(result["phone"]["value"])
        validations["phone"] = {"valid": ok, "error": None if ok else "Unrecognised phone format"}

    if result["linkedin"]["value"]:
        ok = validate_url(result["linkedin"]["value"], "linkedin.com")
        validations["linkedin"] = {"valid": ok, "error": None if ok else "Invalid LinkedIn URL"}

    if result["github"]["value"]:
        ok = validate_url(result["github"]["value"], "github.com")
        validations["github"] = {"valid": ok, "error": None if ok else "Invalid GitHub URL"}

    if result["dob"]["value"]:
        ok = validate_dob(result["dob"]["value"])
        validations["dob"] = {"valid": ok, "error": None if ok else "Unrecognised date format"}

    return validations


# ---------------------------------------------------------------------------
# Main route
# ---------------------------------------------------------------------------

@app.route("/extract", methods=["POST"])
def extract():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "No text provided"}), 400

    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "Empty text"}), 400

    doc = nlp(text)

    # --- Original fields (preserved) ---
    name = {"value": None, "confidence": 0.0}
    location = {"value": None, "confidence": 0.0}

    for ent in doc.ents:
        if ent.label_ == "PERSON" and not name["value"]:
            name = {"value": ent.text, "confidence": 0.80}
        if ent.label_ in ("GPE", "LOC") and not location["value"]:
            location = {"value": ent.text, "confidence": 0.75}

    email = extract_email(text)
    phone = extract_phone(text)

    # --- New Phase 1 fields ---
    linkedin = extract_linkedin(text)
    github = extract_github(text)
    dob = extract_dob(text)
    skills = extract_skills(text)
    company, university = extract_company_and_university(text, doc)

    result = {
        "name": name,
        "email": email,
        "phone": phone,
        "location": location,
        "linkedin": linkedin,
        "github": github,
        "dob": dob,
        "skills": skills,
        "company": company,
        "university": university,
    }

    validations = validate_result(result)

    return jsonify({
        "data": result,
        "validations": validations,
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=get_server_port(), debug=True, use_reloader=False)
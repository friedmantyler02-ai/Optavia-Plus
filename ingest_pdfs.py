#!/usr/bin/env python3
"""Extract text from PDFs and insert into Supabase knowledge_documents table."""

import os
import re
import json
import urllib.request
import urllib.error
from pypdf import PdfReader

PDF_DIR = os.path.expanduser("~/Downloads/Optavia AI Training Material March 2026")
SUPABASE_URL = "https://couqugkxroslnzvevpvm.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdXF1Z2t4cm9zbG56dmV2cHZtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ2NTkxMiwiZXhwIjoyMDg4MDQxOTEyfQ.0zVJTZsPZiTMR3jBWNiT1xdQKKHop9ySH8ig_J3XK8o"

PROGRAM_GUIDES_KEYWORDS = ["GUI", "Plan", "Dining", "Vegetarian", "Transition", "Recipe", "Conversion", "Guide"]
CLINICAL_KEYWORDS = ["Clinical", "DrA", "Claims"]
COACH_TRAINING_KEYWORDS = ["LRN", "MSWL", "Coaching", "Leadership", "Goals"]
FORMS_KEYWORDS = ["FRM"]


def classify_category(filename: str) -> str:
    for kw in FORMS_KEYWORDS:
        if kw in filename:
            return "Forms & Reference"
    for kw in CLINICAL_KEYWORDS:
        if kw in filename:
            return "Clinical & Science"
    for kw in COACH_TRAINING_KEYWORDS:
        if kw in filename:
            return "Coach Training"
    for kw in PROGRAM_GUIDES_KEYWORDS:
        if kw in filename:
            return "Program Guides"
    return "General"


def make_title(filename: str) -> str:
    name = os.path.splitext(filename)[0]
    # Remove duplicate suffixes like " (1)"
    name = re.sub(r'\s*\(\d+\)$', '', name)
    # Remove common prefixes
    name = re.sub(r'^(OPTAVIA[-_]?|50\d{3}[-_])', '', name)
    # Remove type prefixes like GUI_, DOC_, LRN_, FRM_, MSWL_
    name = re.sub(r'^(GUI|DOC|LRN|FRM|MSWL)[-_]', '', name)
    # Replace hyphens/underscores with spaces
    name = name.replace('-', ' ').replace('_', ' ')
    # Collapse multiple spaces
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def extract_text(filepath: str) -> str:
    reader = PdfReader(filepath)
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def get_existing_filenames() -> set:
    url = f"{SUPABASE_URL}/rest/v1/knowledge_documents?select=filename"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read())
    return {r["filename"] for r in rows}


def insert_document(filename: str, title: str, category: str, content: str) -> bool:
    url = f"{SUPABASE_URL}/rest/v1/knowledge_documents"
    body = json.dumps({
        "filename": filename,
        "title": title,
        "category": category,
        "content": content,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    })
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status == 201
    except urllib.error.HTTPError as e:
        print(f"  ERROR inserting: {e.code} {e.read().decode()}")
        return False


def main():
    pdf_files = sorted(f for f in os.listdir(PDF_DIR) if f.lower().endswith(".pdf"))
    print(f"Found {len(pdf_files)} PDF files\n")

    existing = get_existing_filenames()
    if existing:
        print(f"Already in database: {len(existing)} documents\n")

    success = 0
    skipped = 0
    failed = 0

    for i, filename in enumerate(pdf_files, 1):
        filepath = os.path.join(PDF_DIR, filename)

        if filename in existing:
            print(f"[{i}/{len(pdf_files)}] SKIP (duplicate): {filename}")
            skipped += 1
            continue

        title = make_title(filename)
        category = classify_category(filename)

        print(f"[{i}/{len(pdf_files)}] Processing: {filename}")
        print(f"  Title: {title}")
        print(f"  Category: {category}")

        try:
            content = extract_text(filepath)
            char_count = len(content)
            print(f"  Extracted {char_count} characters from {len(PdfReader(filepath).pages)} pages")

            if not content.strip():
                print("  WARNING: No text extracted (may be scanned/image PDF)")
                failed += 1
                continue

            if insert_document(filename, title, category, content):
                print(f"  Inserted successfully")
                success += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ERROR: {e}")
            failed += 1

        print()

    print(f"\nDone! Inserted: {success}, Skipped: {skipped}, Failed: {failed}")


if __name__ == "__main__":
    main()

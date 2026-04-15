#!/usr/bin/env python3
"""
One-time script to extract NCC exam questions from PDF and generate questions.js.

Usage:
    pip install pdfplumber
    python extract_questions.py /path/to/ncc.pdf

Output:
    questions.js  — ready to include in the web app
"""

import sys
import json
import re
import pdfplumber

# Category assignment by question ID range (based on PDF content analysis)
CATEGORY_RANGES = [
    (1,   22,  "mechanics",        "Meccanica del Veicolo"),
    (23,  72,  "road_safety",      "Sicurezza Stradale"),
    (73,  107, "insurance",        "Assicurazione e Normativa"),
    (108, 223, "ncc_regs",         "Normativa NCC/Taxi"),
    (224, 255, "road_safety",      "Sicurezza Stradale"),
    (256, 515, "advanced_systems", "Sistemi Avanzati del Veicolo"),
]

# Navigation questions override (specific IDs)
NAVIGATION_IDS = set(list(range(97, 108)) + [72] + list(range(373, 391)))


def get_category(qid):
    if qid in NAVIGATION_IDS:
        return ("navigation", "Navigazione")
    for start, end, slug, label in CATEGORY_RANGES:
        if start <= qid <= end:
            return (slug, label)
    return ("advanced_systems", "Sistemi Avanzati del Veicolo")


def extract_text(pdf_path):
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
    return "\n".join(pages)


def parse_questions(raw_text):
    """
    Actual PDF format:

        1 Question text here (may span multiple lines)
        1. Option A text
        2. Option B text
        3. Option C text X

    The correct answer has ' X' at the end of the option line.
    Question number is a standalone integer at the start of a line,
    followed by a space and the question text.
    Options start with '1.', '2.', '3.' (with a period).
    """

    questions = []

    # Split full text into lines
    lines = raw_text.splitlines()

    # A question-start line: "42 Some text..."  (number + space + text)
    # An option line:        "1. Some option X"  or "1.Some option X" (no space after dot)
    # A standalone number:   "121"  — question number on its own line (page-break artifact)
    q_start   = re.compile(r'^(\d+) (.+)$')
    q_alone   = re.compile(r'^(\d+)$')          # number alone on a line
    opt_line  = re.compile(r'^([123])\s?[.\-]\s*(.+)$')
    lone_x    = re.compile(r'^[Xx]$')           # X alone on a line = correct marker for prev opt

    # Build a token stream
    tokens = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        m_o = opt_line.match(line)
        m_q = q_start.match(line)
        m_qa = q_alone.match(line)
        if m_o:
            tokens.append(('opt', m_o.group(1), m_o.group(2)))
        elif m_q:
            tokens.append(('q', int(m_q.group(1)), m_q.group(2)))
        elif m_qa:
            # Question number alone (next line will be the question text)
            tokens.append(('q_alone', int(m_qa.group(1))))
        elif lone_x.match(line):
            tokens.append(('lone_x',))
        else:
            tokens.append(('cont', line))

    # Merge q_alone + next cont into a 'q' token
    merged = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok[0] == 'q_alone':
            qnum = tok[1]
            # gather following cont lines as question text
            text_parts = []
            j = i + 1
            while j < len(tokens) and tokens[j][0] == 'cont':
                text_parts.append(tokens[j][1])
                j += 1
            if text_parts:
                merged.append(('q', qnum, ' '.join(text_parts)))
                i = j
            else:
                # nothing follows — skip
                i += 1
        else:
            merged.append(tok)
            i += 1

    # Group into question blocks
    blocks = []
    current = None

    for tok in merged:
        if tok[0] == 'q':
            if current:
                blocks.append(current)
            current = {'id': tok[1], 'q_parts': [tok[2]], 'opts': [], 'pending_x': False}
        elif tok[0] == 'opt' and current is not None:
            opt = {'num': tok[1], 'text': tok[2], 'correct': False}
            if current['pending_x'] and not current['opts']:
                opt['correct'] = True
                current['pending_x'] = False
            current['opts'].append(opt)
        elif tok[0] == 'lone_x' and current is not None:
            if current['opts']:
                # X on its own line after options: marks the last option as correct
                current['opts'][-1]['correct'] = True
            else:
                # X on its own line before any options: marks option 0 (first) as correct
                current['pending_x'] = True
        elif tok[0] == 'cont' and current is not None:
            if current['opts']:
                current['opts'][-1]['text'] += ' ' + tok[1]
            else:
                current['q_parts'].append(tok[1])

    if current:
        blocks.append(current)

    # Pass 3: parse each block into a Question
    for block in blocks:
        qnum = block['id']
        question_text = ' '.join(block['q_parts']).strip()
        opts_raw = block['opts']

        # Handle 6-option case: two questions got merged (page-break artifact)
        # Split into 3+3 and only take the first question's options
        if len(opts_raw) == 6:
            opts_raw = opts_raw[:3]

        if len(opts_raw) != 3:
            print(f"  WARNING: Q{qnum} has {len(opts_raw)} options (expected 3), skipping")
            continue

        correct_index = None
        cleaned_options = []
        for i, opt in enumerate(opts_raw):
            text = opt['text']
            if opt['correct'] or re.search(r'\s+[Xx]\s*$', text):
                correct_index = i
                text = re.sub(r'\s+[Xx]\s*$', '', text).strip()
            cleaned_options.append(text)

        if correct_index is None:
            print(f"  WARNING: Q{qnum} no correct answer found, defaulting to 0")
            correct_index = 0

        cat_slug, cat_label = get_category(qnum)

        questions.append({
            "id": qnum,
            "category": cat_slug,
            "categoryLabel": cat_label,
            "it": {
                "question": question_text,
                "options": cleaned_options
            },
            "correctIndex": correct_index
        })

    questions.sort(key=lambda q: q["id"])
    return questions


def write_js(questions, out_path="questions.js"):
    js = "// Auto-generated from NCC exam PDF. Do not edit manually.\n"
    js += f"// Total questions: {len(questions)}\n"
    js += "const QUESTIONS = "
    js += json.dumps(questions, ensure_ascii=False, indent=2)
    js += ";\n"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)
    print(f"Written {len(questions)} questions to {out_path}")


def main():
    pdf_path = sys.argv[1] if len(sys.argv) > 1 else "ncc.pdf"
    print(f"Extracting from: {pdf_path}")
    raw = extract_text(pdf_path)
    print(f"Extracted {len(raw)} characters of text")
    questions = parse_questions(raw)
    print(f"Parsed {len(questions)} questions")

    # Spot-check
    if questions:
        print("\nFirst question:")
        q = questions[0]
        print(f"  Q{q['id']}: {q['it']['question'][:80]}")
        for i, opt in enumerate(q['it']['options']):
            marker = " <-- correct" if i == q['correctIndex'] else ""
            print(f"    {i+1}. {opt[:60]}{marker}")

    write_js(questions)
    print("\nDone! Review questions.js, then place it in the ncc-prep/ directory.")


if __name__ == "__main__":
    main()

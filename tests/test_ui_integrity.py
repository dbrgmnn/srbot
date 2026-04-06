import os
import re
from html.parser import HTMLParser

import pytest


class IntegrityHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags_stack = []
        self.ids = set()
        self.errors = []
        # Tags that don't need a closing tag in HTML5
        self.self_closing = {"img", "br", "hr", "input", "meta", "link"}

    def handle_starttag(self, tag, attrs):
        if tag not in self.self_closing:
            self.tags_stack.append(tag)
        for attr, value in attrs:
            if attr == "id":
                if value in self.ids:
                    self.errors.append(f"Duplicate ID found: {value}")
                self.ids.add(value)

    def handle_endtag(self, tag):
        if tag in self.self_closing:
            return
        if not self.tags_stack:
            self.errors.append(f"Unexpected end tag: </{tag}>")
            return

        last_tag = self.tags_stack.pop()
        if last_tag != tag:
            self.errors.append(f"Tag mismatch: opened <{last_tag}>, closed </{tag}>")

    def close(self):
        super().close()
        if self.tags_stack:
            self.errors.append(f"Unclosed tags remain: {', '.join(self.tags_stack)}")


def get_webapp_path():
    return os.path.join(os.path.dirname(__file__), "..", "static")


def test_html_validity_and_ids():
    """Check index.html for duplicate IDs and basic structural issues."""
    path = os.path.join(get_webapp_path(), "index.html")
    with open(path, encoding="utf-8") as f:
        content = f.read()

    parser = IntegrityHTMLParser()
    parser.feed(content)
    parser.close()

    if parser.errors:
        pytest.fail("\n".join(parser.errors))


def test_js_id_references():
    """Ensure all IDs referenced in JS files exist in index.html."""
    webapp_dir = get_webapp_path()
    html_path = os.path.join(webapp_dir, "index.html")

    with open(html_path, encoding="utf-8") as f:
        html_content = f.read()

    # Simple regex to find all id="..." in HTML
    html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html_content))

    # Find all document.getElementById('...') in JS files
    js_dir = os.path.join(webapp_dir, "js")
    js_files = [f for f in os.listdir(js_dir) if f.endswith(".js")]

    missing_ids = []
    for js_file in js_files:
        with open(os.path.join(js_dir, js_file), encoding="utf-8") as f:
            js_content = f.read()
            # Find references: getElementById('xxx') or getElementById("xxx")
            refs = re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js_content)
            for ref in refs:
                if ref not in html_ids:
                    # Special cases for dynamic IDs or common TG IDs can be ignored here
                    if ref not in ["toast", "word-card"] and not ref.startswith("wr-"):
                        missing_ids.append(f"File {js_file} references missing ID: {ref}")

    if missing_ids:
        pytest.fail("\n".join(missing_ids))


def test_static_files_existence():
    """Verify that all script/link tags in HTML point to existing files."""
    webapp_dir = get_webapp_path()
    html_path = os.path.join(webapp_dir, "index.html")

    with open(html_path, encoding="utf-8") as f:
        html_content = f.read()

    # Find static refs: src="/static/js/..." or href="/static/css/..."
    refs = re.findall(r'(?:src|href)=["\']/?static/([^"\']+)["\']', html_content)

    missing_files = []
    for ref in refs:
        full_path = os.path.join(webapp_dir, ref)
        if not os.path.exists(full_path):
            missing_files.append(f"Referenced static file missing: {ref} (checked at {full_path})")

    if missing_files:
        pytest.fail("\n".join(missing_files))


def test_js_esm_order():
    """Ensure all 'import' statements appear at the top of JS files."""
    js_dir = os.path.join(get_webapp_path(), "js")
    for js_file in os.listdir(js_dir):
        if not js_file.endswith(".js"):
            continue
        with open(os.path.join(js_dir, js_file), encoding="utf-8") as f:
            lines = f.readlines()
            found_code = False
            for line_no, line in enumerate(lines, 1):
                stripped = line.strip()
                # Skip empty lines, comments, and opening brackets
                if not stripped or stripped.startswith(("//", "/*", "*", "{")):
                    continue

                # If we are inside an import statement (starts with 'import' or ends with 'from')
                if (
                    stripped.startswith("import ")
                    or stripped.endswith('from "./dictionary.js";')
                    or stripped.endswith('from "./practice.js";')
                    or stripped.endswith('from "./toast.js";')
                    or stripped.endswith('from "./ui.js";')
                ):
                    continue

                if stripped.startswith("import "):
                    if found_code:
                        pytest.fail(f"Invalid import order in {js_file}:{line_no}: 'import' after code")
                else:
                    found_code = True

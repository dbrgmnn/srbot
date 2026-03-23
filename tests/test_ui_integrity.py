import os
import re
import pytest
from html.parser import HTMLParser

class IntegrityHTMLParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags_stack = []
        self.ids = set()
        self.errors = []
        # Tags that don't need a closing tag in HTML5
        self.self_closing = {'img', 'br', 'hr', 'input', 'meta', 'link'}

    def handle_starttag(self, tag, attrs):
        if tag not in self.self_closing:
            self.tags_stack.append(tag)
        for attr, value in attrs:
            if attr == 'id':
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
    return os.path.join(os.path.dirname(__file__), '..', 'webapp')

def test_html_validity_and_ids():
    """Check index.html for duplicate IDs and basic structural issues."""
    path = os.path.join(get_webapp_path(), 'index.html')
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    parser = IntegrityHTMLParser()
    parser.feed(content)
    parser.close()
    
    if parser.errors:
        pytest.fail("\n".join(parser.errors))

def test_js_id_references():
    """Ensure all IDs referenced in JS files exist in index.html."""
    webapp_dir = get_webapp_path()
    html_path = os.path.join(webapp_dir, 'index.html')
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Simple regex to find all id="..." in HTML
    html_ids = set(re.findall(r'id=["\']([^"\']+)["\']', html_content))
    
    # Find all document.getElementById('...') in JS files
    js_dir = os.path.join(webapp_dir, 'js')
    js_files = [f for f in os.listdir(js_dir) if f.endswith('.js')]
    
    missing_ids = []
    for js_file in js_files:
        with open(os.path.join(js_dir, js_file), 'r', encoding='utf-8') as f:
            js_content = f.read()
            # Find references: getElementById('xxx') or getElementById("xxx")
            refs = re.findall(r'getElementById\(["\']([^"\']+)["\']\)', js_content)
            for ref in refs:
                if ref not in html_ids:
                    # Special cases for dynamic IDs or common TG IDs can be ignored here
                    if ref not in ['toast', 'word-card'] and not ref.startswith('wr-'):
                        missing_ids.append(f"File {js_file} references missing ID: {ref}")

    if missing_ids:
        pytest.fail("\n".join(missing_ids))

def test_static_files_existence():
    """Verify that all script/link tags in HTML point to existing files."""
    webapp_dir = get_webapp_path()
    html_path = os.path.join(webapp_dir, 'index.html')
    
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Find static refs: src="static/js/..." or href="static/css/..."
    # Note: adjust prefix if your serving logic is different
    refs = re.findall(r'(?:src|href)=["\']static/([^"\']+)["\']', html_content)
    
    missing_files = []
    for ref in refs:
        full_path = os.path.join(webapp_dir, ref)
        if not os.path.exists(full_path):
            missing_files.append(f"Referenced static file missing: {ref} (checked at {full_path})")
            
    if missing_files:
        pytest.fail("\n".join(missing_files))

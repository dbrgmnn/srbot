import json
import logging
import aiohttp
from core.languages import LANGUAGES

logger = logging.getLogger(__name__)

class Translator:
    def __init__(self, api_key: str):
        self.api_key = api_key
        # Use gemini-2.5-flash-lite via direct REST API
        self.url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"

    async def translate_and_enrich(self, text: str, source_lang: str) -> dict | None:
        """
        Translates word from source_lang, provides example and level.
        Uses direct HTTP POST to avoid heavy library imports.
        """
        lang_name = LANGUAGES.get(source_lang, {}).get("name", source_lang)
        
        # System instructions: Lemma with article -> Russian translation -> B1+ Example
        prompt = f"""
        Analyze input: "{text}" (Language: {lang_name}, Code: {source_lang}).
        Task:
        1. Provide the lemma of "{text}" in {lang_name}. 
           CRITICAL: If it's a noun, ALWAYS include the definite article (e.g. 'der Hund').
        2. Translate it to Russian.
        3. Provide a natural example sentence in {lang_name}.
           CRITICAL: The example must be strictly CEFR level B1 or higher.
        4. Determine CEFR level (A1-C2).
        
        Output ONLY valid JSON:
        {{
          "word": "lemma_with_article",
          "translation": "russian_translation",
          "example": "B1_plus_example",
          "level": "B1",
          "is_valid": true
        }}
        If "{text}" is gibberish or not a word in {lang_name}, set "is_valid": false.
        """

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.3
            }
        }

        try:
            async with aiohttp.ClientSession() as session:
                url_with_key = f"{self.url}?key={self.api_key}"
                async with session.post(url_with_key, json=payload, timeout=15) as resp:
                    if resp.status != 200:
                        err_text = await resp.text()
                        logger.error(f"Gemini API error {resp.status}: {err_text}")
                        return None
                    
                    result = await resp.json()
                    
                    if 'candidates' not in result or not result['candidates']:
                        logger.error(f"Gemini returned empty candidates: {result}")
                        return None
                        
                    content_text = result['candidates'][0]['content']['parts'][0]['text']
                    data = json.loads(content_text)
                    
                    if not data.get("is_valid"):
                        logger.warning(f"Invalid word detected by AI: {text}")
                        return None
                        
                    return data

        except Exception as e:
            logger.error(f"Translation error for '{text}': {e}")
            return None

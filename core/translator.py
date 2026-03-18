import json
import logging
import aiohttp
from core.languages import LANGUAGES

logger = logging.getLogger(__name__)

class Translator:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"

    async def translate_and_enrich(self, text: str, source_lang: str) -> dict | None:
        lang_name = LANGUAGES.get(source_lang, {}).get("name", source_lang)
        
        prompt = f"""Translate "{text}" between {lang_name} ({source_lang}) and Russian.

Rules:
- word: {lang_name} form. De nouns: lowercase article + Capitalized noun (e.g. der Hund). Other words: lowercase.
- translation: Russian lowercase.
- example: natural {lang_name} sentence, B1+ level.
- level: CEFR (A1-C2).
- is_valid: false if input is gibberish, else true.

Return JSON only: {{"word": "", "translation": "", "example": "", "level": "", "is_valid": true}}"""

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
                async with session.post(url_with_key, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
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

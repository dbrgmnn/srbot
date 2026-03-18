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
        
        # Strict rules:
        # 1. Target Language (DE/EN) always goes to "word".
        # 2. Russian always goes to "translation".
        # 3. If source_lang is 'de' and it's a noun: "Der/Die/Das Word" (Capitalized).
        # 4. Everything else (English, non-noun German, Russian): lowercase.
        
        prompt = f"""
        Input text: "{text}"
        Target foreign language: {lang_name} (Code: {source_lang}).
        
        Task:
        1. Identify if "{text}" is Russian or {lang_name}. 
        2. Find the equivalent in {lang_name} (this will be the "word" field).
        3. Find the equivalent in Russian (this will be the "translation" field).
        4. Apply STRICT formatting:
           - If language is 'de' and it's a noun: "Der/Die/Das [Noun]" (e.g., 'Der Hund', 'Die Freiheit').
           - ALL other foreign words (English, German verbs/adj): lowercase (e.g., 'house', 'laufen').
           - ALL Russian translations: lowercase (e.g., 'собака', 'бегать').
        5. Provide a natural example sentence in {lang_name} (Level B1+).
        6. Determine CEFR level (A1-C2).

        Output ONLY JSON:
        {{
          "word": "foreign_word_with_casing_rules",
          "translation": "russian_lowercase_translation",
          "example": "B1_plus_example_sentence",
          "level": "CEFR",
          "is_valid": true
        }}
        If input is gibberish, set "is_valid": false.
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

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
        
        article_rule = "Nouns: lowercase article + Capitalized noun (e.g. der Hund). Verbs/adj: lowercase." if source_lang == "de" else "All words: lowercase."
        prompt = f"""Translate "{text}" between {lang_name} ({source_lang}) and Russian.

Rules:
- word: {lang_name} form. {article_rule}
- translation: Russian lowercase.
- example: natural {lang_name} sentence, B1+ level.
- level: CEFR (A1-C2).
- is_valid: false if input is gibberish, else true.

Return JSON only: {{"word": "", "translation": "", "example": "", "level": "", "is_valid": true}}"""

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.3,
                "maxOutputTokens":512
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

                    if not data.get("word") or not data.get("translation"):
                        logger.error(f"AI returned incomplete data for '{text}': {data}")
                        return None
                        
                    return data

        except Exception as e:
            logger.error(f"Translation error for '{text}': {e}")
            return None

    async def get_hint(self, word: str, translation: str, example: str, lang: str) -> dict | None:
        lang_name = LANGUAGES.get(lang, {}).get("name", lang)

        prompt = f"""You are a language learning assistant. Return a short reference for a {lang_name} word.

Word: {word}
Translation (Russian): {translation}
Example: {example or 'none'}

Return JSON:
- pos: part of speech in {lang_name} (e.g. "Substantiv", "Verb", "Adjektiv", "Adverb"). Use the target language.
- gender: for nouns — article + noun plural form (e.g. "der, die Hunde"). For verbs — Präteritum and Partizip II (e.g. "ging, ist gegangen"). Empty string for adjectives/adverbs.
- mnemonic: a short memorable association in Russian, max 1 sentence. Must be concrete and tied to the sound or meaning of the word.

JSON only: {{"pos": "", "gender": "", "mnemonic": ""}}"""

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.7,
                "maxOutputTokens": 256
            }
        }

        try:
            async with aiohttp.ClientSession() as session:
                url_with_key = f"{self.url}?key={self.api_key}"
                async with session.post(url_with_key, json=payload, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                    if resp.status != 200:
                        err_text = await resp.text()
                        logger.error(f"Gemini hint error {resp.status}: {err_text}")
                        return None

                    result = await resp.json()

                    if 'candidates' not in result or not result['candidates']:
                        logger.error(f"Gemini hint returned empty candidates: {result}")
                        return None

                    content_text = result['candidates'][0]['content']['parts'][0]['text']
                    data = json.loads(content_text)

                    if not data.get("mnemonic") or not data.get("pos"):
                        logger.error(f"Hint incomplete for '{word}': {data}")
                        return None

                    return data

        except Exception as e:
            logger.error(f"Hint error for '{word}': {e}")
            return None

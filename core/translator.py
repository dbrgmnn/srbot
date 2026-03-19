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

        prompt = f"""Ты помощник для изучения языков. Дай краткую справку о слове на русском языке.

Слово: {word} ({lang_name})
Перевод: {translation}
Пример: {example or 'нет'}

Верни JSON:
- gender: для существительных — артикль и род на русском (например "der — мужской"), для глаголов — "глагол", для прилагательных — "прилагательное", иначе ""
- forms: для глаголов — Präteritum и Partizip II (например "ging, ist gegangen"), для существительных — форма множественного числа (например "die Hunde"), иначе ""
- mnemonic: образная мнемоника для запоминания на русском, 1-2 предложения. Должна быть конкретной, логичной и привязанной к звучанию или значению слова.

Только JSON: {{"gender": "", "forms": "", "mnemonic": ""}}"""

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

                    if not data.get("mnemonic"):
                        logger.error(f"Hint incomplete for '{word}': {data}")
                        return None

                    return data

        except Exception as e:
            logger.error(f"Hint error for '{word}': {e}")
            return None

import json
import logging
import aiohttp
from core.languages import LANGUAGES

logger = logging.getLogger(__name__)

class Translator:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
        self._session = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Returns or creates an aiohttp.ClientSession."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15))
        return self._session

    async def _call_gemini(self, prompt: str, temperature: float = 0.3, max_tokens: int = 512) -> dict | None:
        """Unified method to call Gemini API and parse JSON response."""
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": temperature,
                "maxOutputTokens": max_tokens
            }
        }

        try:
            session = await self._get_session()
            url_with_key = f"{self.url}?key={self.api_key}"
            async with session.post(url_with_key, json=payload) as resp:
                if resp.status != 200:
                    err_text = await resp.text()
                    logger.error(f"Gemini API error {resp.status}: {err_text}")
                    return None
                
                result = await resp.json()
                
                if 'candidates' not in result or not result['candidates']:
                    logger.error(f"Gemini returned empty candidates: {result}")
                    return None
                    
                content_text = result['candidates'][0]['content']['parts'][0]['text']
                return json.loads(content_text)
        except Exception as e:
            logger.error(f"Gemini call failed: {e}")
            return None

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

        data = await self._call_gemini(prompt)
        
        if not data:
            return None
            
        if not data.get("is_valid"):
            logger.warning(f"Invalid word detected by AI: {text}")
            return None

        if not data.get("word") or not data.get("translation"):
            logger.error(f"AI returned incomplete data for '{text}': {data}")
            return None
            
        return data

    async def get_hint(self, word: str, translation: str, example: str, lang: str) -> dict | None:
        lang_name = LANGUAGES.get(lang, {}).get("name", lang)

        if lang == 'de':
            pos_example = '"Substantiv", "Verb", "Adjektiv", "Adverb"'
            forms_note = 'for nouns — plural form with article (e.g. "die Hunde"). For verbs — Pr\u00e4teritum and Partizip II (e.g. "ging, ist gegangen"). For adjectives — comparative and superlative (e.g. "schnell, schnelle, schnelles"). Empty string for adverbs.'
        else:
            pos_example = '"Noun", "Verb", "Adjective", "Adverb"'
            forms_note = 'for nouns — plural form (e.g. "dogs"). For verbs — Past Simple and Past Participle (e.g. "went, gone"). For adjectives — comparative and superlative (e.g. "fast, faster, fastest"). Empty string for adverbs.'

        prompt = f"""You are a language learning assistant. Return a short reference for a {lang_name} word.

Word: {word}
Translation (Russian): {translation}
Example: {example or 'none'}

Return JSON:
- pos: part of speech in {lang_name} (e.g. {pos_example}). Use the target language.
- forms: {forms_note}
- mnemonic: a short memorable association in Russian, max 1 sentence. Must be concrete and tied to the sound or meaning of the word.

JSON only: {{"pos": "", "forms": "", "mnemonic": ""}}"""

        return await self._call_gemini(prompt, temperature=0.7, max_tokens=256)

    async def close(self):
        """Closes the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

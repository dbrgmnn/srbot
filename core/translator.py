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

        content_text = ""
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
                    
                content_text = result['candidates'][0]['content']['parts'][0]['text'].strip()
                
                # Robust JSON extraction
                if content_text.startswith("```"):
                    lines = content_text.splitlines()
                    if lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].startswith("```"):
                        lines = lines[:-1]
                    content_text = "\n".join(lines).strip()

                return json.loads(content_text)
        except Exception as e:
            logger.error(f"Gemini call failed: {e}. Raw content: {content_text[:200]}")
            return None

    async def translate_and_enrich(self, text: str, source_lang: str) -> dict | None:
        """Translates a word and provides context-rich metadata."""
        lang_name = LANGUAGES.get(source_lang, {}).get("name", source_lang)
        
        article_rule = "German nouns: lowercase article + Capitalized noun (e.g. der Hund). Other languages/types: lowercase." if source_lang == "de" else "All words: lowercase."
        
        prompt = f"""You are a Senior Linguist and Lexicographer. 
Translate the input "{text}" from {lang_name} ({source_lang}) to Russian with high precision.

Rules:
1. DICTIONARY FORM: Always return the lemma/infinitive. {article_rule}
2. TRANSLATION: Provide the most frequent and useful Russian meaning for a B1-B2 learner.
3. SEMANTIC EXAMPLE: Create a natural, vivid sentence where the word's meaning is evident from context. Avoid trivial sentences like "I see a..." or "This is a...".
4. LEVEL: Accurately estimate CEFR level (A1-C2).
5. VALIDITY: Set "is_valid": false only for non-existent words or gibberish.

Response must be a valid JSON object matching this schema:
{{"word": "normalized word", "translation": "russian", "example": "context-rich sentence", "level": "A1-C2", "is_valid": true}}"""

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

    async def get_hint(self, word: str, translation: str, lang: str) -> dict | None:
        """Provides a powerful mnemonic hint for a word using phonetic association."""
        lang_name = LANGUAGES.get(lang, {}).get("name", lang)

        prompt = f"""You are an expert in mnemonics and language learning. 
Create a powerful, memorable mnemonic in Russian to help a student remember a {lang_name} word.

Input:
Word: {word}
Translation: {translation}

Instruction for Mnemonic:
1. Link the SOUND of the {lang_name} word to a similar-sounding Russian word (keyword).
2. Create a vivid, emotional, or absurd mental image connecting that Russian keyword to the actual meaning.
3. Keep it to ONE concise sentence.

Example (DE): "Hund" (dog) -> "ХУНт — это собака, которая требует фунт мяса".
Example (EN): "Pillow" (подушка) -> "ПИЛЛОу — ПИЛой ломаю подушку".

Response JSON fields:
- mnemonic: the generated mnemonic in Russian."""

        return await self._call_gemini(prompt, temperature=0.8, max_tokens=128)

    async def close(self):
        """Closes the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

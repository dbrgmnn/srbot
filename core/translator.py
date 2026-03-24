import json
import logging

import aiohttp

from core.languages import LANGUAGES

logger = logging.getLogger(__name__)


class Translator:
    """Handles interaction with Gemini API for translation and word enrichment."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
        self._session = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Return existing session or create a new one."""
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15))
        return self._session

    async def _call_gemini(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.1, max_tokens: int = 256
    ) -> dict | None:
        """Call Gemini API with system instructions and return parsed JSON response."""
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
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

                if "candidates" not in result or not result["candidates"]:
                    logger.error(f"Gemini returned empty candidates: {result}")
                    return None

                content_text = result["candidates"][0]["content"]["parts"][0]["text"].strip()

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
        """Translate word and generate example + CEFR level via Gemini."""
        lang_name = LANGUAGES.get(source_lang, {}).get("name", source_lang)

        article_rule = (
            "nouns: lowercase article + Capitalized noun (e.g. der Hund)." if source_lang == "de" else "lowercase."
        )

        system_prompt = f"""You are an expert lexicographer. Translate words between {lang_name} and Russian.
Rules:
- word: exact {lang_name} lemma form, {article_rule}
- translation: MOST common primary Russian translation in lowercase.
- level: CEFR level (A1-C2).
- example: natural {lang_name} sentence. Complexity MUST match the level.
- is_valid: false if input is gibberish, else true.

Return JSON: {{"word": "", "translation": "", "example": "", "level": "", "is_valid": true}}"""

        user_prompt = f'Translate "{text}"'
        return await self._call_gemini(system_prompt, user_prompt, max_tokens=256)

    async def close(self):
        """Close the aiohttp session."""
        if self._session and not self._session.closed:
            await self._session.close()

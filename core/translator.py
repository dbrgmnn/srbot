import asyncio
import json
import logging

import aiohttp

from core.languages import LANGUAGES

logger = logging.getLogger(__name__)


class Translator:
    """Handles interaction with Gemini API for translation and word enrichment."""

    def __init__(self, api_key: str, model_name: str, session: aiohttp.ClientSession):
        self.api_key = api_key
        self.model_name = model_name
        self.url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"
        self.session = session

    async def _call_gemini(
        self, system_prompt: str, user_prompt: str, temperature: float = 0.1, max_tokens: int = 256
    ) -> dict | None:
        """Call Gemini API and return a literal JSON response."""
        payload = {
            "system_instruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }

        headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": self.api_key,
        }
        content_text = ""
        max_retries = 3
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                async with asyncio.timeout(10.0):
                    async with self.session.post(self.url, json=payload, headers=headers) as resp:
                        if resp.status == 429 or resp.status >= 500:
                            err_text = await resp.text()
                            logger.warning(
                                "Gemini API error %d (attempt %d/%d): %s",
                                resp.status,
                                attempt + 1,
                                max_retries,
                                err_text,
                            )
                            if attempt < max_retries - 1:
                                await asyncio.sleep(base_delay * (2**attempt))
                                continue
                            return None

                        if resp.status != 200:
                            err_text = await resp.text()
                            logger.error("Gemini API error %d: %s", resp.status, err_text)
                            return None

                        result = await resp.json()

                        if "candidates" not in result or not result["candidates"]:
                            logger.error("Gemini returned empty candidates: %s", result)
                            return None

                        content_text = result["candidates"][0]["content"]["parts"][0]["text"].strip()

                        # Extract JSON from code blocks if present
                        if content_text.startswith("```"):
                            lines = content_text.splitlines()
                            if lines[0].startswith("```"):
                                lines = lines[1:]
                            if lines and lines[-1].startswith("```"):
                                lines = lines[:-1]
                            content_text = "\n".join(lines).strip()

                        return json.loads(content_text)
            except (TimeoutError, aiohttp.ClientError) as e:
                logger.warning("Gemini call network error (attempt %d/%d): %s", attempt + 1, max_retries, e)
                if attempt < max_retries - 1:
                    await asyncio.sleep(base_delay * (2**attempt))
                    continue
                return None
            except Exception as e:
                logger.error("Gemini call failed: %s. Raw content: %s", e, content_text[:200])
                return None

        return None

    async def translate_and_enrich(self, text: str, source_lang: str) -> dict | None:
        """Translate word and generate example and CEFR level via Gemini."""
        lang_config = LANGUAGES.get(source_lang, {})
        lang_name = lang_config.get("name", source_lang)
        article_rule = lang_config.get("lex_rules", "lowercase.")

        system_prompt = f"""You are an expert lexicographer.
Translate words from word:{lang_name} into translation:Russian or translation:Russian to word:{lang_name}.
Rules:
- word: the input word/phrase itself in its base {lang_name} form, {article_rule}
Ensure the translated 'word' matches the Part of Speech of the input.
- translation: MOST common Russian translation in lowercase.
- level: CEFR level (A1-C2).
- example: natural {lang_name} sentence. Complexity MUST match the level.
- is_valid: false if input is gibberish, else true.
Return a single JSON object: {{"word": "", "translation": "", "example": "", "level": "", "is_valid": true}}"""

        user_prompt = f'Translate "{text}"'
        return await self._call_gemini(system_prompt, user_prompt, max_tokens=512)

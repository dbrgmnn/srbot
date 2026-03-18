import json
import logging
import google.generativeai as genai
from core.languages import LANGUAGES

logger = logging.getLogger(__name__)

class Translator:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    async def translate_and_enrich(self, text: str, hint_lang: str = None) -> dict | None:
        """
        Translates word, detects language, provides example and level.
        Returns dict or None if invalid.
        """
        prompt = f"""
        You are a senior linguistic expert for a language learning app (SRbot).
        Analyze the input text: "{text}"
        
        Tasks:
        1. Identify the source language (ISO 639-1 code).
        2. Provide the lemma (base form) of the word. 
           CRITICAL: If it's a noun, ALWAYS include the definite article (e.g., 'der Hund' for German, 'la table' for French).
        3. Translate it to Russian.
        4. Provide a natural example sentence in the source language.
           CRITICAL: The example must be strictly CEFR level B1, B2, or C1. Avoid simple A1/A2 sentences. 
           Use professional or literary context if appropriate.
        5. Determine the actual CEFR level of the word/phrase (A1-C2).
        6. Validate if it's a real word or a meaningful phrase.

        If a hint_lang is provided ("{hint_lang or 'none'}"), prioritize it but override if clearly wrong.

        Output ONLY valid JSON:
        {{
          "word": "lemma_with_article_if_noun",
          "language": "iso_code",
          "translation": "russian_translation",
          "example": "B1_plus_example_sentence",
          "level": "CEFR_level",
          "is_valid": true
        }}
        If "{text}" is gibberish, offensive, or not a word, set "is_valid": false.
        """

        try:
            response = await self.model.generate_content_async(
                prompt,
                generation_config={"response_mime_type": "application/json"}
            )
            data = json.loads(response.text)
            
            if not data.get("is_valid"):
                logger.warning(f"Invalid word detected by AI: {text}")
                return None
            
            # Final safety checks
            if len(data.get("word", "")) > 60 or len(data.get("translation", "")) > 100:
                logger.warning(f"AI returned suspicious data length for: {text}")
                return None

            # Normalize language code to what we support if possible
            lang = data.get("language", "").lower()
            if lang not in LANGUAGES:
                # If we don't support it, we still return it, 
                # but the caller will decide what to do.
                pass
                
            return data

        except Exception as e:
            logger.error(f"Translation error for '{text}': {e}")
            return None

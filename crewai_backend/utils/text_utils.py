"""
Text utility functions for cleaning and formatting text for TTS and display.
"""

import re
from typing import Optional


def clean_text_for_tts(text: str, max_length: Optional[int] = None) -> str:
    """
    Clean text to remove markdown formatting while preserving mathematical symbols.
    Removes formatting markers like asterisks for bold/italic, but keeps math operators.
    
    Args:
        text: Raw text from LLM
        max_length: Optional maximum character length (default: ~3000 chars for ~3-4 min speech)
    
    Returns:
        Cleaned text suitable for TTS
    """
    if not text:
        return ""
    
    # Remove markdown formatting (but preserve mathematical usage)
    # Bold: **text** -> text
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # Italic: *text* -> text (but be careful - might be multiplication in math context)
    # Only remove italic markers if they're clearly formatting (surrounding text, not between numbers/variables)
    text = re.sub(r'(?<![a-zA-Z0-9])\*([^*\s]+?)\*(?![a-zA-Z0-9])', r'\1', text)
    # Underline: __text__ -> text
    text = re.sub(r'__(.+?)__', r'\1', text)
    # Italic alt: _text_ -> text (but preserve underscores in variable names like x_1)
    # Only remove if it's clearly formatting (surrounding a word, not part of a variable)
    text = re.sub(r'(?<![a-zA-Z0-9])_([^_\s]+?)_(?![a-zA-Z0-9])', r'\1', text)
    # Inline code: `code` -> code
    text = re.sub(r'`([^`]+?)`', r'\1', text)
    # Code blocks: ```code``` -> (removed)
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Headers: # Header -> Header
    text = re.sub(r'#{1,6}\s+(.+?)(?:\n|$)', r'\1 ', text, flags=re.MULTILINE)
    
    # Remove URLs
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    
    # Remove email addresses
    text = re.sub(r'\S+@\S+', '', text)
    
    # Remove markdown links but keep the link text
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    
    # Remove LaTeX delimiters but keep the math content
    text = re.sub(r'\$([^$]+)\$', r'\1', text)  # Inline math: $x^2$ -> x^2
    text = re.sub(r'\$\$([\s\S]*?)\$\$', r'\1', text)  # Block math: keep content
    
    # Remove visual formatting markers that don't make sense in speech
    # Remove standalone formatting symbols, but preserve mathematical operators
    # Remove: | (vertical bar for markdown tables/separators), \ (escape), ~ (strikethrough), ^ (when used for formatting)
    # Keep: +, -, =, <, >, (, ), [, ] (for math), * (when clearly multiplication), etc.
    text = re.sub(r'[|\\~]', ' ', text)  # Remove formatting-only symbols
    
    # Remove multiple standalone asterisks used for formatting (like *** for horizontal rules)
    text = re.sub(r'\*{3,}', ' ', text)  # Three or more asterisks in a row
    text = re.sub(r'\s+\*\s+', ' ', text)  # Standalone asterisk surrounded by spaces (likely formatting)
    
    # Remove hash symbols used for markdown headers (already handled, but catch any remaining)
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    
    # Replace common math/technical symbols with spoken words (but keep the symbols readable)
    # These are mathematical symbols that should be spoken, not raw symbols
    text = text.replace('≠', ' not equal to ')
    text = text.replace('≈', ' approximately ')
    text = text.replace('≤', ' less than or equal to ')
    text = text.replace('≥', ' greater than or equal to ')
    text = text.replace('→', ' to ')
    text = text.replace('←', ' from ')
    text = text.replace('±', ' plus or minus ')
    text = text.replace('×', ' times ')
    text = text.replace('÷', ' divided by ')
    text = text.replace('√', ' square root of ')
    text = text.replace('∑', ' sum of ')
    text = text.replace('∫', ' integral of ')
    text = text.replace('π', ' pi ')
    text = text.replace('∞', ' infinity ')
    text = text.replace('∂', ' partial derivative ')
    text = text.replace('∆', ' delta ')
    text = text.replace('∇', ' nabla ')
    
    # Keep basic mathematical operators and symbols: +, -, =, <, >, (, ), [, ], *, ^
    # These are preserved as-is for TTS to handle naturally
    
    # Clean up multiple spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove leading/trailing whitespace
    text = text.strip()
    
    # Truncate if max_length specified
    if max_length and len(text) > max_length:
        # Truncate at word boundary to avoid cutting words
        truncated = text[:max_length]
        last_space = truncated.rfind(' ')
        if last_space > max_length * 0.8:  # Only if we found a space reasonably close
            text = truncated[:last_space] + '...'
        else:
            text = truncated + '...'
    
    return text


def truncate_text(text: str, max_words: int = 500, max_chars: Optional[int] = None) -> str:
    """
    Truncate text to a maximum number of words or characters.
    Prefers word boundaries when possible.
    
    Args:
        text: Text to truncate
        max_words: Maximum number of words (default: 500, roughly 3-4 min speech)
        max_chars: Optional maximum characters (overrides max_words if provided)
    
    Returns:
        Truncated text with ellipsis if needed
    """
    if not text:
        return ""
    
    if max_chars:
        if len(text) <= max_chars:
            return text
        # Truncate at word boundary
        truncated = text[:max_chars]
        last_space = truncated.rfind(' ')
        if last_space > max_chars * 0.8:
            return truncated[:last_space] + '...'
        return truncated + '...'
    
    words = text.split()
    if len(words) <= max_words:
        return text
    
    return ' '.join(words[:max_words]) + '...'


"""
Text utility functions for cleaning and formatting text for TTS and display.
"""

import re
from typing import Optional


def clean_text_for_tts(text: str, max_length: Optional[int] = None) -> str:
    """
    Clean text to remove symbols, markdown, and other non-speech elements
    that would make TTS speak nonsensical things.
    
    Args:
        text: Raw text from LLM
        max_length: Optional maximum character length (default: ~3000 chars for ~3-4 min speech)
    
    Returns:
        Cleaned text suitable for TTS
    """
    if not text:
        return ""
    
    # Remove markdown formatting
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)  # Bold
    text = re.sub(r'\*(.+?)\*', r'\1', text)  # Italic
    text = re.sub(r'__(.+?)__', r'\1', text)  # Underline
    text = re.sub(r'_(.+?)_', r'\1', text)  # Italic alt
    text = re.sub(r'`(.+?)`', r'\1', text)  # Inline code
    text = re.sub(r'```[\s\S]*?```', '', text)  # Code blocks
    text = re.sub(r'#{1,6}\s*(.+?)', r'\1', text)  # Headers
    
    # Remove URLs
    text = re.sub(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', '', text)
    
    # Remove email addresses
    text = re.sub(r'\S+@\S+', '', text)
    
    # Remove markdown links but keep the link text
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    
    # Remove LaTeX/math expressions (keep simple ones readable)
    text = re.sub(r'\$([^$]+)\$', r'\1', text)  # Inline math
    text = re.sub(r'\$\$[\s\S]*?\$\$', '', text)  # Block math
    
    # Remove special symbols that don't read well
    # Keep punctuation that's readable: . , ! ? : ; - ( ) " '
    # Remove: [] {} | \ / ~ ^ _ ` @ # $ % & * < > = + etc.
    text = re.sub(r'[\[\]{}|\\/~^`@#$%&*<>=\+]', '', text)
    
    # Replace common math/technical symbols with words
    text = text.replace('=', ' equals ')
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


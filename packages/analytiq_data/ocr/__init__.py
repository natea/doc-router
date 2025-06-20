"""OCR providers for doc-router"""

from .tesseract import run_tesseract, get_ocr_engine_info
from .config import OCRConfig, OCRProvider, get_ocr_runner

__all__ = [
    'run_tesseract', 
    'get_ocr_engine_info',
    'OCRConfig',
    'OCRProvider', 
    'get_ocr_runner'
]
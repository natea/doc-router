"""
Tesseract OCR provider for doc-router
Provides an alternative to AWS Textract using open-source Tesseract OCR
"""

import asyncio
import logging
import tempfile
import uuid
from datetime import datetime
from typing import List, Dict, Any
from pdf2image import convert_from_bytes
import pytesseract
from PIL import Image
import io

logger = logging.getLogger(__name__)


async def run_tesseract(
    analytiq_client,
    blob: bytes,
    feature_types: list = [],
    query_list: list = None
) -> List[Dict[str, Any]]:
    """
    Run Tesseract OCR on a blob and return blocks in Textract-compatible format.
    
    Args:
        analytiq_client: Analytiq client
        blob: Bytes to be OCR'd (PDF or image)
        feature_types: List of feature types (compatibility param, not used by Tesseract)
        query_list: List of queries (compatibility param, not used by Tesseract)
    
    Returns:
        List of blocks in Textract-compatible format
    """
    logger.info(f"Starting Tesseract OCR processing")
    
    try:
        # Convert PDF to images if needed
        images = []
        try:
            # Try to convert as PDF first
            images = convert_from_bytes(blob, dpi=300)
            logger.info(f"Converted PDF to {len(images)} images")
        except Exception as e:
            # If not a PDF, treat as image
            logger.info(f"Not a PDF, treating as image: {e}")
            image = Image.open(io.BytesIO(blob))
            images = [image]
        
        blocks = []
        block_id_counter = 0
        
        # Process each page
        for page_num, image in enumerate(images, 1):
            logger.info(f"Processing page {page_num}/{len(images)}")
            
            # Get OCR data with bounding boxes
            ocr_data = pytesseract.image_to_data(
                image, 
                output_type=pytesseract.Output.DICT,
                config='--psm 3'  # Fully automatic page segmentation
            )
            
            # Convert image dimensions for coordinate normalization
            img_width, img_height = image.size
            
            # Process OCR results into Textract-compatible blocks
            page_text_lines = []
            current_line = []
            current_line_top = None
            
            for i in range(len(ocr_data['text'])):
                if ocr_data['text'][i].strip():  # Non-empty text
                    # Create word block
                    word_block = {
                        'BlockType': 'WORD',
                        'Id': str(uuid.uuid4()),
                        'Text': ocr_data['text'][i],
                        'Confidence': float(ocr_data['conf'][i]) if ocr_data['conf'][i] > 0 else 50.0,
                        'Page': page_num,
                        'Geometry': {
                            'BoundingBox': {
                                'Width': ocr_data['width'][i] / img_width,
                                'Height': ocr_data['height'][i] / img_height,
                                'Left': ocr_data['left'][i] / img_width,
                                'Top': ocr_data['top'][i] / img_height
                            }
                        }
                    }
                    blocks.append(word_block)
                    
                    # Group words into lines based on vertical position
                    if current_line_top is None or abs(ocr_data['top'][i] - current_line_top) < 10:
                        current_line.append(word_block)
                        current_line_top = ocr_data['top'][i]
                    else:
                        # Start new line
                        if current_line:
                            page_text_lines.append(current_line)
                        current_line = [word_block]
                        current_line_top = ocr_data['top'][i]
            
            # Add last line
            if current_line:
                page_text_lines.append(current_line)
            
            # Create LINE blocks from grouped words
            for line_words in page_text_lines:
                if line_words:
                    line_text = ' '.join([w['Text'] for w in line_words])
                    
                    # Calculate line bounding box
                    min_left = min(w['Geometry']['BoundingBox']['Left'] for w in line_words)
                    max_right = max(w['Geometry']['BoundingBox']['Left'] + w['Geometry']['BoundingBox']['Width'] for w in line_words)
                    min_top = min(w['Geometry']['BoundingBox']['Top'] for w in line_words)
                    max_bottom = max(w['Geometry']['BoundingBox']['Top'] + w['Geometry']['BoundingBox']['Height'] for w in line_words)
                    
                    line_block = {
                        'BlockType': 'LINE',
                        'Id': str(uuid.uuid4()),
                        'Text': line_text,
                        'Page': page_num,
                        'Confidence': sum(w.get('Confidence', 50.0) for w in line_words) / len(line_words),
                        'Geometry': {
                            'BoundingBox': {
                                'Width': max_right - min_left,
                                'Height': max_bottom - min_top,
                                'Left': min_left,
                                'Top': min_top
                            }
                        },
                        'Relationships': [{
                            'Type': 'CHILD',
                            'Ids': [w['Id'] for w in line_words]
                        }]
                    }
                    blocks.append(line_block)
            
            # Create PAGE block
            page_block = {
                'BlockType': 'PAGE',
                'Id': str(uuid.uuid4()),
                'Page': page_num,
                'Geometry': {
                    'BoundingBox': {
                        'Width': 1.0,
                        'Height': 1.0,
                        'Left': 0.0,
                        'Top': 0.0
                    }
                }
            }
            blocks.append(page_block)
            
            await asyncio.sleep(0)  # Yield control for async processing
        
        logger.info(f"Tesseract OCR completed with {len(blocks)} blocks")
        return blocks
        
    except Exception as e:
        logger.error(f"Error running Tesseract OCR: {e}")
        raise


def get_ocr_engine_info() -> Dict[str, str]:
    """
    Get information about the Tesseract OCR engine
    
    Returns:
        Dict with engine information
    """
    try:
        version = pytesseract.get_tesseract_version()
        return {
            "engine": "Tesseract",
            "version": str(version),
            "languages": pytesseract.get_languages()
        }
    except Exception as e:
        logger.error(f"Error getting Tesseract info: {e}")
        return {
            "engine": "Tesseract",
            "version": "unknown",
            "error": str(e)
        }
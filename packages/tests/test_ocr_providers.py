"""
Test suite for comparing OCR providers (Tesseract vs Textract)
"""

import asyncio
import os
import time
import json
from typing import Dict, Any, List
import pytest
import tempfile
from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
import io

import analytiq_data as ad
from analytiq_data.ocr import OCRConfig, OCRProvider, get_ocr_runner
from analytiq_data.aws.textract import run_textract, get_block_map, get_page_text_map
from analytiq_data.ocr.tesseract import run_tesseract


class OCRTestResults:
    """Container for OCR test results"""
    def __init__(self):
        self.results = {
            "textract": {},
            "tesseract": {}
        }
    
    def add_result(self, provider: str, test_name: str, metrics: Dict[str, Any]):
        """Add test results for a provider"""
        self.results[provider][test_name] = metrics
    
    def get_comparison(self) -> Dict[str, Any]:
        """Get comparison of results between providers"""
        comparison = {}
        for test_name in self.results["textract"]:
            if test_name in self.results["tesseract"]:
                comparison[test_name] = {
                    "textract": self.results["textract"][test_name],
                    "tesseract": self.results["tesseract"][test_name]
                }
        return comparison


@pytest.fixture
def ocr_test_results():
    """Fixture for collecting test results"""
    return OCRTestResults()


@pytest.fixture
def sample_text_image():
    """Create a simple test image with text"""
    # Create image
    width, height = 800, 600
    img = Image.new('RGB', (width, height), color='white')
    draw = ImageDraw.Draw(img)
    
    # Add test text
    test_text = [
        "This is a test document",
        "Created for OCR testing",
        "Line 3: Testing accuracy",
        "Line 4: Special chars: @#$%",
        "Line 5: Numbers: 12345"
    ]
    
    y_position = 50
    for line in test_text:
        draw.text((50, y_position), line, fill='black')
        y_position += 40
    
    # Convert to bytes
    img_bytes = io.BytesIO()
    img.save(img_bytes, format='PNG')
    return img_bytes.getvalue(), test_text


@pytest.fixture  
def sample_pdf():
    """Create a simple test PDF"""
    pdf_bytes = io.BytesIO()
    c = canvas.Canvas(pdf_bytes, pagesize=letter)
    
    # Page 1
    c.drawString(100, 750, "Test PDF Document")
    c.drawString(100, 700, "Page 1 of 2")
    c.drawString(100, 650, "This is line 3")
    c.drawString(100, 600, "Testing OCR accuracy: 98.5%")
    c.showPage()
    
    # Page 2
    c.drawString(100, 750, "Page 2 Header")
    c.drawString(100, 700, "More test content")
    c.drawString(100, 650, "Final line of text")
    c.save()
    
    expected_text = {
        1: ["Test PDF Document", "Page 1 of 2", "This is line 3", "Testing OCR accuracy: 98.5%"],
        2: ["Page 2 Header", "More test content", "Final line of text"]
    }
    
    return pdf_bytes.getvalue(), expected_text


@pytest.mark.asyncio
async def test_ocr_image_processing(sample_text_image, ocr_test_results):
    """Test OCR on a simple image for both providers"""
    img_bytes, expected_lines = sample_text_image
    analytiq_client = ad.common.get_analytiq_client()
    
    # Test Textract
    if os.getenv("AWS_ACCESS_KEY_ID"):
        start_time = time.time()
        textract_blocks = await run_textract(analytiq_client, img_bytes)
        textract_time = time.time() - start_time
        
        block_map = get_block_map(textract_blocks)
        page_text_map = get_page_text_map(block_map)
        textract_text = page_text_map.get(1, "")
        
        ocr_test_results.add_result("textract", "image_processing", {
            "time": textract_time,
            "blocks": len(textract_blocks),
            "text_length": len(textract_text),
            "detected_lines": textract_text.count('\n')
        })
    
    # Test Tesseract
    start_time = time.time()
    tesseract_blocks = await run_tesseract(analytiq_client, img_bytes)
    tesseract_time = time.time() - start_time
    
    block_map = get_block_map(tesseract_blocks)
    page_text_map = get_page_text_map(block_map)
    tesseract_text = page_text_map.get(1, "")
    
    ocr_test_results.add_result("tesseract", "image_processing", {
        "time": tesseract_time,
        "blocks": len(tesseract_blocks),
        "text_length": len(tesseract_text),
        "detected_lines": tesseract_text.count('\n')
    })
    
    # Basic assertions
    assert len(tesseract_blocks) > 0
    assert len(tesseract_text) > 0


@pytest.mark.asyncio
async def test_ocr_pdf_processing(sample_pdf, ocr_test_results):
    """Test OCR on a PDF for both providers"""
    pdf_bytes, expected_pages = sample_pdf
    analytiq_client = ad.common.get_analytiq_client()
    
    # Test Textract
    if os.getenv("AWS_ACCESS_KEY_ID"):
        start_time = time.time()
        textract_blocks = await run_textract(analytiq_client, pdf_bytes)
        textract_time = time.time() - start_time
        
        block_map = get_block_map(textract_blocks)
        page_text_map = get_page_text_map(block_map)
        
        ocr_test_results.add_result("textract", "pdf_processing", {
            "time": textract_time,
            "blocks": len(textract_blocks),
            "pages": len(page_text_map),
            "total_text_length": sum(len(text) for text in page_text_map.values())
        })
    
    # Test Tesseract
    start_time = time.time()
    tesseract_blocks = await run_tesseract(analytiq_client, pdf_bytes)
    tesseract_time = time.time() - start_time
    
    block_map = get_block_map(tesseract_blocks)
    page_text_map = get_page_text_map(block_map)
    
    ocr_test_results.add_result("tesseract", "pdf_processing", {
        "time": tesseract_time,
        "blocks": len(tesseract_blocks),
        "pages": len(page_text_map),
        "total_text_length": sum(len(text) for text in page_text_map.values())
    })
    
    # Assertions
    assert len(tesseract_blocks) > 0
    assert len(page_text_map) == 2  # We created a 2-page PDF


@pytest.mark.asyncio
async def test_ocr_provider_switching():
    """Test switching between OCR providers"""
    analytiq_client = ad.common.get_analytiq_client()
    config = OCRConfig(analytiq_client)
    
    # Get current provider
    original_provider = await config.get_provider()
    
    # Switch to Tesseract
    await config.set_provider(OCRProvider.TESSERACT)
    assert await config.get_provider() == OCRProvider.TESSERACT
    
    # Get OCR runner - should be Tesseract
    runner = await get_ocr_runner(analytiq_client)
    assert runner.__name__ == "run_tesseract"
    
    # Switch to Textract (if available)
    if os.getenv("AWS_ACCESS_KEY_ID"):
        await config.set_provider(OCRProvider.TEXTRACT)
        assert await config.get_provider() == OCRProvider.TEXTRACT
        
        runner = await get_ocr_runner(analytiq_client)
        assert runner.__name__ == "run_textract"
    
    # Restore original provider
    await config.set_provider(original_provider)


@pytest.mark.asyncio
async def test_ocr_accuracy_comparison(sample_text_image, ocr_test_results):
    """Compare OCR accuracy between providers"""
    img_bytes, expected_lines = sample_text_image
    analytiq_client = ad.common.get_analytiq_client()
    
    def calculate_accuracy(detected_text: str, expected_lines: List[str]) -> float:
        """Simple accuracy calculation based on line matching"""
        detected_lines = [line.strip() for line in detected_text.split('\n') if line.strip()]
        matches = 0
        for expected in expected_lines:
            for detected in detected_lines:
                if expected.lower() in detected.lower():
                    matches += 1
                    break
        return (matches / len(expected_lines)) * 100 if expected_lines else 0
    
    # Test both providers
    results = {}
    
    # Textract
    if os.getenv("AWS_ACCESS_KEY_ID"):
        textract_blocks = await run_textract(analytiq_client, img_bytes)
        block_map = get_block_map(textract_blocks)
        page_text_map = get_page_text_map(block_map)
        textract_text = page_text_map.get(1, "")
        textract_accuracy = calculate_accuracy(textract_text, expected_lines)
        
        results["textract"] = {
            "accuracy": textract_accuracy,
            "text": textract_text
        }
    
    # Tesseract
    tesseract_blocks = await run_tesseract(analytiq_client, img_bytes)
    block_map = get_block_map(tesseract_blocks)
    page_text_map = get_page_text_map(block_map)
    tesseract_text = page_text_map.get(1, "")
    tesseract_accuracy = calculate_accuracy(tesseract_text, expected_lines)
    
    results["tesseract"] = {
        "accuracy": tesseract_accuracy,
        "text": tesseract_text
    }
    
    # Add results
    ocr_test_results.add_result("textract", "accuracy", results.get("textract", {}))
    ocr_test_results.add_result("tesseract", "accuracy", results["tesseract"])
    
    # Basic assertion
    assert tesseract_accuracy > 0


def test_print_comparison_results(ocr_test_results):
    """Print comparison results at the end of tests"""
    comparison = ocr_test_results.get_comparison()
    
    print("\n\n=== OCR Provider Comparison Results ===\n")
    
    for test_name, results in comparison.items():
        print(f"\nTest: {test_name}")
        print("-" * 40)
        
        if "textract" in results and "tesseract" in results:
            textract = results["textract"]
            tesseract = results["tesseract"]
            
            # Time comparison
            if "time" in textract and "time" in tesseract:
                print(f"Processing Time:")
                print(f"  Textract:  {textract['time']:.2f}s")
                print(f"  Tesseract: {tesseract['time']:.2f}s")
                print(f"  Difference: {abs(textract['time'] - tesseract['time']):.2f}s")
            
            # Accuracy comparison
            if "accuracy" in textract and "accuracy" in tesseract:
                print(f"\nAccuracy:")
                print(f"  Textract:  {textract['accuracy']:.1f}%")
                print(f"  Tesseract: {tesseract['accuracy']:.1f}%")
    
    # Save results to file
    with open("ocr_comparison_results.json", "w") as f:
        json.dump(comparison, f, indent=2)
    print("\n\nDetailed results saved to ocr_comparison_results.json")


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "-s"])
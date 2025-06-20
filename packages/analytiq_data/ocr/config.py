"""
OCR provider configuration for doc-router
Allows switching between different OCR providers (Textract, Tesseract, etc.)
"""

import os
import logging
from typing import Dict, Any, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class OCRProvider(Enum):
    """Available OCR providers"""
    TEXTRACT = "textract"
    TESSERACT = "tesseract"
    
    @classmethod
    def from_string(cls, value: str) -> 'OCRProvider':
        """Convert string to OCRProvider enum"""
        value = value.lower()
        for provider in cls:
            if provider.value == value:
                return provider
        raise ValueError(f"Unknown OCR provider: {value}")


class OCRConfig:
    """OCR configuration management"""
    
    def __init__(self, analytiq_client):
        self.analytiq_client = analytiq_client
        self._config = None
        
    async def get_config(self) -> Dict[str, Any]:
        """
        Get OCR configuration from database or environment
        
        Returns:
            Dict with OCR configuration
        """
        if self._config is not None:
            return self._config
            
        # Try to get from database first
        db = self.analytiq_client.mongodb[self.analytiq_client.env]
        config_collection = db.get("ocr_config", None)
        
        if config_collection is not None:
            config = config_collection.find_one({"_id": "default"})
            if config:
                self._config = config
                logger.info(f"Loaded OCR config from database: {config}")
                return config
        
        # Fall back to environment variables
        provider_str = os.getenv("OCR_PROVIDER", "textract").lower()
        
        self._config = {
            "provider": provider_str,
            "tesseract": {
                "dpi": int(os.getenv("TESSERACT_DPI", "300")),
                "psm": int(os.getenv("TESSERACT_PSM", "3")),
                "languages": os.getenv("TESSERACT_LANGUAGES", "eng")
            },
            "textract": {
                "feature_types": os.getenv("TEXTRACT_FEATURES", "").split(",") if os.getenv("TEXTRACT_FEATURES") else []
            }
        }
        
        logger.info(f"Using OCR config from environment: {self._config}")
        return self._config
    
    async def set_config(self, config: Dict[str, Any]) -> None:
        """
        Save OCR configuration to database
        
        Args:
            config: OCR configuration dict
        """
        db = self.analytiq_client.mongodb[self.analytiq_client.env]
        config_collection = db["ocr_config"]
        
        config["_id"] = "default"
        config_collection.replace_one({"_id": "default"}, config, upsert=True)
        
        self._config = config
        logger.info(f"Saved OCR config to database: {config}")
    
    async def get_provider(self) -> OCRProvider:
        """
        Get the configured OCR provider
        
        Returns:
            OCRProvider enum value
        """
        config = await self.get_config()
        return OCRProvider.from_string(config.get("provider", "textract"))
    
    async def set_provider(self, provider: OCRProvider) -> None:
        """
        Set the OCR provider
        
        Args:
            provider: OCRProvider enum value
        """
        config = await self.get_config()
        config["provider"] = provider.value
        await self.set_config(config)
    
    async def get_provider_config(self, provider: Optional[OCRProvider] = None) -> Dict[str, Any]:
        """
        Get configuration for a specific provider
        
        Args:
            provider: OCRProvider enum value (defaults to current provider)
            
        Returns:
            Provider-specific configuration dict
        """
        if provider is None:
            provider = await self.get_provider()
            
        config = await self.get_config()
        return config.get(provider.value, {})


async def get_ocr_runner(analytiq_client):
    """
    Get the appropriate OCR runner function based on configuration
    
    Args:
        analytiq_client: Analytiq client instance
        
    Returns:
        OCR runner function (run_textract or run_tesseract)
    """
    config = OCRConfig(analytiq_client)
    provider = await config.get_provider()
    
    if provider == OCRProvider.TEXTRACT:
        # Import here to avoid circular dependencies
        from ..aws.textract import run_textract
        logger.info("Using AWS Textract OCR provider")
        return run_textract
    elif provider == OCRProvider.TESSERACT:
        from .tesseract import run_tesseract
        logger.info("Using Tesseract OCR provider")
        return run_tesseract
    else:
        raise ValueError(f"Unknown OCR provider: {provider}")
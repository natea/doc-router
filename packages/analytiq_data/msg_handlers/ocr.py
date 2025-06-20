import asyncio
import json
import logging
import analytiq_data as ad
from ..ocr import get_ocr_runner, OCRConfig

logger = logging.getLogger(__name__)

async def process_ocr_msg(analytiq_client, msg, force:bool=False):
    """
    Process an OCR message

    Args:
        analytiq_client : AnalytiqClient
            The analytiq client
        msg : dict
            The OCR message
        force : bool
            Whether to force the processing
    """
    # Implement your job processing logic here
    logger.info(f"Processing OCR msg: {msg}")
    logger.info(f"Force: {force}")

    msg_id = msg["_id"]

    try:
        document_id = msg["msg"]["document_id"]
        
        # Update state to OCR processing
        await ad.common.doc.update_doc_state(analytiq_client, document_id, ad.common.doc.DOCUMENT_STATE_OCR_PROCESSING)
        
        # Get the appropriate OCR runner based on configuration
        ocr_runner = await get_ocr_runner(analytiq_client)
        ocr_config = OCRConfig(analytiq_client)
        provider = await ocr_config.get_provider()
        
        # Check if AWS client is needed (for Textract)
        if provider.value == "textract":
            aws_client = ad.aws.get_aws_client(analytiq_client)
            if aws_client.textract is None:
                raise Exception(f"AWS textract client not created. Skipping OCR.")

        ocr_json = None
        if not force:
            # Check if the OCR text already exists
            ocr_json = ad.common.get_ocr_json(analytiq_client, document_id)
            if ocr_json is not None:
                logger.info(f"OCR list for {document_id} already exists. Skipping OCR.")        
        
        if ocr_json is None:            
            # Get the file
            doc = await ad.common.doc.get_doc(analytiq_client, document_id)
            if not doc or "mongo_file_name" not in doc:
                logger.error(f"Document metadata for {document_id} not found or missing mongo_file_name. Skipping OCR.")
                await ad.common.doc.update_doc_state(analytiq_client, document_id, ad.common.doc.DOCUMENT_STATE_OCR_FAILED)
                return

            # Use the PDF file if available, otherwise fallback to original
            pdf_file_name = doc.get("pdf_file_name")
            if pdf_file_name is None:
                logger.error(f"Document metadata for {document_id} not found or missing pdf_file_name. Skipping OCR.")
                await ad.common.doc.update_doc_state(analytiq_client, document_id, ad.common.doc.DOCUMENT_STATE_OCR_FAILED)
                return

            file = ad.common.get_file(analytiq_client, pdf_file_name)
            if file is None:
                logger.error(f"File for {document_id} not found. Skipping OCR.")
                await ad.common.doc.update_doc_state(analytiq_client, document_id, ad.common.doc.DOCUMENT_STATE_OCR_FAILED)
                return

            # Run OCR using configured provider
            ocr_json = await ocr_runner(analytiq_client, file["blob"])
            logger.info(f"OCR completed for {document_id} using {provider.value}")

            # Save the OCR dictionary
            ad.common.save_ocr_json(analytiq_client, document_id, ocr_json)
            logger.info(f"OCR list for {document_id} has been saved.")
        
        # Extract the text
        ad.common.save_ocr_text_from_list(analytiq_client, document_id, ocr_json, force=force)
        logger.info(f"OCR text for {document_id} has been saved.")
        # Update state to OCR completed
        await ad.common.doc.update_doc_state(analytiq_client, document_id, ad.common.doc.DOCUMENT_STATE_OCR_COMPLETED)

        # Post a message to the llm job queue
        msg = {"document_id": document_id}
        await ad.queue.send_msg(analytiq_client, "llm", msg=msg)
    
    except Exception as e:
        logger.error(f"Error processing OCR msg: {e}")
        
        # Update state to OCR failed
        if 'document_id' in locals():
            await ad.common.doc.update_doc_state(analytiq_client, document_id, ad.common.doc.DOCUMENT_STATE_OCR_FAILED)

        # Save the message to the ocr_err queue
        await ad.queue.send_msg(analytiq_client, "ocr_err", msg=msg)

    # Delete the message from the ocr queue
    await ad.queue.delete_msg(analytiq_client, "ocr", msg_id)
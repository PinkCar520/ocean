from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
import os
import shutil
import tempfile
from openai import OpenAI
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/internal/audio", tags=["audio"])

@router.post("/transcriptions/chunk")
async def transcribe_audio_chunk(file: UploadFile = File(...)):
    """
    接收前端通过 MediaRecorder 切片的音频流，
    调用 Whisper 进行快速转录，返回文本。
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    provider = os.getenv("DEFAULT_AI_PROVIDER", "openai").upper()
    api_key = os.getenv(f"{provider}_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = os.getenv(f"{provider}_BASE_URL") or os.getenv("OPENAI_BASE_URL")
    
    if not api_key:
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")
        
    client = OpenAI(
        api_key=api_key,
        base_url=base_url if base_url else None
    )

    try:
        # Create a temporary file to save the uploaded audio
        # Whisper requires a filename with a recognized audio extension
        # MediaRecorder usually sends .webm or .ogg depending on browser
        ext = ".webm"
        if file.filename and "." in file.filename:
            ext = "." + file.filename.split(".")[-1]
            
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
            shutil.copyfileobj(file.file, tmp_file)
            tmp_path = tmp_file.name

        # Call OpenAI Whisper API
        with open(tmp_path, "rb") as audio_file:
            transcript = client.audio.transcriptions.create(
                model="whisper-1", 
                file=audio_file,
                # whisper-1 is very sensitive to very short silent chunks, it might hallucinate
                # We can optionally add a prompt parameter to guide it or set temperature to 0
                temperature=0.0
            )

        # Cleanup
        os.unlink(tmp_path)
        
        text = transcript.text.strip() if hasattr(transcript, "text") else ""
        return {"success": True, "text": text}
        
    except Exception as e:
        logger.error(f"Failed to transcribe audio chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))

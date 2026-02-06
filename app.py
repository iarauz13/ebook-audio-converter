from flask import Flask, render_template, request, send_file, redirect, url_for
import os
import asyncio
import threading
from werkzeug.utils import secure_filename
from src.extractors import extract_chapters_using_toc, extract_text_fallback, extract_text_from_pdf
from src.generators import text_to_speech, text_to_pdf, generate_cover_image, inject_id3_tags
from src.voices import get_recommended_voices
from ebooklib import epub

app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'downloads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

@app.route('/')
def index():
    voices = get_recommended_voices()
    return render_template('index.html', voices=voices)

@app.route('/convert', methods=['POST'])
def convert():
    if 'file' not in request.files:
        return redirect(request.url)
    
    file = request.files['file']
    if file.filename == '':
        return redirect(request.url)
    
    if file:
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        voice = request.form.get('voice')
        # Handle 'default' case if user didn't pick
        if not voice: voice = "en-US-AvaNeural"
        
        # Simple processing for now (blocking)
        # In a real app, use Celery/Redis
        try:
            output_filename = process_book(filepath, voice)
            return send_file(output_filename, as_attachment=True)
        except Exception as e:
            return f"Error: {e}"

def process_book(filepath, voice):
    """
    Simplified conversion logic for the web app.
    Always converts to a single MP3 for simplicity.
    """
    # 1. Extract Text
    if filepath.lower().endswith('.pdf'):
        chapters, _ = extract_text_from_pdf(filepath)
        book_title = os.path.basename(filepath).replace('.pdf', '')
        author = "Unknown Author"
    else:
        book = epub.read_epub(filepath)
        book_title = book.get_metadata('DC', 'title')[0][0] if book.get_metadata('DC', 'title') else "Unknown Title"
        author = book.get_metadata('DC', 'creator')[0][0] if book.get_metadata('DC', 'creator') else "Unknown Author"
        
        chapters, _ = extract_chapters_using_toc(book)
        if not chapters:
            chapters, _ = extract_text_fallback(book)
            
    if not chapters:
        raise Exception("No text found in book")
        
    full_text = "\n\n".join([c['text'] for c in chapters])
    
    # 2. Convert
    output_filename = os.path.join(OUTPUT_FOLDER, f"{book_title}.mp3")
    
    # Run async function in sync wrapper
    asyncio.run(text_to_speech(full_text, output_filename, voice))
    
    # 3. Tag
    cover_bytes = generate_cover_image(book_title, author)
    inject_id3_tags(output_filename, book_title, author, book_title, 1, 1, cover_bytes)
    
    return output_filename

if __name__ == '__main__':
    app.run(debug=True, port=5000)

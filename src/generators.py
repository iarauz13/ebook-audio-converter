import io
import edge_tts
import mutagen
from mutagen.id3 import ID3, TIT2, TPE1, TALB, TRCK, APIC
from PIL import Image, ImageDraw, ImageFont
from xhtml2pdf import pisa

async def text_to_speech(text, output_file, voice, rate=None):
    """Generates audio for the given text."""
    if rate:
        communicate = edge_tts.Communicate(text, voice, rate=rate)
    else:
        communicate = edge_tts.Communicate(text, voice)
    await communicate.save(output_file)

def generate_cover_image(title, author):
    """Generates a simple cover image."""
    width, height = 600, 600
    color = (44, 62, 80) # Dark Blue Grey
    text_color = (255, 255, 255)
    
    img = Image.new('RGB', (width, height), color)
    d = ImageDraw.Draw(img)
    
    # Try to use a default font, otherwise use default
    try:
        # MacOS default font path
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 40)
        font_small = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 30)
    except:
        font = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Draw Text (Centered roughly)
    d.text((width/2, height/3), title[:30], fill=text_color, anchor="mm", font=font)
    if len(title) > 30:
         d.text((width/2, height/3 + 50), title[30:], fill=text_color, anchor="mm", font=font)
         
    d.text((width/2, 2*height/3), author, fill=text_color, anchor="mm", font=font_small)
    
    img_byte_arr = io.BytesIO()
    img.save(img_byte_arr, format='JPEG')
    return img_byte_arr.getvalue()

def inject_id3_tags(filepath, title, author, album, track_num, total_tracks, cover_bytes=None):
    """Injects ID3 tags into the MP3 file."""
    try:
        audio = ID3(filepath)
    except mutagen.id3.ID3NoHeaderError:
        audio = ID3()
    
    # Title
    audio.add(TIT2(encoding=3, text=title))
    # Author
    audio.add(TPE1(encoding=3, text=author))
    # Album
    audio.add(TALB(encoding=3, text=album))
    # Track Number
    audio.add(TRCK(encoding=3, text=f"{track_num}/{total_tracks}"))
    
    # Cover Art
    if cover_bytes:
        audio.add(APIC(
            encoding=3,
            mime='image/jpeg',
            type=3, # 3 is for the cover(front) image
            desc='Cover',
            data=cover_bytes
        ))
        
    audio.save(filepath)

def text_to_pdf(text, title, output_file):
    """Generates PDF for the given text."""
    html_content = f"""
    <html>
    <body>
    <h1>{title}</h1>
    <p style="font-size: 12pt; line-height: 1.5; font-family: Helvetica, sans-serif;">
    {text.replace(chr(10), '<br/>')}
    </p>
    </body>
    </html>
    """
    
    with open(output_file, "wb") as pdf_file:
        pisa_status = pisa.CreatePDF(html_content, dest=pdf_file)
    
    if pisa_status.err:
        print(f"Error generating PDF: {pisa_status.err}")

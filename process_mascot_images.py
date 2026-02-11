import os
from rembg import remove
from PIL import Image
import sys

def process_images(input_dir, output_dir):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Get all images
    files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
    
    if not files:
        print(f"No images found in {input_dir}")
        return

    print(f"Found {len(files)} images to process.")

    for filename in files:
        input_path = os.path.join(input_dir, filename)
        output_filename = os.path.splitext(filename)[0] + "_nobg.png"
        output_path = os.path.join(output_dir, output_filename)

        print(f"Processing {filename}...")
        
        try:
            input_image = Image.open(input_path)
            output_image = remove(input_image)
            output_image.save(output_path)
            print(f"Saved to {output_path}")
        except Exception as e:
            print(f"Failed to process {filename}: {e}")

if __name__ == "__main__":
    input_folder = "Echo_Mascot"
    output_folder = "Echo_Mascot_Processed"
    
    if not os.path.exists(input_folder):
        print(f"Error: Input folder '{input_folder}' does not exist.")
        sys.exit(1)

    process_images(input_folder, output_folder)

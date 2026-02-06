import os
import json
import time

def load_progress(output_dir):
    """Loads the progress JSON file."""
    progress_file = os.path.join(output_dir, "progress.json")
    if os.path.exists(progress_file):
        try:
            with open(progress_file, 'r') as f:
                return json.load(f)
        except:
            return {}
    return {}

def save_progress(output_dir, chapter_index, chapter_title):
    """Marks a chapter as complete in the progress file."""
    progress = load_progress(output_dir)
    progress[str(chapter_index)] = {"title": chapter_title, "status": "done", "timestamp": time.time()}
    
    progress_file = os.path.join(output_dir, "progress.json")
    with open(progress_file, 'w') as f:
        json.dump(progress, f, indent=2)

import os
import os
from datetime import datetime

def combine_files_to_markdown(output_filename="files.md"):
    # Get the directory where the script is located
    current_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(current_dir, output_filename)
    
    # Get total file count for the frontmatter metadata
    total_files = 0
    for root, dirs, files in os.walk(current_dir):
        for file in files:
            if os.path.join(root, file) != output_path:
                total_files += 1

    with open(output_path, "w", encoding="utf-8") as outfile:
        # 1. Write YAML Frontmatter
        outfile.write("---\n")
        outfile.write(f"title: Folder Code Compilation\n")
        outfile.write(f"date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        outfile.write(f"root_folder: \"{os.path.basename(current_dir)}\"\n")
        outfile.write(f"total_compiled_files: {total_files}\n")
        outfile.write("---\n\n")
        
        # 2. Walk through all directories and files
        for root, dirs, files in os.walk(current_dir):
            for file in files:
                file_path = os.path.join(root, file)
                
                # Skip the output file itself
                if file_path == output_path:
                    continue
                    
                relative_path = os.path.relpath(file_path, current_dir)
                
                # Write the file location header
                outfile.write(f"# File: {relative_path}\n\n")
                
                try:
                    with open(file_path, "r", encoding="utf-8", errors="replace") as infile:
                        content = infile.read()
                        outfile.write(content)
                except Exception as e:
                    outfile.write(f"*Error reading this file: {str(e)}*")
                
                # Add spacing between files
                outfile.write("\n\n---\n\n")
                
    print(f"Successfully created {output_filename} with YAML frontmatter.")

if __name__ == "__main__":
    combine_files_to_markdown()



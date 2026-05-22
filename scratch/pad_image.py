import os
from PIL import Image, ImageFilter

image_path = "/Users/alejandrochitu/.gemini/antigravity/brain/b2057855-e639-46e0-a4a7-a12780494f77/xcron_moats_architecture_1779354442745.png"
output_path = "/Users/alejandrochitu/.gemini/antigravity/brain/b2057855-e639-46e0-a4a7-a12780494f77/xcron_moats_widescreen_padded.png"

# Load original image
img = Image.open(image_path)
width, height = img.size

# Target aspect ratio is 16:9
target_width = int(height * 16 / 9)
target_height = height

# Create background: a blurred and scaled version of the original image for a modern, seamless look
# Resize to target width, height
bg = img.resize((target_width, target_height))
bg = bg.filter(ImageFilter.GaussianBlur(radius=30))

# Also apply a slight darkening to the background to keep focus on the center
darken = Image.new("RGB", bg.size, (0, 0, 0))
bg = Image.blend(bg, darken, alpha=0.6)

# Paste the original image in the center
offset_x = (target_width - width) // 2
offset_y = (target_height - height) // 2
bg.paste(img, (offset_x, offset_y))

# Save the final image
bg.save(output_path, "PNG")
print(f"Successfully created padded 16:9 image at {output_path}")

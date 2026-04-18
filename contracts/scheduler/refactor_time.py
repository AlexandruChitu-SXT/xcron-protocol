import os
import glob
import re

src_dir = '/Users/alejandrochitu/xcron-protocol/contracts/scheduler/src'
files = glob.glob(os.path.join(src_dir, '*.rs'))

pattern = re.compile(
    r'self\s*\n\s*\.blockchain\(\)\s*\n\s*\.get_block_timestamp_seconds\(\)\s*\n\s*\.as_u64_seconds\(\)|self\.blockchain\(\)\.get_block_timestamp_seconds\(\)\.as_u64_seconds\(\)'
)

for filepath in files:
    # skip helpers.rs as we already formatted it
    if 'helpers.rs' in filepath:
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    new_content = pattern.sub('self.get_safe_block_timestamp()', content)
    
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {os.path.basename(filepath)}")

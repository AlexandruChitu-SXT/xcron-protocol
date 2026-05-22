import os, glob
for path in glob.glob('/Users/alejandrochitu/xcron-protocol/contracts/**/Cargo.toml', recursive=True):
    with open(path, 'r') as f: content = f.read()
    content = content.replace('"0.65.0"', '"0.66.0"').replace('"0.65.1"', '"0.66.0"').replace('"=0.65.0"', '"0.66.0"')
    with open(path, 'w') as f: f.write(content)

---
name: reading-chinese-doc-files
description: Read old .doc files (Chinese/UTF-16LE encoded) in WSL using olefile
---

# Reading Chinese .doc Files in WSL

## Context
When processing Chinese Word documents in WSL, `.doc` (Office 97-2003 Composite Document) files cannot be read by `python-docx` — only `.docx` is supported. Chinese .doc files store text as UTF-16LE encoding.

## Solution

```python
import olefile, re

def read_doc_file(path: str) -> str:
    """Read old .doc files (Chinese/UTF-16LE encoded) in WSL."""
    ole = olefile.OleFileIO(path)
    doc_bytes = ole.openstream('WordDocument').read()
    
    # Decode as UTF-16LE and filter valid characters
    text = doc_bytes.decode('utf-16le', errors='ignore')
    
    # Filter for Chinese + common punctuation + ASCII + numbers
    valid_chars = re.compile(
        r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef'
        r'\u2000-\u206f0-9a-zA-Z\r\n，。、：；？！""''（）【】《》…\s]+'
    )
    matches = valid_chars.findall(text)
    full_text = ''.join(matches)
    
    # Clean up lines
    lines = [l.strip() for l in full_text.split('\n') if l.strip()]
    return '\n'.join(lines)
```

## Installation
```bash
uv run --with olefile python3 -c "import olefile; print('ok')"
```

## Critical Pitfalls Discovered

### 1. All content arrives on ONE line
After `decode('utf-16le')`, the ENTIRE document comes out as a single concatenated string. The `\r\r` paragraph separators in the original Word document do NOT survive UTF-16LE decoding. You must split by `\n` after normalizing:
```python
full_text = full_text.replace('\r\n', '\n').replace('\r', '\n')
paragraphs = [p.strip() for p in full_text.split('\n') if p.strip()]
```

### 2. Garbage first paragraph
The first "paragraph" is often OLE metadata garbage like `性勰橢橢榖H\f鸠0P`. Filter it out:
```python
paragraphs = [p for p in paragraphs if len(p) > 5 and not p.startswith('性勰')]
```

### 3. `\r\n` does not appear in decoded text
Do NOT rely on `\r\n` being present — normalize to `\n` first, then split.

## Key Points
- `.doc` files use **Composite Document File V2** format — `python-docx` does NOT support them
- Text is stored as **UTF-16LE** (little-endian), not GBK or GB2312
- `olefile` reads the OLE structure, then decode bytes as `utf-16le`
- The regex filter removes binary garbage while preserving Chinese characters and common punctuation

## WSL Path Mapping
- Windows path: `C:\Users\username\Documents\file.doc`
- WSL path: `/mnt/c/Users/username/Documents/file.doc`

## When to Use
- `.doc` files that `python-docx` can't open
- Chinese meeting notes, templates, or documents in old Word format
- Both `olefile` and the UTF-16LE decoding approach are required together

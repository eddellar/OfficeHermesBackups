---
name: chinese-docx-pipeline
description: 处理中文Word文档（.doc/.docx）完整流程 — 从旧格式速记稿提取内容，生成符合格式规范的会议纪要.docx
---

# Chinese Word Document Processing Pipeline

处理中文Word文档（.doc/.docx）的完整流程：从旧格式速记稿提取内容，生成符合格式规范的会议纪要。

## 触发条件
处理中文.doc/.docx文件，涉及：老格式(.doc)读取、正则提取、格式规范（字体/缩进/行距）、生成.docx的场景。

## 核心流程

### Step 0：读取老格式 .doc 文件（WSL环境）

**.doc文件不能用python-docx读取** — 它们是 Office 97-2003 Composite Document V2 格式，存储文本为 UTF-16LE 编码。

```python
import olefile, re

ole = olefile.OleFileIO(path)
doc_bytes = ole.open_stream('WordDocument').read()
text = doc_bytes.decode('utf-16le', errors='ignore')

# 过滤有效字符（中文字符 + 常见标点 + ASCII + 数字）
valid_chars = re.compile(
    r'[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef'
    r'\u2000-\u206f0-9a-zA-Z\r\n，。、：；？！""''（）【】《》…\s]+'
)
matches = valid_chars.findall(text)
full_text = ''.join(matches)

# 规范化换行符并分段
full_text = full_text.replace('\r\n', '\n').replace('\r', '\n')
paragraphs = [p.strip() for p in full_text.split('\n') if p.strip()]

# 过滤掉开头的垃圾段落（如 "性勰橢橢榖H\f鸠0P"）
paragraphs = [p for p in paragraphs if len(p) > 5 and not p.startswith('性勰')]
```

**关键陷阱：**
1. 所有内容会变成一个大字符串 — `\r\r` 段落分隔符在UTF-16LE解码后不保留，必须用 `\n` 规范化后split
2. 第一个"段落"通常是OLE元数据垃圾（如 `性勰橢橢榖`），必须过滤掉
3. 不要依赖 `\r\n` 的存在 — 先规范化再split

**安装：** `uv run --with olefile python3 -c "import olefile; print('ok')"`

**WSL路径映射：** Windows `C:\Users\xxx\file.doc` → WSL `/mnt/c/Users/xxx/file.doc`

---

## 核心流程

### Step 1：读取老格式 .doc 文件（WSL环境）
WSL无法用python-docx直接读旧版.doc，需用olefile：

```python
import olefile, re

ole = olefile.OleFileIO(path)
stream = ole.open_stream('WordDocument')
data = stream.read()
# 文本在 WordDocument stream 中，编码UTF-16-LE
text = data.decode('utf-16-le', errors='replace')
# 清理null字符，按\r分段（不是\r\n！老doc段落分隔符是\r）
text = text.replace('\x00', '')
paragraphs = [p.strip() for p in text.split('\r') if p.strip() and len(p.strip()) > 2]
```
**关键经验**：老.doc文件的段落分隔符是`\r`而非`\r\n`。UTF-16-LE解码后如果直接split('\r\n')会得到1个长串，需用split('\r')才能正确分出段落。文件结尾的乱码段落（垃圾字符）需过滤掉。

### Step 2：读取 .docx 文件（python-docx）
```python
from docx import Document
doc = Document('input.docx')
for p in doc.paragraphs:
    print(p.text)
```

### Step 3：分析格式规范（从参考模板）
```python
from docx import Document
from docx.shared import Pt

doc = Document('模板.docx')
for p in doc.paragraphs:
    if not p.text.strip(): continue
    for r in p.runs:
        print(f"字体={r.font.name}, 字号={r.font.size.pt if r.font.size else '继承'}, 加粗={r.font.bold}")
    pf = p.paragraph_format
    if pf.first_line_indent:
        print(f"首行缩进={pf.first_line_indent.twip/567.0:.2f}cm")
```

关键格式（移动省级公司会议纪要模板）：
- 页边距：左右3.17cm，上下2.54cm
- 标题：华文中宋22pt加粗居中
- 正文：仿宋_GB2312 16pt，首行缩进1.13cm，行距固定24pt
- 一级节（一二三四）：黑体16pt加粗
- 二级节（第一第二）：楷体_GB2312 16pt加粗
- 强调：加粗

### Step 4：生成格式化 .docx
最佳策略：先从原始纪要逐段读取精确文字，再重新应用格式生成新文档。这样可以保证文字内容100%一致，格式也完全匹配。

```python
from docx import Document
from docx.shared import Pt, Cm
from docx.oxml.ns import qn
from docx.enum.text import WD_LINE_SPACING

# 读取原始纪要的精确段落文字
orig = Document('原始纪要.docx')
paras_text = [p.text for p in orig.paragraphs]  # 保留空段落位置

# 创建新文档并设置页面边距
doc = Document()
section = doc.sections[0]
section.page_width = Cm(21)
section.page_height = Cm(29.7)
section.left_margin = Cm(3.17)
section.right_margin = Cm(3.17)
section.top_margin = Cm(2.54)
section.bottom_margin = Cm(2.54)

def set_font(run, name, size, bold=False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run._element.rPr.rFonts.set(qn('w:eastAsia'), name)

def add_para(doc, text, font, size, bold=False, indent=True, align=0, space_before=0, space_after=0):
    p = doc.add_paragraph()
    p.alignment = align
    pf = p.paragraph_format
    pf.space_before = Pt(space_before)
    pf.space_after = Pt(space_after)
    pf.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    pf.line_spacing = Pt(24)
    pf.first_line_indent = Cm(1.13) if indent else Cm(0)
    r = p.add_run(text)
    set_font(r, font, size, bold)
    return p

# 按段落序号应用格式
# 0=标题(华文中宋22pt加粗居中), 1=空, 2+=正文...
add_para(doc, paras_text[0], '华文中宋', 22, bold=True, indent=False, align=1)  # 标题居中
add_para(doc, paras_text[1], '仿宋_GB2312', 16)  # 段落1（有首行缩进）
# ... 依次按结构添加各段
doc.save('输出.docx')
```

**格式对应关系**：
- 段落0：华文中宋22pt加粗居中（标题）
- 段落1-N（正文部分）：仿宋_GB2312 16pt，首行缩进1.13cm，行距24pt
- 一级节（一、二、三、四）：黑体16pt加粗，无缩进，段前10pt
- 二级节（第一、第二等）：楷体_GB2312 16pt加粗，无缩进，段前10pt

---

## 常见问题

### 问题1：旧.doc文件读取失败或乱码
**原因**：.doc文件编码是UTF-16-LE，不能用常规文本方法读取。
**症状**：read_file显示乱码（`性勰橢橢榖`），split('\r\n')得到1个大段落，textract报错`antiword not found`。
**解决**：必须用olefile读取WordDocument stream，再UTF-16-LE解码，最后split('\r')分段（不是\r\n）。示例：

```python
import olefile, re
ole = olefile.OleFileIO('xxx.doc')
data = ole.openstream('WordDocument').read()
text = data.decode('utf-16-le', errors='replace').replace('\x00', '')
# 找内容起始位置（通常在可见字符之后）
start = text.find('10月22日') or text.find('莫文弘')
text = text[start:]
lines = [l.strip() for l in text.split('\r') if l.strip() and len(l.strip()) > 2 and not l.strip()[0] in '性勰橢']
# 过滤掉结尾的垃圾段落
```

**备选方案**：安装antiword（`apt install antiword`）后用textract，或在Windows上用WPS直接另存为.docx。

### 问题2：首行缩进设置后文字仍不缩进
**原因**：`first_line_indent`需在有实际文字的段落上才生效。
**解决**：确认`p.add_run(text)`后run有内容，且缩进在run添加前设置。

### 问题3：字体名包含数字（如"仿宋_GB2312"）时中文字体不生效
**解决**：必须同时设置`.font.name`（英文）和`rPr.rFonts.set(qn('w:eastAsia'), font_name)`（中文），两者缺一不可。

### 问题4：WSL路径与Windows路径
- Windows `C:\Users\xxx` → WSL `/mnt/c/Users/xxx`
- WPS云盘同步目录通常在 `WPSDrive/` 下

### 问题5：JSON写入含中文引号导致解析失败
**原因**：写入工具按字节处理UTF-8，原始纪要中的中文引号`""`是`\xE2\x80\x9C`（3字节UTF-8），中间字节0x80可能被截断导致`json.decoder.JSONDecodeError`。
**解决**：用Python脚本写入JSON，不要用工具直接写入含中文引号的文本。或直接跳过JSON中间格式，从原始文档读取文本后直接生成目标文档。

---

## 工作目录参考
```
/mnt/c/Users/eddellar/WPSDrive/444740419/WPS云盘/AI测试/
├── generate_from_speednotes.py
├── speednotes_full_content.json
└── 2025年三季度...会议纪要_详细版.docx

原始文件：
├── 经分会/季度经分会/2025/2025年三季度经分会/
└── 经分会/季度经分会/2024/2024年一季度经分会/
```

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dump paragrafen en tabellen uit de docx in leesvolgorde, getrouw."""
import sys, json
from docx import Document
from docx.document import Document as _Doc
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import _Cell, Table
from docx.text.paragraph import Paragraph

def iter_block_items(parent):
    if isinstance(parent, _Doc):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:
        raise ValueError(parent)
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)

def cell_text(cell):
    return "\n".join(p.text for p in cell.paragraphs).strip()

def main(path):
    doc = Document(path)
    out = []
    tbl_idx = 0
    for block in iter_block_items(doc):
        if isinstance(block, Paragraph):
            t = block.text.strip()
            if t:
                style = block.style.name if block.style else ""
                out.append(("P", style, t))
        else:  # Table
            rows = []
            for row in block.rows:
                rows.append([cell_text(c) for c in row.cells])
            out.append(("T", tbl_idx, rows))
            tbl_idx += 1

    # Leesbare tekstdump
    lines = []
    for kind, meta, payload in out:
        if kind == "P":
            lines.append(f"[P|{meta}] {payload}")
        else:
            lines.append(f"\n===== TABEL {meta} ({len(payload)} rijen) =====")
            for r in payload:
                lines.append(" | ".join(cell.replace("\n"," / ") for cell in r))
            lines.append("===== EINDE TABEL =====\n")
    with open("import/docx_dump.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    # Machineleesbaar (voor stap 3)
    machine = []
    for kind, meta, payload in out:
        if kind == "P":
            machine.append({"type": "p", "style": meta, "text": payload})
        else:
            machine.append({"type": "table", "idx": meta, "rows": payload})
    with open("import/docx_dump.json", "w", encoding="utf-8") as f:
        json.dump(machine, f, ensure_ascii=False, indent=1)

    print(f"Paragrafen+tabellen: {len(out)} blokken, {tbl_idx} tabellen.")

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "import/bron.docx")

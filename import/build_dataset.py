#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Bouw dataset.json getrouw uit import/docx_dump.json (Optie 1: geen Nee/Kinney).

Regels bevindingen komen LETTERLIJK uit de docx-tabellen. Alleen de structuur
(module-codes, antwoord-mapping, PVA-koppeling) is hier vastgelegd en gedocumenteerd.
"""
import json, re, sys

DUMP = json.load(open("import/docx_dump.json", encoding="utf-8"))

def table(idx):
    for b in DUMP:
        if b.get("type") == "table" and b.get("idx") == idx:
            return b["rows"]
    raise KeyError(idx)

def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

# --- H3: tabel-idx -> (modulecode, moduletitel). 9+10 = zelfde module F3. -------
H3 = [
    (1,  "O1", "Arbobeleid"),
    (2,  "O2", "Verzuimbeleid"),
    (3,  "O3", "Arbeidsorganisatie"),
    (4,  "L1", "Bedrijfshulpverlening"),
    (5,  "P1", "Sociale werkomgeving"),
    (6,  "L2", "Algemene inrichting gebouwen"),
    (7,  "F1", "Fysische factoren"),
    (8,  "F2", "Toxische stoffen"),
    (9,  "F3", "Lichamelijke belasting"),
    (10, "F3", "Lichamelijke belasting"),
    (11, "F4", "Gereedschappen, werktuigen en machines (arbeidsmiddelen)"),
    (12, "F5", "Persoonlijke beschermingsmiddelen"),
    (13, "L3", "Visuele informatie"),
    (14, "P2", "Functie-inhoud en werkdruk"),
    (15, "P3", "Werk en rusttijden"),
]
MODULE_ORDER = ["O1","O2","O3","L1","P1","L2","F1","F2","F3","F4","F5","L3","P2","P3"]
TITELS = {c: t for _, c, t in H3}

def antwoord_van(finding, flagged):
    if flagged:
        return "Gericht uit te vragen"          # aandachtspunt-markering (v/V) in de docx
    f = re.sub(r"^[\-•\s]+", "", (finding or "")).strip().lower()
    if f.startswith("ja"):            return "Ja"
    if f.startswith("nee"):           return "NVT"   # 'Nee, ... niet aanwezig' = gevaar afwezig
    if f.startswith("nvt"):           return "NVT"
    if f.startswith("niet aanwezig"): return "NVT"
    if f.startswith("komt niet voor"):return "NVT"
    return "Ja"

# --- bouw modules + vragen ---------------------------------------------------
mods = {c: {"code": c, "titel": TITELS[c], "intro": "", "vragen": []} for c in MODULE_ORDER}
vraag_index = []  # (code, onderwerp_raw, nr, vraag_dict)
counters = {c: 0 for c in MODULE_ORDER}
flagged_list = []

for idx, code, _ in H3:
    rows = table(idx)
    if not rows:
        continue
    header = rows[0]
    ncol = len(header)
    subgroup = ""
    for row in rows[1:]:
        row = list(row) + [""] * (ncol - len(row))
        hoofdstuk = (row[0] or "").strip()
        onderwerp = (row[1] or "").strip()
        finding   = (row[ncol - 2] or "").strip()
        aandacht  = (row[ncol - 1] or "").strip()
        if hoofdstuk:
            subgroup = hoofdstuk
        if not onderwerp:
            continue  # lege scheidingsrij
        flagged = aandacht.lower() == "v"
        # vraagtekst: subgroep-prefix alleen als die inhoudelijk afwijkt van de moduletitel
        if subgroup and norm(subgroup) != norm(TITELS[code]):
            vraagtekst = f"{subgroup} – {onderwerp}"
        else:
            vraagtekst = onderwerp
        counters[code] += 1
        nr = f"{code}-{counters[code]}"
        v = {"nr": nr, "vraag": vraagtekst,
             "antwoord": antwoord_van(finding, flagged), "bevinding": finding}
        mods[code]["vragen"].append(v)
        vraag_index.append((code, onderwerp, nr, v))
        if flagged:
            flagged_list.append((nr, vraagtekst))

modules = [mods[c] for c in MODULE_ORDER]

# --- PVA (tabel 22) -----------------------------------------------------------
PRIO = {"1": "Hoog", "2": "Middel", "3": "Laag"}
TERMIJN = {"1": "Kort (binnen 3 maanden)",
           "2": "Middellang (binnen 12 maanden)",
           "3": "Wanneer redelijk (binnen 2 jaar)"}

# actie-nr -> (modulecode, onderwerp-substring) van de onderbouwende H3-vraag
ANCHORS = {
    1:  ("O1", "preventiemedewerker"),
    2:  ("O1", "voorlichting arbeidsomstandigheden"),
    3:  ("F3", "hoofdstuk lichamelijke belasting"),
    4:  ("F4", "keuring van vaste machines"),
    5:  ("L1", "voorbereiding op noodsituatie"),
    6:  ("F4", "gebruikershandleiding"),
    7:  ("F4", "voldoende onderlegd"),
    8:  ("P3", "langer dan 12 uur"),
    9:  ("P1", "inleen"),
    10: ("F5", "in gebruik"),
}

def find_vraag(code, sub):
    hits = [(nr, vd) for (c, ow, nr, vd) in vraag_index
            if c == code and sub in ow.lower()]
    if len(hits) != 1:
        raise SystemExit(f"Anker niet uniek voor {code}/{sub!r}: {[h[0] for h in hits]}")
    return hits[0]

def to_iso(d):
    m = re.match(r"(\d{1,2})-(\d{1,2})-(\d{4})", (d or "").strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}" if m else None

pva = []
pva_extra = []   # sidecar: velden die pva_items wel heeft maar import_company niet vult
rows = table(22)
for i, row in enumerate(rows[1:], start=1):
    row = list(row) + [""] * (8 - len(row))
    knelpunt, risico, nrm, prio_num, actie, verantw, uitv, gereed = [(x or "").strip() for x in row[:8]]
    if not (actie and risico and prio_num):
        print(f"  PVA-rij overgeslagen (onvolledig in docx): {knelpunt!r}")
        continue
    nr = str(i)
    code, sub = ANCHORS[i]
    anchor_nr, anchor_v = find_vraag(code, sub)
    anchor_v["pva"] = nr                     # koppeling zodat actie onderbouwd is
    verantw_txt = verantw + (f" (uitvoerende: {uitv})" if uitv else "")
    pva.append({
        "nr": nr, "ref": anchor_nr, "onderwerp": knelpunt, "maatregel": actie,
        "tree": "Organisatorisch",           # alle acties zijn organisatorisch (afgeleid uit maatregel)
        "prio": PRIO[risico], "termijn": TERMIJN[prio_num],
        "verantw": verantw_txt,              # status weggelaten -> import_company zet 'Open'
    })
    pva_extra.append({
        "nr": nr,
        "termijn_datum": to_iso(gereed),                 # docx 'Start/Gereed' -> pva_items.termijn_datum
        "opm": f"Norm: {nrm} (wettelijke verplichting)" if nrm else None,  # -> pva_items.opm
    })

# --- bedrijf + narratief: klantcontent uit een genegeerd inputbestand ---------
# import/bedrijf.json bevat de bedrijfsgegevens, managementsamenvatting, aanpak
# en toetsbrief (letterlijk uit de docx). Dit bestand staat op .gitignore zodat
# er geen klantinhoud in de (publieke) repo komt.
BEDRIJF_PAD = "import/bedrijf.json"
try:
    kop = json.load(open(BEDRIJF_PAD, encoding="utf-8"))
except FileNotFoundError:
    raise SystemExit(
        f"Ontbrekend inputbestand '{BEDRIJF_PAD}'. Maak dit aan met de sleutels "
        "'bedrijf', 'managementsamenvatting', 'aanpak' en 'toetsbrief' "
        "(zie rie_dataset_schema.json voor de verplichte velden).")

for sleutel in ("bedrijf", "managementsamenvatting", "aanpak", "toetsbrief"):
    if sleutel not in kop:
        raise SystemExit(f"'{sleutel}' ontbreekt in {BEDRIJF_PAD}.")

dataset = {
    "bedrijf": kop["bedrijf"],
    "managementsamenvatting": kop["managementsamenvatting"],
    "aanpak": kop["aanpak"],
    "modules": modules,
    "planVanAanpak": pva,
    "functieRIE": [],
    "fotos": [],
    "toetsbrief": kop["toetsbrief"],
}

json.dump(dataset, open("import/dataset.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
json.dump(pva_extra, open("import/pva_extra.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)

# --- telrapport --------------------------------------------------------------
totaal_v = sum(len(m["vragen"]) for m in modules)
print(f"\nModules: {len(modules)}")
for m in modules:
    print(f"  {m['code']:3} {m['titel'][:45]:45} vragen={len(m['vragen'])}")
print(f"Totaal vragen: {totaal_v}")
print(f"PVA-acties: {len(pva)}")
print(f"Aandachtspunten (v/V -> 'Gericht uit te vragen'): {len(flagged_list)}")
for nr, t in flagged_list:
    print(f"  {nr}: {t[:70]}")
from collections import Counter
print("Antwoord-verdeling:", dict(Counter(v["antwoord"] for m in modules for v in m["vragen"])))

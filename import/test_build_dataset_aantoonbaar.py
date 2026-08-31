#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tests voor de optionele docx-kolom "Aantoonbaar" in build_dataset.py.

Draait de echte pipeline end-to-end tegen een nagebouwde docx_dump.json in een
tijdelijke map. Dat dekt precies waar het mis kan gaan: de bevinding- en
aandachtspuntkolom werden vroeger als "de laatste twee" geteld, dus een extra
kolom in de docx mag die telling niet verschuiven.

Gebruik:  python import/test_build_dataset_aantoonbaar.py
Geen pakketten nodig; exitcode 0 = groen.
"""
import json, os, shutil, subprocess, sys, tempfile

HIER = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HIER)
BUILDER = os.path.join(HIER, "build_dataset.py")

# build_dataset.py verwacht deze 15 H3-tabellen plus tabel 22 (PVA).
H3_IDX = list(range(1, 16))
PVA_IDX = 22

BEDRIJF = {
    "bedrijf": {"naam": "Testbedrijf", "kvk": "00000000"},
    "managementsamenvatting": {"intro": "x", "watGoed": [], "verbeterpunten": []},
    "aanpak": {"toelichting": "x", "methode": "x", "proportionaliteit": "x"},
    "toetsbrief": {"scope_inleiding": "x", "scope_matrix": []},
}


def dump(tabel1_header, tabel1_rijen):
    """docx_dump.json met alle vereiste tabellen; alleen tabel 1 heeft inhoud."""
    blokken = []
    for idx in H3_IDX:
        if idx == 1:
            blokken.append({"type": "table", "idx": idx, "rows": [tabel1_header] + tabel1_rijen})
        else:
            blokken.append({"type": "table", "idx": idx, "rows": [tabel1_header]})
    blokken.append({"type": "table", "idx": PVA_IDX, "rows": [
        ["Inventarisatie knelpunt", "Risico", "Norm", "Prioriteit",
         "Te nemen actie", "Verantwoordelijke", "Uitvoerende", "Start/Gereed"]]})
    return blokken


def draai(header, rijen):
    """Genereer dataset.json in een temp-map en geef de vragen van module O1."""
    tmp = tempfile.mkdtemp(prefix="rie_test_")
    try:
        os.makedirs(os.path.join(tmp, "import"))
        with open(os.path.join(tmp, "import", "docx_dump.json"), "w", encoding="utf-8") as f:
            json.dump(dump(header, rijen), f, ensure_ascii=False)
        with open(os.path.join(tmp, "import", "bedrijf.json"), "w", encoding="utf-8") as f:
            json.dump(BEDRIJF, f, ensure_ascii=False)
        r = subprocess.run([sys.executable, BUILDER], cwd=tmp,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        if r.returncode != 0:
            raise AssertionError(f"build_dataset.py faalde (exit {r.returncode}):\n{r.stdout}\n{r.stderr}")
        with open(os.path.join(tmp, "import", "dataset.json"), encoding="utf-8") as f:
            data = json.load(f)
        return [m for m in data["modules"] if m["code"] == "O1"][0]["vragen"]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


ZONDER = ["Hoofdstuk", "Onderwerp", "In orde?", "Aandachtspunt"]
ACHTERAAN = ["Hoofdstuk", "Onderwerp", "In orde?", "Aandachtspunt", "Aantoonbaar"]
MIDDEN = ["Hoofdstuk", "Onderwerp", "In orde?", "Aantoonbaar", "Aandachtspunt"]

fouten = []


def check(naam, voorwaarde, detail=""):
    if voorwaarde:
        print(f"OK    {naam}")
    else:
        fouten.append(naam)
        print(f"FOUT  {naam}{(' — ' + detail) if detail else ''}")


# --- 1. Kolom ontbreekt: gedrag exact als voorheen ----------------------------
v = draai(ZONDER, [
    ["Arbobeleid", "Beleid op schrift", "Ja. Er is een beleidsverklaring.", ""],
    ["", "Geluidsmeting", "Nee, niet aanwezig op kantoor.", ""],
    ["", "Voorlichting", "Ja, jaarlijks.", "v"],
])
check("kolom afwezig: antwoorden ongewijzigd",
      [x["antwoord"] for x in v] == ["Ja", "NVT", "Gericht uit te vragen"],
      str([x["antwoord"] for x in v]))
check("kolom afwezig: bevinding uit de juiste kolom",
      v[0]["bevinding"] == "Ja. Er is een beleidsverklaring.", v[0]["bevinding"])
check("kolom afwezig: geen aantoonbaar-sleutels",
      all("aantoonbaar" not in x and "aantoonbaar_toelichting" not in x for x in v))

# --- 2. Kolom achteraan -------------------------------------------------------
v = draai(ACHTERAAN, [
    ["Arbobeleid", "Beleid op schrift", "Ja. Er is een beleidsverklaring.", "", "Ja"],
    ["", "Werkoverleg", "Ja, wordt gehouden.", "", "Nee, geen verslagen beschikbaar"],
])
check("kolom achteraan: aantoonbaar Ja gelezen", v[0].get("aantoonbaar") == "Ja", repr(v[0]))
check("kolom achteraan: aantoonbaar Ja zonder toelichting",
      "aantoonbaar_toelichting" not in v[0])
check("kolom achteraan: aantoonbaar Nee + toelichting gesplitst",
      v[1].get("aantoonbaar") == "Nee"
      and v[1].get("aantoonbaar_toelichting") == "geen verslagen beschikbaar", repr(v[1]))
check("kolom achteraan: bevinding nog steeds uit de 'In orde?'-kolom",
      v[0]["bevinding"] == "Ja. Er is een beleidsverklaring.", v[0]["bevinding"])

# --- 3. Kolom ertussen: aandachtspunt mag niet verschuiven --------------------
v = draai(MIDDEN, [
    ["Arbobeleid", "Beleid op schrift", "Ja. Er is een beleidsverklaring.", "Ja", ""],
    ["", "Voorlichting", "Ja, jaarlijks.", "Ja", "v"],
])
check("kolom ertussen: bevinding uit de juiste kolom",
      v[0]["bevinding"] == "Ja. Er is een beleidsverklaring.", v[0]["bevinding"])
check("kolom ertussen: aantoonbaar gelezen", v[0].get("aantoonbaar") == "Ja", repr(v[0]))
check("kolom ertussen: aandachtspunt-markering nog steeds herkend",
      v[1]["antwoord"] == "Gericht uit te vragen", v[1]["antwoord"])

# --- 4. Onverwachte waarden: stil leeg, geen crash ----------------------------
v = draai(ACHTERAAN, [
    ["Arbobeleid", "Vraag a", "Ja, in orde.", "", "?"],
    ["", "Vraag b", "Ja, in orde.", "", "misschien"],
    ["", "Vraag c", "Ja, in orde.", "", "-"],
    ["", "Vraag d", "Ja, in orde.", "", ""],
    ["", "Vraag e", "Ja, in orde.", "", "Jazeker wel"],
    ["", "Vraag f", "Ja, in orde.", "", "  nee , niets van"],
])
check("onverwachte waarde '?' -> leeg", "aantoonbaar" not in v[0], repr(v[0]))
check("onverwachte waarde 'misschien' -> leeg", "aantoonbaar" not in v[1], repr(v[1]))
check("onverwachte waarde '-' -> leeg", "aantoonbaar" not in v[2], repr(v[2]))
check("lege cel -> leeg", "aantoonbaar" not in v[3], repr(v[3]))
check("'Jazeker wel' telt niet als Ja (woordgrens)", "aantoonbaar" not in v[4], repr(v[4]))
check("rommelige 'nee , niets van' -> Nee + toelichting",
      v[5].get("aantoonbaar") == "Nee" and v[5].get("aantoonbaar_toelichting") == "niets van",
      repr(v[5]))

# --- 5. Alleen zinvol bij antwoord 'Ja' ---------------------------------------
v = draai(ACHTERAAN, [
    ["Arbobeleid", "Vraag a", "Nee, komt niet voor.", "", "Ja"],
    ["", "Vraag b", "nvt", "", "Nee, niets van"],
    ["", "Vraag c", "Ja, in orde.", "v", "Ja"],
])
check("antwoord NVT (uit 'Nee, ...'): aantoonbaar blijft leeg",
      v[0]["antwoord"] == "NVT" and "aantoonbaar" not in v[0], repr(v[0]))
check("antwoord NVT: aantoonbaar blijft leeg",
      v[1]["antwoord"] == "NVT" and "aantoonbaar" not in v[1], repr(v[1]))
check("antwoord 'Gericht uit te vragen': aantoonbaar blijft leeg",
      v[2]["antwoord"] == "Gericht uit te vragen" and "aantoonbaar" not in v[2], repr(v[2]))

# --- 6. Kortere rijen dan de header (docx levert dat) -------------------------
v = draai(ACHTERAAN, [["Arbobeleid", "Vraag a", "Ja, in orde."]])
check("te korte rij wordt aangevuld, geen crash",
      v[0]["antwoord"] == "Ja" and "aantoonbaar" not in v[0], repr(v[0]))

# --- 7. Schemaregels (alleen als 'jsonschema' aanwezig is) --------------------
try:
    from jsonschema import Draft202012Validator
except ImportError:
    print("~     schema-check overgeslagen (pip install jsonschema)")
else:
    schema = json.load(open(os.path.join(ROOT, "rie_dataset_schema.json"), encoding="utf-8"))
    vraag_validator = Draft202012Validator(schema["$defs"]["vraag"])
    basis = {"nr": "O1-1", "vraag": "x", "antwoord": "Ja", "bevinding": "y"}
    gevallen = [
        ("aantoonbaar Ja bij antwoord Ja",        {**basis, "aantoonbaar": "Ja"}, True),
        ("aantoonbaar Nee + toelichting",         {**basis, "aantoonbaar": "Nee",
                                                   "aantoonbaar_toelichting": "geen verslag"}, True),
        ("zonder aantoonbaar",                    basis, True),
        ("aantoonbaar bij antwoord NVT geweigerd", {**basis, "antwoord": "NVT",
                                                    "aantoonbaar": "Ja"}, False),
        ("waarde buiten Ja/Nee geweigerd",        {**basis, "aantoonbaar": "Misschien"}, False),
        ("losse toelichting geweigerd",           {**basis, "aantoonbaar_toelichting": "los"}, False),
    ]
    for naam, doc, verwacht_geldig in gevallen:
        geldig = not list(vraag_validator.iter_errors(doc))
        check(f"schema: {naam}", geldig == verwacht_geldig)

print()
if fouten:
    print(f"ROOD — {len(fouten)} van de checks faalde:")
    for f in fouten:
        print(f"  - {f}")
    sys.exit(1)
print("GROEN — parser-tests aantoonbaar geslaagd.")

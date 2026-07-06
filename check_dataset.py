#!/usr/bin/env python3
"""
check_dataset.py - consistentiecheck voor een RI&E-dataset.

Draait twee lagen:
  1. Schema-check (structuur, types, toegestane waarden, Nee/NVT-regels) via
     rie_dataset_schema.json. Hiervoor is het pakket 'jsonschema' nodig.
  2. Semantische checks die een schema niet kan: kruisverwijzingen tussen
     vragen, acties, functie-RI&E en foto's, plus telcontroles (Beslissing 25).

Gebruik:
    python3 check_dataset.py DATASET.json
    python3 check_dataset.py DATASET.json --schema rie_dataset_schema.json
    python3 check_dataset.py DATASET.json --fotos-dir ./fotos

Exitcode 0 = geen fouten, 1 = minstens één fout.
"""

import argparse
import json
import os
import re
import sys

VRAAG_RE = re.compile(r"^[FLOP][0-9]+-[0-9]+$")
ACTIE_RE = re.compile(r"^[0-9]+$")


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def tokens(ref):
    """Splits een ref-string als 'F1-1 / F1-2 / 8' op in losse tokens."""
    if not ref:
        return []
    return [t.strip() for t in str(ref).split("/") if t.strip()]


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.infos = []

    def error(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def info(self, msg):
        self.infos.append(msg)

    def print_and_exit(self):
        def block(title, items):
            print(f"\n{title} ({len(items)})")
            for m in items:
                print(f"  - {m}")

        if self.infos:
            block("INFO", self.infos)
        if self.warnings:
            block("WAARSCHUWINGEN", self.warnings)
        if self.errors:
            block("FOUTEN", self.errors)
            print(f"\nResultaat: {len(self.errors)} fout(en). Dataset is NIET schoon.")
            sys.exit(1)
        else:
            print("\nResultaat: geen fouten. Dataset is schoon.")
            sys.exit(0)


# --- laag 1: schema -----------------------------------------------------------

def run_schema_check(data, schema_path, rep):
    if not schema_path or not os.path.exists(schema_path):
        rep.info(f"Schema-check overgeslagen (schema niet gevonden op '{schema_path}').")
        return
    try:
        from jsonschema import Draft202012Validator
    except ImportError:
        rep.info("Schema-check overgeslagen (pakket 'jsonschema' niet geinstalleerd: "
                 "pip install jsonschema).")
        return
    schema = load_json(schema_path)
    validator = Draft202012Validator(schema)
    n = 0
    for e in sorted(validator.iter_errors(data), key=lambda x: list(x.absolute_path)):
        n += 1
        pad = "/".join(str(p) for p in e.absolute_path) or "(root)"
        rep.error(f"[schema] {pad}: {e.message}")
    if n == 0:
        rep.info("Schema-check: structuur en waarden in orde.")


# --- laag 2: semantische checks ----------------------------------------------

def collect_index(data):
    vragen = {}        # nr -> vraag (met modulecode erbij)
    vragen_per_mod = {}
    for m in data.get("modules", []):
        code = m.get("code")
        vragen_per_mod.setdefault(code, [])
        for v in m.get("vragen", []):
            v = dict(v)
            v["_module"] = code
            vragen[v.get("nr")] = v
            vragen_per_mod[code].append(v.get("nr"))
    acties = {a.get("nr"): a for a in data.get("planVanAanpak", [])}
    return vragen, vragen_per_mod, acties


def check_duplicates(data, vragen_per_mod, rep):
    # dubbele vraagnummers binnen een module
    for code, nrs in vragen_per_mod.items():
        seen, dup = set(), set()
        for nr in nrs:
            if nr in seen:
                dup.add(nr)
            seen.add(nr)
        for nr in sorted(dup):
            rep.error(f"[dubbel] vraagnummer '{nr}' komt meerdere keren voor in module {code}.")
    # dubbele modulecodes
    codes = [m.get("code") for m in data.get("modules", [])]
    for c in sorted({x for x in codes if codes.count(x) > 1}):
        rep.error(f"[dubbel] modulecode '{c}' komt meerdere keren voor.")
    # dubbele actienummers
    nums = [a.get("nr") for a in data.get("planVanAanpak", [])]
    for n in sorted({x for x in nums if nums.count(x) > 1}):
        rep.error(f"[dubbel] actienummer '{n}' komt meerdere keren voor.")


def check_pva_links(vragen, acties, rep):
    # 1. elke Nee verwijst naar een bestaande actie
    nee_per_actie = {}
    for nr, v in vragen.items():
        if v.get("antwoord") == "Nee":
            pva = v.get("pva", "")
            if not pva:
                rep.error(f"[koppeling] {nr} is Nee maar heeft geen pva-verwijzing.")
            elif pva not in acties:
                rep.error(f"[kapotte verwijzing] {nr} verwijst naar actie '{pva}', "
                          f"die niet in het Plan van Aanpak bestaat.")
            else:
                nee_per_actie.setdefault(pva, []).append(nr)
    # ook niet-Nee mag naar een actie wijzen, maar de verwijzing moet bestaan
    for nr, v in vragen.items():
        pva = v.get("pva", "")
        if pva and v.get("antwoord") != "Nee" and pva not in acties:
            rep.error(f"[kapotte verwijzing] {nr} verwijst naar actie '{pva}', "
                      f"die niet bestaat.")

    # 2. elke actie wordt onderbouwd door minstens een vraag (via pva), en
    #    minstens een daarvan is Nee (Beslissing 25: scope <-> PvA klopt)
    onderbouwd = {}
    for nr, v in vragen.items():
        pva = v.get("pva", "")
        if pva:
            onderbouwd.setdefault(pva, []).append(v)
    for anr, a in acties.items():
        steun = onderbouwd.get(anr, [])
        if not steun:
            rep.error(f"[wees-actie] actie {anr} ('{a.get('onderwerp','')}') "
                      f"heeft geen enkele onderbouwende vraag.")
            continue
        if not any(v.get("antwoord") == "Nee" for v in steun):
            rep.warn(f"[scope] actie {anr} ('{a.get('onderwerp','')}') wordt door "
                     f"geen enkele Nee-vraag gedragen.")

    # 3. ref-string van een actie: genoemde vraagnummers moeten bestaan
    for anr, a in acties.items():
        for t in tokens(a.get("ref", "")):
            if VRAAG_RE.match(t) and t not in vragen:
                rep.error(f"[kapotte verwijzing] actie {anr} verwijst in 'ref' naar "
                          f"onbekende vraag '{t}'.")
            elif ACTIE_RE.match(t):
                rep.warn(f"[ref] actie {anr} heeft een nummer-token '{t}' in 'ref'; "
                         f"verwacht zijn vraagnummers.")


def check_functie_refs(data, vragen, acties, rep):
    for f in data.get("functieRIE", []):
        naam = f.get("functie", "?")
        for rij in f.get("risicos", []):
            if not (isinstance(rij, list) and len(rij) >= 3):
                continue
            for t in tokens(rij[2]):
                if VRAAG_RE.match(t):
                    if t not in vragen:
                        rep.error(f"[functie-RI&E] '{naam}' verwijst naar onbekende "
                                  f"vraag '{t}'.")
                elif ACTIE_RE.match(t):
                    if t not in acties:
                        rep.error(f"[functie-RI&E] '{naam}' verwijst naar onbekende "
                                  f"actie '{t}'.")


def check_foto_refs(data, vragen, rep, fotos_dir):
    for foto in data.get("fotos", []):
        nr = foto.get("nr")
        for t in foto.get("refs", []):
            if VRAAG_RE.match(str(t)) and t not in vragen:
                rep.error(f"[foto] foto {nr} verwijst naar onbekende vraag '{t}'.")
        # bestandsbestaan alleen als er een map is opgegeven
        if fotos_dir:
            bestand = foto.get("bestand", "")
            if bestand and not os.path.exists(os.path.join(fotos_dir, bestand)):
                rep.error(f"[foto] bestand ontbreekt in '{fotos_dir}': {bestand}")
    if not fotos_dir:
        rep.info("Foto-bestandscontrole overgeslagen (geen --fotos-dir opgegeven).")


def check_kinney(vragen, rep):
    """
    Beslissing 27: per Nee-vraag moet R = E x B x W (berekend, nooit handmatig).
    Klasse-grenzen: R < 20 = Laag, 20 <= R < 70 = Middel, R >= 70 = Hoog.
    Dodelijk-regel: E >= 40 geeft minimaal Middel ongeacht R.
    """
    klasse_van_R = lambda r: "Laag" if r < 20 else ("Middel" if r < 70 else "Hoog")

    for nr, v in vragen.items():
        if v.get("antwoord") != "Nee":
            continue

        k = v.get("kinney")
        if not k:
            rep.error(f"[kinney] {nr} is Nee maar heeft geen kinney-object.")
            continue

        E, B, W, R = k.get("E"), k.get("B"), k.get("W"), k.get("R")
        if None in (E, B, W, R):
            rep.error(f"[kinney] {nr}: kinney-object mist een of meer velden (E/B/W/R).")
            continue

        # R moet kloppen (afronden op 4 decimalen om float-drift te voorkomen)
        verwacht_R = round(E * B * W, 4)
        if abs(R - verwacht_R) > 0.01:
            rep.error(f"[kinney] {nr}: R={R} klopt niet; E({E}) x B({B}) x W({W}) = {verwacht_R}.")

        # klasse moet kloppen met R en dodelijk-regel
        klasse = v.get("klasse", "")
        verwacht_klasse = klasse_van_R(R)
        if E >= 40 and verwacht_klasse == "Laag":
            verwacht_klasse = "Middel"  # dodelijk-regel
        if klasse != verwacht_klasse:
            rep.error(
                f"[kinney] {nr}: klasse='{klasse}' maar op basis van R={R}"
                f"{' en dodelijk-regel (E='+str(E)+')' if E >= 40 else ''}"
                f" verwacht '{verwacht_klasse}'."
            )

        # brf_categorie verplicht bij Nee
        if not v.get("brf_categorie"):
            rep.error(f"[brf_categorie] {nr} is Nee maar mist brf_categorie (Beslissing 26).")


def check_narrative(data, rep):
    ms = data.get("managementsamenvatting", {})
    for veld in ("intro", "watGoed", "verbeterpunten"):
        if not str(ms.get(veld, "")).strip():
            rep.warn(f"[samenvatting] managementsamenvatting.{veld} is leeg.")
    ap = data.get("aanpak", {})
    for veld in ("toelichting", "methode", "proportionaliteit"):
        if not str(ap.get(veld, "")).strip():
            rep.warn(f"[aanpak] aanpak.{veld} is leeg.")
    rep.info("Medewerkersaantallen zijn vrije tekst en worden niet opgeteld/gecontroleerd "
             "(wordt pas controleerbaar als dit veld gestructureerd wordt).")


def main():
    ap = argparse.ArgumentParser(description="Consistentiecheck voor een RI&E-dataset.")
    ap.add_argument("dataset", help="pad naar de dataset (.json)")
    ap.add_argument("--schema", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                      "rie_dataset_schema.json"),
                    help="pad naar het JSON Schema (default: naast dit script)")
    ap.add_argument("--fotos-dir", default=None,
                    help="map met fotobestanden; alleen dan wordt bestandsbestaan gecheckt")
    args = ap.parse_args()

    data = load_json(args.dataset)
    rep = Report()

    print(f"Controle van: {args.dataset}")

    run_schema_check(data, args.schema, rep)

    vragen, vragen_per_mod, acties = collect_index(data)
    check_duplicates(data, vragen_per_mod, rep)
    check_pva_links(vragen, acties, rep)
    check_functie_refs(data, vragen, acties, rep)
    check_foto_refs(data, vragen, rep, args.fotos_dir)
    check_kinney(vragen, rep)
    check_narrative(data, rep)

    rep.print_and_exit()


if __name__ == "__main__":
    main()

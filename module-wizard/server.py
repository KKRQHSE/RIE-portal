# -*- coding: utf-8 -*-
"""
QVOX Module-wizard — minimale lokale HTTP-server.

- Draait op http://localhost:8765
- GET  /            -> serveert index.html
- GET  /bibliotheek -> serveert de vragenbibliotheek (JSON)
- POST /genereer    -> stuurt intake + observaties + foto's naar de Anthropic API
                       (claude-sonnet-4-6) en geeft de gegenereerde concept-dataset terug
- CORS voor localhost

Vereist eenmalig:  pip install anthropic
En een API-sleutel in de omgeving:  set ANTHROPIC_API_KEY=sk-ant-...
"""

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

PORT = 8765
MODEL = "claude-sonnet-4-6"          # exact door Kees gekozen model
MAX_TOKENS = 64000                   # ruime marge voor een volledige dataset (streaming)

# De vragenbibliotheek: eerst het door de opdracht opgegeven pad, anders de repo-root.
BIBLIOTHEEK_PADEN = [
    REPO / "data" / "vragenbibliotheek.json",
    REPO / "vragenbibliotheek.json",
]

INDEX_HTML = HERE / "index.html"

# ---------------------------------------------------------------------------
# Systeemprompt voor de generatie (letterlijk volgens de opdracht).
# ---------------------------------------------------------------------------
SYSTEEMPROMPT = """Je bent een RI&E-expert die op basis van een intake en observaties een volledige concept-dataset genereert voor een getoetste RI&E. Je werkt voor Kees Kraaiveld, HVK.

INPUT die je krijgt:
- intake.json: bedrijfsgegevens, actieve modules, werkplekken, kwetsbare groepen, aanpakniveau
- observaties: vrije tekst met wat Kees heeft gezien en gehoord per module of locatie
- fotos: foto's die Kees heeft gemaakt (beschrijf wat je ziet en koppel het aan vragen)
- vragenbibliotheek: alle 140 vragen met E-waarden en NVT-criteria (wordt apart meegestuurd)

OUTPUT: een volledige dataset.json conform het QVOX-datamodel. Per actieve module:
- intro: 2-4 zinnen bedrijfsspecifieke beschrijving op basis van de intake
- per vraag: antwoord (Ja/Nee/NVT), bevinding (2-3 zinnen, opbouwend en feitelijk), brf_categorie (alleen bij Nee), klasse (alleen bij Nee)
- Kinney per Nee: E uit de bibliotheek, B uit sectorstandaard, W=3 als standaard (bijstelbaar), R=E*B*W berekend

REGELS:
- Proportionaliteit: als een risico aantoonbaar niet aanwezig is, NVT met reden
- Bevindingen zijn zakelijk, opbouwend, niet beschuldigend, max 3-4 zinnen
- BRF-categorie is altijd een van: Inrichting arbeidsplaats / Arbeidsmiddel / Kennis ontbreekt / Gedrag / Werkorganisatie
- Klasse volgt uit R: <20=Laag, 20-70=Middel, >70=Hoog; E>=40 altijd minimaal Middel
- Schrijf nooit "intake" in bevindingen; schrijf als constatering
- Koppel foto-observaties expliciet aan vraagnummers in de bevinding

Produceer de output als een JSON-object tussen ===DATASET_START=== en ===DATASET_END==="""

DATASET_START = "===DATASET_START==="
DATASET_END = "===DATASET_END==="


def lees_bibliotheek():
    """Geef (tekst, pad) van de vragenbibliotheek, of (None, None)."""
    for pad in BIBLIOTHEEK_PADEN:
        if pad.exists():
            return pad.read_text(encoding="utf-8"), pad
    return None, None


def knip_dataset(tekst):
    """Haal het JSON-object tussen de markers uit de modeltekst en parse het."""
    start = tekst.find(DATASET_START)
    einde = tekst.find(DATASET_END)
    if start == -1 or einde == -1 or einde <= start:
        return None, "Geen ===DATASET_START/END=== markers gevonden in het antwoord."
    rauw = tekst[start + len(DATASET_START):einde].strip()
    # Soms staat het JSON in een ```json ... ``` blok — dat strippen we weg.
    if rauw.startswith("```"):
        rauw = rauw.split("\n", 1)[1] if "\n" in rauw else rauw
        if rauw.endswith("```"):
            rauw = rauw[: rauw.rfind("```")]
        rauw = rauw.strip()
    try:
        return json.loads(rauw), None
    except json.JSONDecodeError as e:
        return None, f"Kon de dataset-JSON niet parsen: {e}"


def genereer(intake, observaties, fotos):
    """Roep de Anthropic API aan en geef (dataset, rauw_tekst, usage, fout)."""
    bibliotheek, _ = lees_bibliotheek()
    if bibliotheek is None:
        return None, None, None, "vragenbibliotheek.json niet gevonden."

    try:
        import anthropic
    except ImportError:
        return None, None, None, "Module 'anthropic' ontbreekt. Voer eerst uit: pip install anthropic"

    try:
        client = anthropic.Anthropic()  # leest ANTHROPIC_API_KEY uit de omgeving
    except Exception as e:  # noqa: BLE001
        return None, None, None, f"Kon de Anthropic-client niet starten (API-sleutel?): {e}"

    # Tekstblok met alle context.
    context = (
        "INTAKE (intake.json):\n"
        + json.dumps(intake, ensure_ascii=False, indent=2)
        + "\n\nOBSERVATIES van Kees:\n"
        + (observaties.strip() or "(geen)")
        + "\n\nVRAGENBIBLIOTHEEK (alle modules + vragen, met E-waarden en NVT-criteria):\n"
        + bibliotheek
        + "\n\nGenereer nu de volledige concept-dataset voor de actieve modules, "
        "tussen de markers zoals afgesproken."
    )

    inhoud = [{"type": "text", "text": context}]

    # Foto's als afbeeldingsblokken (met een labeltje ervoor voor de koppeling).
    for i, foto in enumerate(fotos or [], start=1):
        naam = str(foto.get("naam") or f"foto-{i}")
        media_type = str(foto.get("type") or "image/jpeg")
        data = foto.get("base64") or ""
        if not data:
            continue
        inhoud.append({"type": "text", "text": f"Foto {i}: {naam}"})
        inhoud.append({
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": data},
        })

    # Streamen (lange input + lange output) en de volledige boodschap ophalen.
    try:
        with client.messages.stream(
            model=MODEL,
            max_tokens=MAX_TOKENS,
            thinking={"type": "adaptive"},
            system=SYSTEEMPROMPT,
            messages=[{"role": "user", "content": inhoud}],
        ) as stream:
            bericht = stream.get_final_message()
    except Exception as e:  # noqa: BLE001
        return None, None, None, f"Aanroep naar de Anthropic API mislukte: {e}"

    tekst = "".join(b.text for b in bericht.content if getattr(b, "type", "") == "text")
    usage = {
        "input_tokens": getattr(bericht.usage, "input_tokens", None),
        "output_tokens": getattr(bericht.usage, "output_tokens", None),
    }
    if bericht.stop_reason == "refusal":
        return None, tekst, usage, "De API weigerde dit verzoek (stop_reason=refusal)."

    dataset, fout = knip_dataset(tekst)
    return dataset, tekst, usage, fout


class Handler(BaseHTTPRequestHandler):
    server_version = "QVOXModuleWizard/1.0"

    # ---- helpers ----
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _stuur(self, status, body, content_type="application/json; charset=utf-8"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False)
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # rustiger log
        print("  " + (fmt % args))

    # ---- routes ----
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            if INDEX_HTML.exists():
                self._stuur(200, INDEX_HTML.read_text(encoding="utf-8"),
                            "text/html; charset=utf-8")
            else:
                self._stuur(404, {"fout": "index.html niet gevonden."})
            return
        if path == "/bibliotheek":
            tekst, pad = lees_bibliotheek()
            if tekst is None:
                self._stuur(404, {"fout": "vragenbibliotheek.json niet gevonden."})
            else:
                print(f"  bibliotheek geserveerd vanaf {pad}")
                self._stuur(200, tekst)
            return
        self._stuur(404, {"fout": "Onbekende route."})

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/genereer":
            self._stuur(404, {"fout": "Onbekende route."})
            return
        try:
            lengte = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(lengte) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._stuur(400, {"fout": "Ongeldige JSON in de aanvraag."})
            return

        intake = body.get("intake")
        if not isinstance(intake, dict):
            self._stuur(400, {"fout": "Veld 'intake' ontbreekt of is geen object."})
            return
        observaties = body.get("observaties") or ""
        fotos = body.get("fotos") or []

        print(f"  /genereer: {len(fotos)} foto('s), observaties {len(observaties)} tekens — "
              f"aanroep {MODEL} (kan even duren)…")
        dataset, rauw, usage, fout = genereer(intake, observaties, fotos)
        self._stuur(200, {"dataset": dataset, "raw": rauw, "usage": usage, "fout": fout})


def main():
    heeft_key = bool(os.environ.get("ANTHROPIC_API_KEY"))
    try:
        import anthropic  # noqa: F401
        heeft_sdk = True
    except ImportError:
        heeft_sdk = False

    bib_tekst, bib_pad = lees_bibliotheek()
    print("=" * 60)
    print("QVOX Module-wizard")
    print(f"  Server:        http://localhost:{PORT}")
    print(f"  Model:         {MODEL}")
    print(f"  Bibliotheek:   {'OK — ' + str(bib_pad) if bib_tekst else 'NIET GEVONDEN'}")
    print(f"  anthropic-SDK: {'OK' if heeft_sdk else 'ONTBREEKT  -> pip install anthropic'}")
    print(f"  API-sleutel:   {'gevonden' if heeft_key else 'NIET gezet -> set ANTHROPIC_API_KEY=...'}")
    print("=" * 60)
    print("  Open in de browser:  http://localhost:8765   (Ctrl+C om te stoppen)")

    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nGestopt.")
        server.server_close()


if __name__ == "__main__":
    main()
